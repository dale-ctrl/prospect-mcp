/**
 * Cleanup + hierarchy tools (v1.6.0).
 *
 * Soft-delete tools: `delete_task`, `delete_enquiry`, `delete_activity_note`,
 * `delete_contact`. All four use Prospect's standard pattern — calling
 * `DELETE /<EntitySet>(id)` flips `StatusFlag` from `A` → `D`. The row stays;
 * the Prospect UI treats `StatusFlag = 'D'` as deleted and excludes it from
 * default views. Hard-delete is not exposed via OData. Verified live against
 * the WCG tenant 2026-05-08.
 *
 * `delete_contact` walks active dependencies (Quotes, Leads, Tasks) and
 * refuses with a listing if any are present — protects against orphaning
 * live sales activity. Override is not provided; clean up the dependents
 * first or do it via the Prospect UI.
 *
 * Hierarchy tools: `merge_division`, `move_contact`.
 *
 * `merge_division` walks each child entity attached to the source Division
 * and PATCHes it onto the target. The Prospect OData API exposes a bound
 * `Merge` action on Division but its metadata signature doesn't declare a
 * target parameter — it's not callable from the OData surface in any
 * reliable way. Manual orchestration is the supported path.
 *
 * Children we move:
 *   - Contacts (Contact.DivisionId)
 *   - Tasks (Task.DivisionId)
 *   - Enquiries (Enquiry.DivisionId)
 *   - Notepads filtered to ObjectType=division ObjectId=<source>
 *     (contact-attached notes ride along with their contact via the
 *      Contact.DivisionId roll-up; we just re-stamp the division-bound ones)
 *   - Leads (Lead.DivisionId)
 *   - Quotes (Quote.DivisionId)
 *
 * `Quote.DivisionId`, `Lead.DivisionId`, etc. are flagged
 * `meta:UpdateVisibility="never"` in the metadata; Prospect's misleading-
 * metadata pattern (same as v1.3.2 Notepad FKs, v1.4.0 Enquiry FKs, v1.5.0
 * CampaignActivityContact) means PATCH accepts them. Each PATCH is wrapped
 * in try/catch — a single child failing doesn't abort the merge; the
 * summary lists failures so the caller can fix them by hand.
 *
 * `move_contact` PATCHes Contact.DivisionId, then re-stamps any Task /
 * Notepad rows owned by that contact whose own DivisionId column points
 * to the OLD division (those would otherwise show up under the wrong
 * division on the activity feed).
 */

import { z } from "zod";
import { getClient } from "../client.js";

// ─── Schemas ──────────────────────────────────────────────────

export const deleteTaskSchema = z.object({
  taskId: z.number().int().positive().describe("TaskId to soft-delete (sets StatusFlag='D')."),
});

export const deleteEnquirySchema = z.object({
  enquiryId: z.number().int().positive().describe("EnquiryId to soft-delete. Refuses if the enquiry has been converted to a Lead/Opportunity."),
});

export const deleteActivityNoteSchema = z.object({
  noteId: z.number().int().positive().describe("NotepadId to delete. Idempotent — already-deleted notes return a 'no change' message."),
});

export const deleteContactSchema = z.object({
  contactId: z.number().int().positive().describe(
    "ContactId to soft-delete. Refuses with a listing if the contact has live Quotes / Leads / Tasks (clean those up first or use the UI).",
  ),
});

export const mergeDivisionSchema = z.object({
  sourceDivisionId: z.number().int().positive().describe("Division being emptied — children move OUT of this one."),
  targetDivisionId: z.number().int().positive().describe("Canonical destination Division — children move INTO this one."),
  deleteSource: z.boolean().optional().default(false).describe(
    "When true, soft-delete the source Division after the merge (StatusFlag='D'). Defaults to false so the caller can verify before deletion.",
  ),
});

export const moveContactSchema = z.object({
  contactId: z.number().int().positive().describe("ContactId to move."),
  targetDivisionId: z.number().int().positive().describe("DivisionId that the contact (and its tasks/notes) should sit under."),
});

export const reparentDivisionSchema = z.object({
  divisionId: z.number().int().positive().describe("DivisionId to re-parent."),
  companyId: z.number().int().positive().describe("Target CompanyId (Trust/group). Validates the target exists and isn't deleted."),
});

// ─── Helpers ──────────────────────────────────────────────────

/**
 * Patch a child entity's parent FK and return whether it succeeded.
 * Wrapped in try/catch so a single failing row doesn't abort a bulk merge —
 * the caller summarises failures for the user.
 */
async function patchSafe(
  entitySet: string,
  id: number | string,
  body: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const client = getClient();
    await client.patch<Record<string, unknown>>(entitySet, id, body);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message.split("\n")[0] };
  }
}

interface ChildCount {
  moved: number;
  failed: number;
  failures: Array<{ id: number | string; error: string }>;
}

function fmt(label: string, c: ChildCount): string {
  if (c.moved === 0 && c.failed === 0) return `  ${label}: 0`;
  const parts = [`${c.moved} moved`];
  if (c.failed > 0) parts.push(`${c.failed} FAILED`);
  let line = `  ${label}: ${parts.join(", ")}`;
  if (c.failed > 0) {
    for (const f of c.failures.slice(0, 5)) {
      line += `\n    ✗ id=${f.id}: ${f.error}`;
    }
    if (c.failures.length > 5) line += `\n    … and ${c.failures.length - 5} more`;
  }
  return line;
}

// ─── Delete handlers ──────────────────────────────────────────

export async function deleteTask(args: z.infer<typeof deleteTaskSchema>): Promise<string> {
  const client = getClient();

  const before = await client.get<Record<string, unknown>>(
    "Tasks",
    `$filter=TaskId eq ${args.taskId}&$select=TaskId,Name,StatusFlag&$top=1`,
  );
  if (before.value.length === 0) {
    throw new Error(`Task ${args.taskId} not found.`);
  }
  if (before.value[0].StatusFlag === "D") {
    return `Task ${args.taskId} is already deleted (StatusFlag='D'). No change.`;
  }

  await client.delete("Tasks", args.taskId);
  return `Soft-deleted task ${args.taskId} ("${before.value[0].Name}"). StatusFlag → 'D'.`;
}

export async function deleteEnquiry(args: z.infer<typeof deleteEnquirySchema>): Promise<string> {
  const client = getClient();

  const enquiry = await client.getById<{
    EnquiryId: number;
    Forename?: string | null;
    Surname?: string | null;
    StatusFlag?: string;
    ConvertedDate?: string | null;
    LeadId?: number | null;
  }>(
    "Enquiries",
    args.enquiryId,
    "$select=EnquiryId,Forename,Surname,StatusFlag,ConvertedDate,LeadId",
  );

  if (enquiry.StatusFlag === "D") {
    return `Enquiry ${args.enquiryId} is already deleted. No change.`;
  }

  if (enquiry.ConvertedDate || enquiry.LeadId) {
    throw new Error(
      `Enquiry ${args.enquiryId} (${enquiry.Forename ?? ""} ${enquiry.Surname ?? ""}`.trim() +
        `) has already been converted` +
        (enquiry.LeadId ? ` (LeadId=${enquiry.LeadId}` : "") +
        (enquiry.ConvertedDate ? `, ConvertedDate=${enquiry.ConvertedDate.substring(0, 10)})` : ")") +
        `. Refusing to delete a converted enquiry — handle the downstream Lead/Opportunity first.`,
    );
  }

  await client.delete("Enquiries", args.enquiryId);
  return `Soft-deleted enquiry ${args.enquiryId} (${enquiry.Forename ?? ""} ${enquiry.Surname ?? ""}`.trim() + `).`;
}

export async function deleteActivityNote(
  args: z.infer<typeof deleteActivityNoteSchema>,
): Promise<string> {
  const client = getClient();
  const before = await client.get<Record<string, unknown>>(
    "Notepads",
    `$filter=NotepadId eq ${args.noteId}&$select=NotepadId,StatusFlag&$top=1`,
  );
  if (before.value.length === 0) {
    return `Note ${args.noteId} not found — already deleted or never existed. No change.`;
  }
  if (before.value[0].StatusFlag === "D") {
    return `Note ${args.noteId} is already deleted. No change.`;
  }

  await client.delete("Notepads", args.noteId);
  return `Soft-deleted note ${args.noteId}.`;
}

export async function deleteContact(args: z.infer<typeof deleteContactSchema>): Promise<string> {
  const client = getClient();

  const contact = await client.getById<{
    ContactId: number;
    Forename?: string | null;
    Surname?: string | null;
    StatusFlag?: string;
  }>("Contacts", args.contactId, "$select=ContactId,Forename,Surname,StatusFlag");

  if (contact.StatusFlag === "D") {
    return `Contact ${args.contactId} is already deleted. No change.`;
  }

  // Walk active dependents — only count rows still active (StatusFlag != 'D')
  // and not on a closed/cancelled state. We accept some tolerance on Quote
  // status since the user might want to reuse the contact for archived
  // quotes; the strict guard here is that ANY non-D Quote/Lead/Task
  // associated with this contact blocks the delete.
  const filterActive = `ContactId eq ${args.contactId} and StatusFlag ne 'D'`;
  const [quotes, leads, tasks] = await Promise.all([
    client.get<Record<string, unknown>>("Quotes", `$filter=${filterActive}&$select=QuoteId,Description&$top=20&$count=true`),
    client.get<Record<string, unknown>>("Leads", `$filter=${filterActive}&$select=LeadId,Description&$top=20&$count=true`),
    client.get<Record<string, unknown>>("Tasks", `$filter=${filterActive}&$select=TaskId,Name&$top=20&$count=true`),
  ]);

  const qCount = (quotes as unknown as Record<string, unknown>)["@odata.count"] as number ?? quotes.value.length;
  const lCount = (leads as unknown as Record<string, unknown>)["@odata.count"] as number ?? leads.value.length;
  const tCount = (tasks as unknown as Record<string, unknown>)["@odata.count"] as number ?? tasks.value.length;
  const total = qCount + lCount + tCount;

  if (total > 0) {
    const lines: string[] = [
      `Contact ${args.contactId} (${contact.Forename ?? ""} ${contact.Surname ?? ""}`.trim() + `) has ${total} active dependent record(s) — refusing to delete.`,
      ``,
    ];
    if (qCount > 0) {
      lines.push(`**${qCount} Quote(s):**`);
      for (const q of quotes.value.slice(0, 5)) lines.push(`  - ${q.QuoteId}: ${q.Description ?? "(no description)"}`);
      if (qCount > 5) lines.push(`  … and ${qCount - 5} more`);
    }
    if (lCount > 0) {
      lines.push(`**${lCount} Lead(s):**`);
      for (const l of leads.value.slice(0, 5)) lines.push(`  - ${l.LeadId}: ${l.Description ?? "(no description)"}`);
      if (lCount > 5) lines.push(`  … and ${lCount - 5} more`);
    }
    if (tCount > 0) {
      lines.push(`**${tCount} Task(s):**`);
      for (const t of tasks.value.slice(0, 5)) lines.push(`  - ${t.TaskId}: ${t.Name ?? "(no name)"}`);
      if (tCount > 5) lines.push(`  … and ${tCount - 5} more`);
    }
    lines.push("", "Resolve those first (close/delete/move them), then re-try delete_contact.");
    throw new Error(lines.join("\n"));
  }

  await client.delete("Contacts", args.contactId);
  return `Soft-deleted contact ${args.contactId} (${contact.Forename ?? ""} ${contact.Surname ?? ""}`.trim() + `). 0 active dependents.`;
}

// ─── Merge / move handlers ────────────────────────────────────

async function moveChildren(
  entitySet: string,
  filter: string,
  selectKey: string,
  patchBody: Record<string, unknown>,
): Promise<ChildCount> {
  const client = getClient();
  const result = await client.get<Record<string, unknown>>(
    entitySet,
    `$filter=${filter}&$select=${selectKey}&$top=500`,
  );

  let moved = 0;
  let failed = 0;
  const failures: Array<{ id: number | string; error: string }> = [];

  for (const row of result.value) {
    const id = row[selectKey] as number | string;
    const r = await patchSafe(entitySet, id, patchBody);
    if (r.ok) moved++;
    else {
      failed++;
      failures.push({ id, error: r.error });
    }
  }

  return { moved, failed, failures };
}

export async function mergeDivision(args: z.infer<typeof mergeDivisionSchema>): Promise<string> {
  const client = getClient();

  if (args.sourceDivisionId === args.targetDivisionId) {
    throw new Error("sourceDivisionId and targetDivisionId must be different.");
  }

  // Validate both exist and are active.
  const [src, tgt] = await Promise.all([
    client.getById<{ DivisionId: number; Name: string; StatusFlag: string }>(
      "Divisions",
      args.sourceDivisionId,
      "$select=DivisionId,Name,StatusFlag",
    ),
    client.getById<{ DivisionId: number; Name: string; StatusFlag: string }>(
      "Divisions",
      args.targetDivisionId,
      "$select=DivisionId,Name,StatusFlag",
    ),
  ]);
  if (src.StatusFlag === "D") throw new Error(`Source Division ${src.DivisionId} is already deleted.`);
  if (tgt.StatusFlag === "D") throw new Error(`Target Division ${tgt.DivisionId} is deleted — cannot merge into it.`);

  const filterActive = (col: string) =>
    `${col} eq ${args.sourceDivisionId} and StatusFlag ne 'D'`;

  const contacts = await moveChildren("Contacts", filterActive("DivisionId"), "ContactId",
    { DivisionId: args.targetDivisionId });
  const tasks = await moveChildren("Tasks", filterActive("DivisionId"), "TaskId",
    { DivisionId: args.targetDivisionId });
  const enquiries = await moveChildren("Enquiries", filterActive("DivisionId"), "EnquiryId",
    { DivisionId: args.targetDivisionId });
  const leads = await moveChildren("Leads", filterActive("DivisionId"), "LeadId",
    { DivisionId: args.targetDivisionId });
  const quotes = await moveChildren("Quotes", filterActive("DivisionId"), "QuoteId",
    { DivisionId: args.targetDivisionId });

  // Notepads attached to ObjectType=division ObjectId=<source>. Contact-typed
  // notes ride along with their contact and don't need re-stamping here
  // (the contact's DivisionId roll-up takes care of activity-feed visibility).
  const notes = await moveChildren(
    "Notepads",
    `DivisionId eq ${args.sourceDivisionId} and ObjectType eq 'division' and StatusFlag ne 'D'`,
    "NotepadId",
    { DivisionId: args.targetDivisionId, ObjectId: String(args.targetDivisionId) },
  );

  let sourceDeletedNote = "";
  if (args.deleteSource) {
    // Only delete if everything moved cleanly — otherwise leave the source
    // alive so the caller can investigate failures.
    const totalFailed =
      contacts.failed + tasks.failed + enquiries.failed + leads.failed + quotes.failed + notes.failed;
    if (totalFailed === 0) {
      await client.delete("Divisions", args.sourceDivisionId);
      sourceDeletedNote = `\n\nSource Division ${args.sourceDivisionId} ("${src.Name}") soft-deleted (StatusFlag='D').`;
    } else {
      sourceDeletedNote =
        `\n\n**Source NOT deleted** — ${totalFailed} child record(s) failed to move; ` +
        `re-run after resolving the failures or call delete_division explicitly when satisfied.`;
    }
  }

  return [
    `Merged Division ${args.sourceDivisionId} ("${src.Name}") → ${args.targetDivisionId} ("${tgt.Name}").`,
    ``,
    `Children moved:`,
    fmt("Contacts", contacts),
    fmt("Tasks", tasks),
    fmt("Enquiries", enquiries),
    fmt("Leads", leads),
    fmt("Quotes", quotes),
    fmt("Division-bound notes", notes),
    sourceDeletedNote,
  ].filter((l) => l !== "").join("\n");
}

export async function reparentDivision(
  args: z.infer<typeof reparentDivisionSchema>,
): Promise<string> {
  const client = getClient();

  const division = await client.getById<{ DivisionId: number; Name: string; CompanyId: number; StatusFlag: string }>(
    "Divisions",
    args.divisionId,
    "$select=DivisionId,Name,CompanyId,StatusFlag",
  );
  if (division.StatusFlag === "D") {
    throw new Error(`Division ${args.divisionId} is deleted.`);
  }
  if (division.CompanyId === args.companyId) {
    return `Division ${args.divisionId} ("${division.Name}") is already under Company ${args.companyId}. No change.`;
  }

  const target = await client.getById<{ CompanyId: number; Name: string | null; StatusFlag: string }>(
    "Companies",
    args.companyId,
    "$select=CompanyId,Name,StatusFlag",
  );
  if (target.StatusFlag === "D") {
    throw new Error(`Target Company ${args.companyId} is deleted — cannot re-parent to it.`);
  }

  await client.patch<Record<string, unknown>>("Divisions", args.divisionId, {
    CompanyId: args.companyId,
  });

  return `Re-parented Division ${args.divisionId} ("${division.Name}") from Company ${division.CompanyId} → Company ${args.companyId} ("${target.Name ?? "(unnamed)"}").`;
}

export async function moveContact(args: z.infer<typeof moveContactSchema>): Promise<string> {
  const client = getClient();

  const contact = await client.getById<{
    ContactId: number;
    DivisionId: number;
    Forename?: string | null;
    Surname?: string | null;
    StatusFlag?: string;
  }>("Contacts", args.contactId, "$select=ContactId,DivisionId,Forename,Surname,StatusFlag");

  if (contact.StatusFlag === "D") {
    throw new Error(`Contact ${args.contactId} is deleted — restore it first.`);
  }
  if (contact.DivisionId === args.targetDivisionId) {
    return `Contact ${args.contactId} is already on Division ${args.targetDivisionId}. No change.`;
  }

  // Validate target Division.
  const tgt = await client.getById<{ DivisionId: number; Name: string; StatusFlag: string }>(
    "Divisions",
    args.targetDivisionId,
    "$select=DivisionId,Name,StatusFlag",
  );
  if (tgt.StatusFlag === "D") {
    throw new Error(`Target Division ${args.targetDivisionId} is deleted.`);
  }

  const fromDiv = contact.DivisionId;

  // Move the contact itself.
  await client.patch<Record<string, unknown>>("Contacts", args.contactId, {
    DivisionId: args.targetDivisionId,
  });

  // Re-stamp any tasks/notes whose own DivisionId pointed at the OLD division.
  // (Tasks and Notepads are duplicated FKs — the contact link is enough for
  // most queries, but the activity feed reads the row's own DivisionId for
  // grouping.)
  const tasks = await moveChildren(
    "Tasks",
    `ContactId eq ${args.contactId} and DivisionId eq ${fromDiv} and StatusFlag ne 'D'`,
    "TaskId",
    { DivisionId: args.targetDivisionId },
  );
  const notes = await moveChildren(
    "Notepads",
    `ContactId eq ${args.contactId} and DivisionId eq ${fromDiv} and StatusFlag ne 'D'`,
    "NotepadId",
    { DivisionId: args.targetDivisionId },
  );

  return [
    `Moved contact ${args.contactId} (${contact.Forename ?? ""} ${contact.Surname ?? ""}`.trim() +
      `) from Division ${fromDiv} → ${args.targetDivisionId} ("${tgt.Name}").`,
    fmt("Contact-owned tasks re-stamped", tasks),
    fmt("Contact-owned notes re-stamped", notes),
  ].join("\n");
}
