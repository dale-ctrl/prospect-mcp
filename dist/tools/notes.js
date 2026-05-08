/**
 * MCP tool handlers for activity notes (Prospect "Notepads" entity).
 *
 * Notepads back the activity-feed notes you see in the Prospect UI when you
 * open a Division, Contact, Lead, Enquiry, or Quote. The OData entity is
 * `Notepads`; ObjectType + ObjectId is the polymorphic link to the parent
 * record.
 *
 * Write recipe (verified live against the WCG tenant 2026-05-08):
 *
 * - All targets: send `ObjectType` (lowercase: division|contact|lead|enquiry|quote),
 *   `ObjectId` (string-form numeric id), `Text`, plus optional UserCode /
 *   DateTime / Visibility / Pinned / External / Tags / Recall fields.
 * - Parent FK columns (`ContactId`, `DivisionId`, `EnquiryId`) are flagged
 *   `UpdateVisibility="never"` in the metadata, but POST accepts them — and
 *   the activity feed needs them populated for cross-entity rollup. So we
 *   resolve and set them server-side at create time:
 *     · contact note → set ContactId + DivisionId (looked up from Contact)
 *     · lead note    → set DivisionId (looked up from Lead)
 *     · enquiry note → set EnquiryId + DivisionId (looked up from Enquiry)
 *     · quote note   → set DivisionId (looked up from Quote)
 *     · division note → set DivisionId (= the target itself)
 * - If we don't set DivisionId, the note still attaches to the immediate
 *   parent but won't bubble up to the Division activity feed. Real notes
 *   created via the UI always have DivisionId set, so we mirror that.
 */
import { z } from "zod";
import { getClient, loadCredentials } from "../client.js";
// ─── Helpers ──────────────────────────────────────────────────
const OBJECT_TYPES = ["division", "contact", "lead", "enquiry", "quote"];
// Look up the parent DivisionId (and any sibling FKs) for a given target so
// the new note shows up at the right level of the activity feed. Throws if
// the target doesn't exist — better to fail fast than create an orphan note.
async function resolveParentFKs(objectType, objectId) {
    const client = getClient();
    switch (objectType) {
        case "division": {
            // Validate it exists.
            await client.getById("Divisions", objectId, "$select=DivisionId");
            return { DivisionId: objectId, ContactId: null, EnquiryId: null };
        }
        case "contact": {
            const c = await client.getById("Contacts", objectId, "$select=ContactId,DivisionId");
            return { DivisionId: c.DivisionId ?? null, ContactId: c.ContactId, EnquiryId: null };
        }
        case "lead": {
            const l = await client.getById("Leads", objectId, "$select=LeadId,DivisionId");
            return { DivisionId: l.DivisionId ?? null, ContactId: null, EnquiryId: null };
        }
        case "enquiry": {
            const e = await client.getById("Enquiries", objectId, "$select=EnquiryId,DivisionId");
            return { DivisionId: e.DivisionId ?? null, ContactId: null, EnquiryId: e.EnquiryId };
        }
        case "quote": {
            const q = await client.getById("Quotes", objectId, "$select=QuoteId,DivisionId");
            return { DivisionId: q.DivisionId ?? null, ContactId: null, EnquiryId: null };
        }
    }
}
async function resolveUser(input) {
    const client = getClient();
    const result = await client.get("Users", "$select=UserCode,UserName&$filter=Obsolete eq 0");
    const trimmed = input.trim().toUpperCase();
    const byCode = result.value.find((u) => u.UserCode.toUpperCase() === trimmed);
    if (byCode)
        return byCode.UserCode;
    const byName = result.value.find((u) => (u.UserName || "").toUpperCase().includes(trimmed));
    if (byName)
        return byName.UserCode;
    return input;
}
// ─── Schemas ──────────────────────────────────────────────────
export const createActivityNoteSchema = z.object({
    objectType: z.enum(OBJECT_TYPES).describe("What the note is attached to. One of: division, contact, lead, enquiry, quote."),
    objectId: z.number().int().positive().describe("Numeric ID of the parent record (DivisionId, ContactId, LeadId, EnquiryId, or QuoteId)."),
    text: z.string().min(1).max(32767).describe("The note body. Plain text; up to 32,767 characters."),
    dateTime: z.string().optional().describe("When the note is for (ISO timestamp). Defaults to now. Distinct from the audit Created timestamp."),
    pinned: z.boolean().optional().default(false).describe("Pin to the top of the activity feed for this record."),
    tags: z.string().optional().describe("Tag string (free-form / comma-separated)."),
    external: z.boolean().optional().default(false).describe("Mark as external/customer-visible. Defaults to false (internal-only)."),
    visibility: z.number().int().optional().default(0).describe("Visibility code. 0 = standard. Higher values restrict who sees the note."),
    recallUser: z.string().optional().describe("User to recall (follow up). Name or code. Optional — set if you want a follow-up reminder."),
    recallDateTime: z.string().optional().describe("When to recall the note (ISO timestamp). Required if recallUser is set."),
    userCode: z.string().optional().describe("Author of the note (CRM user code). Defaults to the connector's PROSPECT_USER_ID. Override only when filing on someone else's behalf."),
});
export const searchActivityNotesSchema = z.object({
    divisionId: z.number().optional().describe("Filter by DivisionId (covers all notes attached to records under that division)."),
    contactId: z.number().optional().describe("Filter by ContactId."),
    enquiryId: z.number().optional().describe("Filter by EnquiryId."),
    objectType: z.enum(OBJECT_TYPES).optional().describe("Filter by object type."),
    objectId: z.number().optional().describe("Filter by ObjectId. Combine with objectType for an exact-target query."),
    user: z.string().optional().describe("Filter by author — name or code."),
    pinnedOnly: z.boolean().optional().default(false).describe("Only return pinned notes."),
    dateFrom: z.string().optional().describe("DateTime on or after (ISO)."),
    dateTo: z.string().optional().describe("DateTime on or before (ISO)."),
    top: z.number().optional().default(30).describe("Max results (default 30)."),
});
// ─── Handlers ─────────────────────────────────────────────────
export async function createActivityNote(args) {
    const client = getClient();
    const fks = await resolveParentFKs(args.objectType, args.objectId);
    // Default author = the connector's resolved user (env first, then
    // ~/.prospect-crm/config.json — same chain as the rest of the server).
    let defaultUserCode = "";
    try {
        defaultUserCode = (loadCredentials().PROSPECT_USER_ID || "").toUpperCase();
    }
    catch { /* PAT missing — already surfaced elsewhere */ }
    const userCode = args.userCode
        ? await resolveUser(args.userCode)
        : (defaultUserCode || undefined);
    if (args.recallUser && !args.recallDateTime) {
        throw new Error("recallDateTime is required when recallUser is set.");
    }
    const recallUserCode = args.recallUser ? await resolveUser(args.recallUser) : undefined;
    const body = {
        ObjectType: args.objectType,
        ObjectId: String(args.objectId),
        Text: args.text,
        DateTime: args.dateTime || new Date().toISOString(),
        Pinned: args.pinned,
        External: args.external ? 1 : 0,
        Visibility: args.visibility ?? 0,
    };
    if (userCode)
        body.UserCode = userCode;
    if (fks.DivisionId !== null)
        body.DivisionId = fks.DivisionId;
    if (fks.ContactId !== null)
        body.ContactId = fks.ContactId;
    if (fks.EnquiryId !== null)
        body.EnquiryId = fks.EnquiryId;
    if (args.tags)
        body.Tags = args.tags;
    if (recallUserCode)
        body.RecallUserCode = recallUserCode;
    if (args.recallDateTime)
        body.RecallDateTime = args.recallDateTime;
    const created = await client.post("Notepads", body);
    const refs = [];
    if (created.DivisionId)
        refs.push(`DivisionId=${created.DivisionId}`);
    if (created.ContactId)
        refs.push(`ContactId=${created.ContactId}`);
    if (created.EnquiryId)
        refs.push(`EnquiryId=${created.EnquiryId}`);
    return [
        `Created activity note ${created.NotepadId} on ${args.objectType} ${args.objectId}.`,
        refs.length > 0 ? `Linked to: ${refs.join(", ")}.` : "",
        `Visible in the activity feed for this record (and any parent record sharing the resolved FKs).`,
    ].filter(Boolean).join("\n");
}
export async function searchActivityNotes(args) {
    const client = getClient();
    const filters = [];
    if (args.divisionId)
        filters.push(`DivisionId eq ${args.divisionId}`);
    if (args.contactId)
        filters.push(`ContactId eq ${args.contactId}`);
    if (args.enquiryId)
        filters.push(`EnquiryId eq ${args.enquiryId}`);
    if (args.objectType)
        filters.push(`ObjectType eq '${args.objectType}'`);
    if (args.objectId !== undefined)
        filters.push(`ObjectId eq '${args.objectId}'`);
    if (args.pinnedOnly)
        filters.push(`Pinned eq true`);
    if (args.dateFrom)
        filters.push(`DateTime ge ${args.dateFrom}`);
    if (args.dateTo)
        filters.push(`DateTime le ${args.dateTo}`);
    if (args.user) {
        const code = await resolveUser(args.user);
        filters.push(`UserCode eq '${code.replace(/'/g, "''")}'`);
    }
    const params = [
        filters.length > 0 ? `$filter=${filters.join(" and ")}` : "",
        `$select=NotepadId,ObjectType,ObjectId,DivisionId,ContactId,EnquiryId,UserCode,DateTime,Created,Text,Pinned,External,Tags,RecallUserCode,RecallDateTime`,
        `$orderby=DateTime desc`,
        `$top=${args.top || 30}`,
    ].filter(Boolean).join("&");
    const result = await client.get("Notepads", params);
    if (result.value.length === 0)
        return "No activity notes found.";
    const lines = result.value.map((n) => {
        const dt = n.DateTime?.substring(0, 16).replace("T", " ") || n.Created?.substring(0, 16).replace("T", " ") || "N/A";
        const target = `${n.ObjectType}:${n.ObjectId}`;
        const pinned = n.Pinned ? " 📌" : "";
        const recall = n.RecallUserCode
            ? ` | recall ${n.RecallUserCode} @ ${n.RecallDateTime?.substring(0, 16).replace("T", " ") || "?"}`
            : "";
        const text = (n.Text || "").replace(/\s+/g, " ").trim();
        const truncated = text.length > 200 ? text.slice(0, 200) + "…" : text;
        return `**${dt}**${pinned} ${target} by ${n.UserCode || "?"}${recall}\n  ${truncated}`;
    });
    return `Activity notes (${result.value.length}):\n\n${lines.join("\n\n")}`;
}
//# sourceMappingURL=notes.js.map