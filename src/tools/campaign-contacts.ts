/**
 * MCP tool handlers for managing the target-contact roster on a campaign
 * activity. This is the OTHER half of the campaign workflow that v1.4.0
 * left out — v1.4.0 added enquiry → campaign linkage, this adds contact
 * roster management for the same activity.
 *
 * In the Prospect UI this is the "Target Contacts" panel inside a campaign
 * activity. The OData entity is `CampaignActivityContact` (collection
 * `CampaignActivityContacts`) — a join table with composite key
 * (CampaignActivityId, ContactId).
 *
 * Verified live against the WCG tenant 2026-05-08:
 *
 * - POST `/CampaignActivityContacts { CampaignActivityId, ContactId,
 *   Comments? }` succeeds. CreatedByUserId / LastUpdatedByUserId auto-set
 *   to the API user.
 * - The server is idempotent on duplicate POST — re-posting the same
 *   composite key returns 2xx without error and without creating a second
 *   row. We still defensively check before posting so we can return a
 *   clear "no change" message.
 * - DELETE uses the composite-key URL form
 *   `/CampaignActivityContacts(CampaignActivityId=X,ContactId=Y)` — passed
 *   to `client.delete(entitySet, idAsString)` because the existing client
 *   wraps id in parens already.
 *
 * Note: the OData metadata declares fields like `ResponseDate` /
 * `ResponseCode` on related-but-different entities. They are NOT on
 * `CampaignActivityContact`. The pre-existing `get_campaign_activity_contacts`
 * tool was selecting those fields anyway and the server silently ignored
 * them — preserving that quirky behaviour for backwards compat. The new
 * `list_campaign_contacts` tool here uses the actual entity shape.
 */

import { z } from "zod";
import { getClient } from "../client.js";
import { resolveCampaignActivity, loadCampaignActivities } from "./campaign-enquiry.js";

// ─── Helpers ──────────────────────────────────────────────────

interface CampaignActivityContactRow {
  CampaignActivityId: number;
  ContactId: number;
  Comments?: string | null;
  Created?: string | null;
  CreatedByUserId?: string | null;
  LastUpdated?: string | null;
  LastUpdatedByUserId?: string | null;
}

async function findExistingMembership(
  campaignActivityId: number,
  contactId: number,
): Promise<CampaignActivityContactRow | undefined> {
  const client = getClient();
  const r = await client.get<CampaignActivityContactRow>(
    "CampaignActivityContacts",
    `$filter=CampaignActivityId eq ${campaignActivityId} and ContactId eq ${contactId}&$top=1`,
  );
  return r.value[0];
}

// ─── Schemas ──────────────────────────────────────────────────

export const addContactToCampaignSchema = z.object({
  contactId: z.number().int().positive().describe("ContactId to add to the campaign roster."),
  campaignId: z.number().int().positive().describe("CampaignId hosting the activity."),
  campaignActivityId: z.number().int().positive().optional().describe(
    "Specific CampaignActivityId. Optional — defaults to the campaign's lowest-id activity.",
  ),
  comments: z.string().optional().describe(
    "Optional Comments field on the join row (free text, up to 32,767 chars). Useful for tagging the source of the import (e.g. 'S&A Show 2026 lead-load').",
  ),
});

export const removeContactFromCampaignSchema = z.object({
  contactId: z.number().int().positive().describe("ContactId to remove."),
  campaignId: z.number().int().positive().describe("CampaignId hosting the activity."),
  campaignActivityId: z.number().int().positive().optional().describe(
    "Specific CampaignActivityId. Optional — defaults to the campaign's lowest-id activity.",
  ),
});

export const listCampaignContactsSchema = z.object({
  campaignId: z.number().int().positive().describe("CampaignId to list."),
  campaignActivityId: z.number().int().positive().optional().describe(
    "Specific CampaignActivityId. Optional — defaults to the campaign's lowest-id activity.",
  ),
  top: z.number().int().positive().optional().default(200).describe(
    "Max rows to return (default 200). Prospect's API caps a single page at 500.",
  ),
});

// ─── Handlers ─────────────────────────────────────────────────

export async function addContactToCampaign(
  args: z.infer<typeof addContactToCampaignSchema>,
): Promise<string> {
  const client = getClient();

  // Validate contact exists.
  await client.getById<{ ContactId: number }>("Contacts", args.contactId, "$select=ContactId");

  // Resolve activity (validates campaign exists too).
  const activity = await resolveCampaignActivity(args.campaignId, args.campaignActivityId);

  const existing = await findExistingMembership(activity.CampaignActivityId, args.contactId);
  if (existing) {
    return [
      `No change — contact ${args.contactId} is already on the roster for activity ` +
        `${activity.CampaignActivityId}${activity.Description ? ` ("${activity.Description}")` : ""}.`,
      existing.Comments ? `Existing comment: "${existing.Comments}".` : "",
    ].filter(Boolean).join("\n");
  }

  const body: Record<string, unknown> = {
    CampaignActivityId: activity.CampaignActivityId,
    ContactId: args.contactId,
  };
  if (args.comments) body.Comments = args.comments;

  await client.post<CampaignActivityContactRow>("CampaignActivityContacts", body);

  return `Added contact ${args.contactId} to campaign ${args.campaignId} via activity ` +
    `${activity.CampaignActivityId}${activity.Description ? ` ("${activity.Description}")` : ""}.` +
    (args.campaignActivityId === undefined
      ? `\n(No campaignActivityId supplied — defaulted to the campaign's lowest-id activity.)`
      : "");
}

export async function removeContactFromCampaign(
  args: z.infer<typeof removeContactFromCampaignSchema>,
): Promise<string> {
  const client = getClient();

  // Resolve activity. We don't strictly need to validate the contact exists —
  // we just check there's a row to delete.
  const activity = await resolveCampaignActivity(args.campaignId, args.campaignActivityId);

  const existing = await findExistingMembership(activity.CampaignActivityId, args.contactId);
  if (!existing) {
    return `No change — contact ${args.contactId} is not on the roster for activity ` +
      `${activity.CampaignActivityId}${activity.Description ? ` ("${activity.Description}")` : ""}.`;
  }

  // Composite-key DELETE: pass the composite-key tuple as the id string and
  // let client.delete wrap it in parens (URL becomes
  // `/CampaignActivityContacts(CampaignActivityId=X,ContactId=Y)`).
  const compositeKey = `CampaignActivityId=${activity.CampaignActivityId},ContactId=${args.contactId}`;
  await client.delete("CampaignActivityContacts", compositeKey);

  return `Removed contact ${args.contactId} from campaign ${args.campaignId} via activity ` +
    `${activity.CampaignActivityId}${activity.Description ? ` ("${activity.Description}")` : ""}.`;
}

export async function listCampaignContacts(
  args: z.infer<typeof listCampaignContactsSchema>,
): Promise<string> {
  const client = getClient();
  const activity = await resolveCampaignActivity(args.campaignId, args.campaignActivityId);

  const params = [
    `$filter=CampaignActivityId eq ${activity.CampaignActivityId}`,
    `$expand=Contact($select=ContactId,Forename,Surname,Email,JobTitle;$expand=Division($select=DivisionId,Name))`,
    `$select=CampaignActivityId,ContactId,Comments,Created,CreatedByUserId`,
    `$orderby=Created desc`,
    `$top=${args.top ?? 200}`,
    `$count=true`,
  ].join("&");

  const result = await client.get<Record<string, unknown>>("CampaignActivityContacts", params);
  const total = (result as unknown as Record<string, unknown>)["@odata.count"] as number | undefined;
  const rows = result.value;

  if (rows.length === 0) {
    return `No contacts on the roster for activity ${activity.CampaignActivityId}` +
      (activity.Description ? ` ("${activity.Description}")` : "") +
      ` under campaign ${args.campaignId}.`;
  }

  const lines = rows.map((r) => {
    const contact = r.Contact as Record<string, unknown> | null;
    const name = contact ? `${contact.Forename || ""} ${contact.Surname || ""}`.trim() || "(no name)" : "(contact deleted)";
    const division = (contact?.Division as Record<string, unknown>)?.Name || "—";
    const job = contact?.JobTitle ? ` [${contact.JobTitle}]` : "";
    const comment = r.Comments ? ` — "${(r.Comments as string).replace(/\s+/g, " ").slice(0, 80)}"` : "";
    const added = (r.Created as string)?.substring(0, 10) || "?";
    return `- **${name}**${job} @ ${division} (ContactId ${r.ContactId})${comment} — added ${added} by ${r.CreatedByUserId || "?"}`;
  });

  const header = `## Roster for activity ${activity.CampaignActivityId}` +
    (activity.Description ? ` ("${activity.Description}")` : "") +
    ` (campaign ${args.campaignId}) — ${rows.length}${total !== undefined ? ` of ${total}` : ""}`;
  return [header, ...lines].join("\n");
}

// Re-export so index.ts can import the campaign-activity helpers from a single
// surface if it ever wants them. Kept minimal — only what's currently used.
export { loadCampaignActivities };
