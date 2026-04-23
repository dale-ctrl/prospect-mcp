/**
 * MCP tool handlers for profiling data — RFM analysis, Xtra/custom fields,
 * and contact profiling/recall data.
 */

import { z } from "zod";
import { getClient } from "../client.js";

// ─── Schemas ──────────────────────────────────────────────────

export const getDivisionRfmSchema = z.object({
  divisionId: z.number().describe("DivisionId to get RFM data for. The SalesLedgerId is looked up automatically."),
});

export const getXtraFieldsSchema = z.object({
  entityType: z.enum([
    "QuoteXtras", "ContactXtras", "DivisionXtras", "LeadXtras",
    "CampaignXtras", "BookingXtras", "ContractXtras",
  ]).describe("Which Xtra entity set to query"),
  parentId: z.union([z.number(), z.string()]).describe("The parent entity ID (e.g. QuoteId, ContactId, DivisionId)"),
});

export const getContactProfilingSchema = z.object({
  contactId: z.number().describe("ContactId to get profiling/recall data for"),
});

// ─── Helpers ──────────────────────────────────────────────────

/** Build a select string for all standard Xtra fields */
function xtraSelectFields(): string {
  const fields: string[] = [];
  for (let i = 1; i <= 10; i++) {
    fields.push(`StandardTextField${i}`);
    fields.push(`StandardDecimalField${i}`);
  }
  for (let i = 1; i <= 5; i++) {
    fields.push(`StandardDateField${i}`);
    fields.push(`StandardBooleanField${i}`);
  }
  return fields.join(",");
}

/** Format Xtra fields into readable output */
function formatXtraFields(data: Record<string, unknown>): string {
  const lines: string[] = [];

  for (let i = 1; i <= 10; i++) {
    const textVal = data[`StandardTextField${i}`];
    if (textVal != null && textVal !== "") {
      lines.push(`**Text ${i}:** ${textVal}`);
    }
    const decVal = data[`StandardDecimalField${i}`];
    if (decVal != null) {
      lines.push(`**Decimal ${i}:** ${decVal}`);
    }
  }
  for (let i = 1; i <= 5; i++) {
    const dateVal = data[`StandardDateField${i}`];
    if (dateVal != null) {
      lines.push(`**Date ${i}:** ${(dateVal as string)?.substring(0, 10) || dateVal}`);
    }
    const boolVal = data[`StandardBooleanField${i}`];
    if (boolVal != null) {
      lines.push(`**Boolean ${i}:** ${boolVal}`);
    }
  }

  return lines.length > 0 ? lines.join("\n") : "(no custom fields set)";
}

// ─── Handlers ─────────────────────────────────────────────────

export async function getDivisionRfm(args: z.infer<typeof getDivisionRfmSchema>): Promise<string> {
  const client = getClient();

  // Look up the SalesLedgerId from the Division
  const div = await client.getById<Record<string, unknown>>(
    "Divisions", args.divisionId, "$select=DivisionId,Name,SalesLedgerId"
  );

  const salesLedgerId = div.SalesLedgerId as string | null;
  if (!salesLedgerId) {
    return `Division #${args.divisionId} (${div.Name || "N/A"}) has no SalesLedgerId — RFM data requires an account code.`;
  }

  // Query DivisionRfm using SalesLedgerId
  const result = await client.get<Record<string, unknown>>(
    "DivisionRfm",
    `$filter=SalesLedgerId eq '${salesLedgerId}'`
  );

  if (result.value.length === 0) {
    return `No RFM data found for ${div.Name} (Account: ${salesLedgerId}).`;
  }

  const rfm = result.value[0];

  return [
    `# RFM Analysis — ${div.Name}`,
    `**DivisionId:** ${args.divisionId}`,
    `**Account Code:** ${salesLedgerId}`,
    "",
    `## Recency`,
    `- Days: ${rfm.RecencyDays ?? "N/A"}`,
    `- Weeks: ${rfm.RecencyWeeks ?? "N/A"}`,
    `- Months: ${rfm.RecencyMonths ?? "N/A"}`,
    `- Rank: ${rfm.RecencyRank ?? "N/A"}`,
    "",
    `## Frequency`,
    `- Order Count: ${rfm.OrderCount ?? "N/A"}`,
    `- Frequency: ${rfm.Frequency ?? "N/A"}`,
    `- Rank: ${rfm.FrequencyRank ?? "N/A"}`,
    "",
    `## Monetary Value`,
    rfm.TotalOrderValue != null ? `- Total Order Value: £${(rfm.TotalOrderValue as number).toFixed(2)}` : "",
    `- Rank: ${rfm.MonetaryValueRank ?? "N/A"}`,
  ].filter(Boolean).join("\n");
}

export async function getXtraFields(args: z.infer<typeof getXtraFieldsSchema>): Promise<string> {
  const client = getClient();

  // Determine the parent key field name based on entity type
  const parentKeyMap: Record<string, string> = {
    QuoteXtras: "QuoteId",
    ContactXtras: "ContactId",
    DivisionXtras: "DivisionId",
    LeadXtras: "LeadId",
    CampaignXtras: "CampaignId",
    BookingXtras: "BookingId",
    ContractXtras: "ContractId",
  };

  const parentKey = parentKeyMap[args.entityType];
  if (!parentKey) {
    return `Unknown Xtra entity type: ${args.entityType}`;
  }

  const selectFields = `${parentKey},${xtraSelectFields()}`;
  const filter = `${parentKey} eq ${args.parentId}`;

  const result = await client.get<Record<string, unknown>>(
    args.entityType,
    `$filter=${filter}&$select=${selectFields}`
  );

  if (result.value.length === 0) {
    return `No Xtra/custom field data found for ${args.entityType} with ${parentKey}=${args.parentId}.`;
  }

  const data = result.value[0];

  return [
    `# Custom Fields — ${args.entityType}`,
    `**${parentKey}:** ${args.parentId}`,
    "",
    formatXtraFields(data),
  ].join("\n");
}

export async function getContactProfiling(args: z.infer<typeof getContactProfilingSchema>): Promise<string> {
  const client = getClient();

  const result = await client.get<Record<string, unknown>>(
    "ContactProfiling",
    `$filter=ContactId eq ${args.contactId}`
  );

  if (result.value.length === 0) {
    return `No profiling/recall data found for ContactId ${args.contactId}.`;
  }

  // Format all fields from the profiling data
  const data = result.value[0];
  const lines: string[] = [
    `# Contact Profiling — ContactId ${args.contactId}`,
    "",
  ];

  // Output all non-null fields
  for (const [key, value] of Object.entries(data)) {
    if (value != null && key !== "ContactId" && key !== "@odata.etag") {
      if (typeof value === "string" && value.includes("T") && value.includes("-")) {
        lines.push(`**${key}:** ${value.substring(0, 10)}`);
      } else {
        lines.push(`**${key}:** ${value}`);
      }
    }
  }

  return lines.length > 2 ? lines.join("\n") : `Contact profiling record exists for ContactId ${args.contactId} but has no data set.`;
}
