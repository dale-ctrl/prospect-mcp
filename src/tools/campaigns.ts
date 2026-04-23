/**
 * MCP tool handlers for Campaign and Campaign Activity operations.
 * Campaigns contain Activities, which target contacts for marketing outreach.
 */

import { z } from "zod";
import { getClient } from "../client.js";

// ─── Schemas ──────────────────────────────────────────────────

export const searchCampaignsSchema = z.object({
  description: z.string().optional().describe("Search in campaign name/description (partial match)"),
  dateFrom: z.string().optional().describe("Campaigns starting on or after (ISO date)"),
  dateTo: z.string().optional().describe("Campaigns starting on or before (ISO date)"),
  top: z.number().optional().default(20).describe("Max results (default 20)"),
});

export const getCampaignSchema = z.object({
  campaignId: z.number().describe("The CampaignId to retrieve"),
});

export const searchCampaignActivitiesSchema = z.object({
  campaignId: z.number().optional().describe("Filter by parent CampaignId"),
  description: z.string().optional().describe("Search in activity description (partial match)"),
  dateFrom: z.string().optional().describe("Activities starting on or after (ISO date)"),
  dateTo: z.string().optional().describe("Activities starting on or before (ISO date)"),
  top: z.number().optional().default(20).describe("Max results (default 20)"),
});

export const getCampaignActivityContactsSchema = z.object({
  campaignActivityId: z.number().describe("The CampaignActivityId to list contacts for"),
  top: z.number().optional().default(50).describe("Max contacts to return (default 50)"),
});

export const createCampaignSchema = z.object({
  description: z.string().describe("Campaign name/description"),
  startDate: z.string().describe("Campaign start date (ISO format)"),
  managedById: z.string().describe("Campaign manager — user code or name"),
  endDate: z.string().optional().describe("Campaign end date (ISO format)"),
  totalBudget: z.number().optional().describe("Total budget amount"),
  detailedDescription: z.string().optional().describe("Detailed campaign description/notes"),
});

// ─── Helpers ─────────────────────────────────────────────────

async function resolveUser(input: string): Promise<string> {
  const client = getClient();
  const result = await client.get<{ UserCode: string; UserName: string }>(
    "Users", "$select=UserCode,UserName&$filter=Obsolete eq 0"
  );
  const trimmed = input.trim().toUpperCase();
  const byCode = result.value.find(u => u.UserCode.toUpperCase() === trimmed);
  if (byCode) return byCode.UserCode;
  const byName = result.value.find(u => (u.UserName || "").toUpperCase().includes(trimmed));
  if (byName) return byName.UserCode;
  return input;
}

// ─── Handlers ─────────────────────────────────────────────────

export async function createCampaign(args: z.infer<typeof createCampaignSchema>): Promise<string> {
  const client = getClient();

  const managerCode = await resolveUser(args.managedById);

  const body: Record<string, unknown> = {
    Description: args.description,
    StartDate: args.startDate,
    ManagedById: managerCode,
  };

  if (args.endDate !== undefined) body.EndDate = args.endDate;
  if (args.totalBudget !== undefined) body.TotalBudget = args.totalBudget;
  if (args.detailedDescription !== undefined) body.DetailedDescription = args.detailedDescription;

  const created = await client.post<Record<string, unknown>>("Campaigns", body);

  return [
    `Campaign created successfully!`,
    `**CampaignId:** ${created.CampaignId}`,
    `**Description:** ${created.Description || args.description}`,
    `**Start:** ${args.startDate}`,
    `**Manager:** ${managerCode}`,
    `**CRM Link:** ${created.RecordLink || "N/A"}`,
  ].join("\n");
}

export async function searchCampaigns(args: z.infer<typeof searchCampaignsSchema>): Promise<string> {
  const client = getClient();
  const filters: string[] = ["StatusFlag ne 'D'"];

  if (args.description) filters.push(`contains(Description,'${args.description}')`);
  if (args.dateFrom) filters.push(`StartDate ge ${args.dateFrom}`);
  if (args.dateTo) filters.push(`StartDate le ${args.dateTo}`);

  const expand = "ManagedBy($select=UserName)";
  const params = [
    `$filter=${filters.join(" and ")}`,
    `$expand=${expand}`,
    `$select=CampaignId,Description,StartDate,EndDate,TotalBudget,Created,RecordLink`,
    `$orderby=StartDate desc`,
    `$top=${args.top || 20}`,
  ].join("&");

  const result = await client.get<Record<string, unknown>>("Campaigns", params);
  if (result.value.length === 0) return "No campaigns found matching the criteria.";

  const lines = result.value.map((c) => {
    const manager = (c.ManagedBy as Record<string, unknown>)?.UserName || "N/A";
    const start = (c.StartDate as string)?.substring(0, 10) || "N/A";
    const end = (c.EndDate as string)?.substring(0, 10) || "ongoing";
    const budget = typeof c.TotalBudget === "number" ? `£${c.TotalBudget.toFixed(2)}` : "N/A";

    return [
      `**Campaign #${c.CampaignId}** — ${c.Description || "(untitled)"}`,
      `  Dates: ${start} → ${end} | Budget: ${budget} | Manager: ${manager}`,
      `  Link: ${c.RecordLink || "N/A"}`,
    ].join("\n");
  });

  return `Found ${result.value.length} campaign(s):\n\n${lines.join("\n\n")}`;
}

export async function getCampaign(args: z.infer<typeof getCampaignSchema>): Promise<string> {
  const client = getClient();
  const expand = [
    "ManagedBy($select=UserName)",
    "CampaignActivities($select=CampaignActivityId,Description,TargetStartDate,TargetEndDate,Cost,ActualStartDate,ActualEndDate;$orderby=TargetStartDate)",
  ].join(",");

  const c = await client.getById<Record<string, unknown>>(
    "Campaigns", args.campaignId, `$expand=${expand}`
  );

  const manager = (c.ManagedBy as Record<string, unknown>)?.UserName || "N/A";
  const activities = (c.CampaignActivities as Array<Record<string, unknown>>) || [];

  let output = [
    `# Campaign #${c.CampaignId}`,
    `**Description:** ${c.Description || "N/A"}`,
    `**Start:** ${(c.StartDate as string)?.substring(0, 10) || "N/A"}`,
    `**End:** ${(c.EndDate as string)?.substring(0, 10) || "N/A"}`,
    `**Budget:** £${typeof c.TotalBudget === "number" ? c.TotalBudget.toFixed(2) : "0.00"}`,
    `**Manager:** ${manager}`,
    `**Created:** ${(c.Created as string)?.substring(0, 10) || "N/A"}`,
    "",
    c.DetailedDescription ? `## Details\n${c.DetailedDescription}\n` : "",
    `## Activities (${activities.length})`,
  ].filter(Boolean).join("\n");

  if (activities.length > 0) {
    const actLines = activities.map((a, i) => {
      const start = (a.TargetStartDate as string)?.substring(0, 10) || "N/A";
      const end = (a.TargetEndDate as string)?.substring(0, 10) || "N/A";
      const cost = typeof a.Cost === "number" ? `£${a.Cost.toFixed(2)}` : "";
      return `${i + 1}. **${a.Description}** (ID: ${a.CampaignActivityId})\n   ${start} → ${end}${cost ? ` | Cost: ${cost}` : ""}`;
    });
    output += "\n" + actLines.join("\n\n");
  } else {
    output += "\n(no activities)";
  }

  output += `\n\n**CRM Link:** ${c.RecordLink || "N/A"}`;
  return output;
}

export async function searchCampaignActivities(
  args: z.infer<typeof searchCampaignActivitiesSchema>
): Promise<string> {
  const client = getClient();
  const filters: string[] = ["StatusFlag ne 'D'"];

  if (args.campaignId) filters.push(`CampaignId eq ${args.campaignId}`);
  if (args.description) filters.push(`contains(Description,'${args.description}')`);
  if (args.dateFrom) filters.push(`TargetStartDate ge ${args.dateFrom}`);
  if (args.dateTo) filters.push(`TargetStartDate le ${args.dateTo}`);

  const expand = "ManagedBy($select=UserName)";
  const params = [
    `$filter=${filters.join(" and ")}`,
    `$expand=${expand}`,
    `$select=CampaignActivityId,CampaignId,Description,TargetStartDate,TargetEndDate,Cost,ActualStartDate,ActualEndDate,ObjectiveSummary`,
    `$orderby=TargetStartDate desc`,
    `$top=${args.top || 20}`,
  ].join("&");

  const result = await client.get<Record<string, unknown>>("CampaignActivities", params);
  if (result.value.length === 0) return "No campaign activities found.";

  const lines = result.value.map((a) => {
    const manager = (a.ManagedBy as Record<string, unknown>)?.UserName || "N/A";
    const start = (a.TargetStartDate as string)?.substring(0, 10) || "N/A";
    const end = (a.TargetEndDate as string)?.substring(0, 10) || "N/A";
    const actual = a.ActualStartDate ? `(actual: ${(a.ActualStartDate as string).substring(0, 10)})` : "";

    return [
      `**Activity #${a.CampaignActivityId}** — ${a.Description || "(untitled)"}`,
      `  Campaign: #${a.CampaignId} | Dates: ${start} → ${end} ${actual}`,
      `  Manager: ${manager} | Cost: £${typeof a.Cost === "number" ? a.Cost.toFixed(2) : "0.00"}`,
      a.ObjectiveSummary ? `  Objective: ${(a.ObjectiveSummary as string).substring(0, 100)}...` : "",
    ].filter(Boolean).join("\n");
  });

  return `Found ${result.value.length} activity(ies):\n\n${lines.join("\n\n")}`;
}

export async function getCampaignActivityContacts(
  args: z.infer<typeof getCampaignActivityContactsSchema>
): Promise<string> {
  const client = getClient();

  const expand = "Contact($select=ContactId,Forename,Surname,Email;$expand=Division($select=Name))";
  const params = [
    `$filter=CampaignActivityId eq ${args.campaignActivityId}`,
    `$expand=${expand}`,
    `$select=ContactId,ResponseDate,ResponseCode`,
    `$top=${args.top || 50}`,
  ].join("&");

  const result = await client.get<Record<string, unknown>>("CampaignActivityContacts", params);
  if (result.value.length === 0) return "No contacts found for this campaign activity.";

  const lines = result.value.map((c) => {
    const contact = c.Contact as Record<string, unknown> | null;
    const name = contact ? `${contact.Forename || ""} ${contact.Surname || ""}`.trim() : "N/A";
    const company = (contact?.Division as Record<string, unknown>)?.Name || "N/A";
    const responded = c.ResponseDate ? `Responded ${(c.ResponseDate as string).substring(0, 10)}` : "No response";

    return `- **${name}** (${contact?.ContactId || c.ContactId}) @ ${company} — ${responded}`;
  });

  return `## Contacts in Activity #${args.campaignActivityId} (${result.value.length})\n${lines.join("\n")}`;
}
