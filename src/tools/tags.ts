/**
 * MCP tool handlers for Tags and Tag Assignments.
 * Tags can be applied across entities: contacts, divisions, leads, quotes, campaigns, products, etc.
 */

import { z } from "zod";
import { getClient } from "../client.js";

// ─── Schemas ──────────────────────────────────────────────────

export const getTagsSchema = z.object({
  includeObsolete: z.boolean().optional().default(false).describe("Include obsolete tags"),
});

export const searchTagAssignmentsSchema = z.object({
  tagId: z.string().optional().describe("Filter by TagId code"),
  tagDescription: z.string().optional().describe("Filter by tag name (partial match) — resolves to TagId automatically"),
  contactId: z.number().optional().describe("Find tags on a specific contact"),
  divisionId: z.number().optional().describe("Find tags on a specific division"),
  leadId: z.number().optional().describe("Find tags on a specific lead/opportunity"),
  quoteId: z.number().optional().describe("Find tags on a specific quote"),
  productItemId: z.string().optional().describe("Find tags on a specific product"),
  top: z.number().optional().default(50).describe("Max results (default 50)"),
});

// ─── Handlers ─────────────────────────────────────────────────

export async function getTags(args: z.infer<typeof getTagsSchema>): Promise<string> {
  const client = getClient();
  const filter = args.includeObsolete ? "" : "$filter=Obsolete eq false&";
  const params = `${filter}$select=TagId,Description,Colour,EntityId&$orderby=Description`;

  const result = await client.get<Record<string, unknown>>("Tags", params);
  if (result.value.length === 0) return "No tags found.";

  const lines = result.value.map(
    (t) => `- \`${t.TagId}\` — **${t.Description}** (entity: ${t.EntityId || "any"})`
  );

  return `## Tags (${result.value.length})\n${lines.join("\n")}`;
}

export async function searchTagAssignments(args: z.infer<typeof searchTagAssignmentsSchema>): Promise<string> {
  const client = getClient();
  const filters: string[] = [];

  // Resolve tag description to TagId if needed
  let tagId = args.tagId;
  if (!tagId && args.tagDescription) {
    const tags = await client.get<{ TagId: string; Description: string }>(
      "Tags", "$select=TagId,Description&$filter=Obsolete eq false"
    );
    const search = args.tagDescription.toUpperCase();
    const match = tags.value.find(t => (t.Description || "").toUpperCase().includes(search));
    if (match) {
      tagId = match.TagId;
    } else {
      return `No tag found matching "${args.tagDescription}". Use get_tags to list available tags.`;
    }
  }

  if (tagId) filters.push(`TagId eq '${tagId}'`);
  if (args.contactId) filters.push(`ContactId eq ${args.contactId}`);
  if (args.divisionId) filters.push(`DivisionId eq ${args.divisionId}`);
  if (args.leadId) filters.push(`LeadId eq ${args.leadId}`);
  if (args.quoteId) filters.push(`QuoteId eq ${args.quoteId}`);
  if (args.productItemId) filters.push(`ProductItemId eq '${args.productItemId}'`);

  if (filters.length === 0) {
    return "Please provide at least one filter (tagId, tagDescription, contactId, divisionId, etc).";
  }

  const expand = "Tag($select=Description)";
  const params = [
    `$filter=${filters.join(" and ")}`,
    `$expand=${expand}`,
    `$select=AssignmentId,TagId,ContactId,DivisionId,LeadId,QuoteId,CampaignId,ProductItemId,ProblemId,DocumentId`,
    `$top=${args.top || 50}`,
  ].join("&");

  const result = await client.get<Record<string, unknown>>("TagAssignments", params);
  if (result.value.length === 0) return "No tag assignments found matching the criteria.";

  const lines = result.value.map((a) => {
    const tagName = (a.Tag as Record<string, unknown>)?.Description || a.TagId;
    const refs: string[] = [];
    if (a.ContactId) refs.push(`Contact #${a.ContactId}`);
    if (a.DivisionId) refs.push(`Division #${a.DivisionId}`);
    if (a.LeadId) refs.push(`Lead #${a.LeadId}`);
    if (a.QuoteId) refs.push(`Quote #${a.QuoteId}`);
    if (a.CampaignId) refs.push(`Campaign #${a.CampaignId}`);
    if (a.ProductItemId) refs.push(`Product ${a.ProductItemId}`);
    if (a.ProblemId) refs.push(`Problem #${a.ProblemId}`);
    if (a.DocumentId) refs.push(`Document #${a.DocumentId}`);

    return `- **${tagName}** → ${refs.join(", ") || "N/A"}`;
  });

  return `Tag assignments (${result.value.length}):\n\n${lines.join("\n")}`;
}
