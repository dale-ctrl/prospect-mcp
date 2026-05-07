/**
 * Extended MCP tool handlers — deep lookups for contacts, users, leads, divisions.
 * These provide the full context Claude needs when creating/managing quotes.
 */

import { z } from "zod";
import { getClient } from "../client.js";

// ─── Helpers ──────────────────────────────────────────────────

/** Format Xtra (custom field) data into readable output */
function formatXtraData(data: Record<string, unknown>): string {
  const lines: string[] = [];
  for (let i = 1; i <= 10; i++) {
    const textVal = data[`StandardTextField${i}`];
    if (textVal != null && textVal !== "") lines.push(`**Text ${i}:** ${textVal}`);
    const decVal = data[`StandardDecimalField${i}`];
    if (decVal != null) lines.push(`**Decimal ${i}:** ${decVal}`);
  }
  for (let i = 1; i <= 5; i++) {
    const dateVal = data[`StandardDateField${i}`];
    if (dateVal != null) lines.push(`**Date ${i}:** ${(dateVal as string)?.substring?.(0, 10) || dateVal}`);
    const boolVal = data[`StandardBooleanField${i}`];
    if (boolVal != null) lines.push(`**Boolean ${i}:** ${boolVal}`);
  }
  return lines.length > 0 ? lines.join("\n") : "(no custom fields set)";
}

// ─── Schemas ───────────────────────────────────────────────────

export const getContactDetailsSchema = z.object({
  contactId: z.number().describe("The ContactId to look up"),
});

export const getDivisionDetailsSchema = z.object({
  divisionId: z.number().describe("The DivisionId to look up"),
});

export const getUsersSchema = z.object({
  activeOnly: z.boolean().optional().default(true).describe("Only show active (non-obsolete) users"),
});

export const searchLeadsSchema = z.object({
  description: z.string().optional().describe("Search term for opportunity description"),
  contactName: z.string().optional().describe("Contact name linked to the opportunity"),
  divisionName: z.string().optional().describe("Company/division name"),
  responsibleUser: z.string().optional().describe("User code of responsible salesperson"),
  top: z.number().optional().default(10).describe("Max results"),
});

export const getLeadDetailsSchema = z.object({
  leadId: z.number().describe("The LeadId (opportunity) to look up"),
});

// ─── Handlers ──────────────────────────────────────────────────

/**
 * Get FULL contact details including Division, Address, and all key fields.
 * This is the go-to tool before creating a quote — gives you ContactId,
 * DivisionId, AddressId, account codes, and the full address.
 */
export async function getContactDetails(args: z.infer<typeof getContactDetailsSchema>): Promise<string> {
  const client = getClient();

  const expand = [
    "Division($select=DivisionId,Name,SalesLedgerId,AccountManager,TerritoryCode,PhoneNumber,RecordLink;$expand=Address($select=AddressId,AddressLine1,AddressLine2,AddressLine3,AddressLine4,AddressLine5,Country,Postcode))",
    "ContactXtra",
  ].join(",");

  const contact = await client.getById<Record<string, unknown>>(
    "Contacts",
    args.contactId,
    `$expand=${expand}`
  );

  const div = contact.Division as Record<string, unknown> | null;
  const addr = div?.Address as Record<string, unknown> | null;
  const xtra = contact.ContactXtra as Record<string, unknown> | null;

  const address = addr
    ? [addr.AddressLine1, addr.AddressLine2, addr.AddressLine3, addr.AddressLine4, addr.AddressLine5, addr.Postcode, addr.Country]
        .filter(Boolean).join(", ")
    : "N/A";

  const output = [
    `# Contact Details`,
    `**Name:** ${contact.Forename || ""} ${contact.Surname || ""}`.trim(),
    `**ContactId:** ${contact.ContactId}`,
    `**Email:** ${contact.Email || "N/A"}`,
    `**Phone:** ${contact.PhoneNumber || "N/A"}`,
    `**Mobile:** ${contact.MobilePhoneNumber || "N/A"}`,
    `**Job Title:** ${contact.JobTitle || "N/A"}`,
    ``,
    `## Company / Division`,
    `**Division:** ${div?.Name || "N/A"}`,
    `**DivisionId:** ${div?.DivisionId || "N/A"}`,
    `**Account Code:** ${div?.SalesLedgerId || "N/A"}`,
    `**Account Manager:** ${div?.AccountManager || "N/A"}`,
    `**Territory:** ${div?.TerritoryCode || "N/A"}`,
    `**Company Phone:** ${div?.PhoneNumber || "N/A"}`,
    ``,
    `## Address`,
    `**AddressId:** ${addr?.AddressId || "N/A"}`,
    `**Full Address:** ${address}`,
    `**Line 1:** ${addr?.AddressLine1 || "N/A"}`,
    `**Line 2:** ${addr?.AddressLine2 || "N/A"}`,
    `**Line 3:** ${addr?.AddressLine3 || "N/A"}`,
    `**Postcode:** ${addr?.Postcode || "N/A"}`,
    `**Country:** ${addr?.Country || "N/A"}`,
    ``,
    `## Links`,
    `**Contact Link:** ${contact.RecordLink || "N/A"}`,
    `**Division Link:** ${div?.RecordLink || "N/A"}`,
  ];

  if (xtra) {
    output.push("", "## Custom Fields (Xtra)");
    output.push(formatXtraData(xtra));
  }

  return output.join("\n");
}

/**
 * Get full division details with address and key contacts.
 */
export async function getDivisionDetails(args: z.infer<typeof getDivisionDetailsSchema>): Promise<string> {
  const client = getClient();

  const expand = [
    "Address($select=AddressId,AddressLine1,AddressLine2,AddressLine3,AddressLine4,AddressLine5,Country,Postcode)",
    "AccountManagerUser($select=UserCode,UserName)",
    "DivisionXtra",
  ].join(",");

  const div = await client.getById<Record<string, unknown>>(
    "Divisions",
    args.divisionId,
    `$expand=${expand}`
  );

  const addr = div.Address as Record<string, unknown> | null;
  const am = div.AccountManagerUser as Record<string, unknown> | null;
  const xtra = div.DivisionXtra as Record<string, unknown> | null;

  const address = addr
    ? [addr.AddressLine1, addr.AddressLine2, addr.AddressLine3, addr.AddressLine4, addr.AddressLine5, addr.Postcode, addr.Country]
        .filter(Boolean).join(", ")
    : "N/A";

  // Also fetch top contacts for this division
  const contacts = await client.get<Record<string, unknown>>(
    "Contacts",
    `$filter=DivisionId eq ${args.divisionId} and StatusFlag ne 'D'&$select=ContactId,Forename,Surname,Email,JobTitle,PhoneNumber&$top=10&$orderby=Surname`
  );

  const contactLines = contacts.value.map((c) => {
    const name = `${c.Forename || ""} ${c.Surname || ""}`.trim();
    return `  - ${name} (ID: ${c.ContactId}) — ${c.JobTitle || "N/A"} — ${c.Email || "N/A"}`;
  });

  // Versa Maintenance fields live on DivisionXtra.StandardTextField5/6 — surface
  // them inline so callers don't need a separate Xtra fetch (matches the
  // Versa tab in the Prospect UI).
  const equipmentMaintained = (xtra?.StandardTextField5 ?? null) as string | null;
  const totalMaintenanceValue = (xtra?.StandardTextField6 ?? null) as string | null;

  const output = [
    `# Division Details`,
    `**Name:** ${div.Name || "N/A"}`,
    `**DivisionId:** ${div.DivisionId}`,
    `**Account Code:** ${div.SalesLedgerId || "N/A"}`,
    `**Account Manager:** ${am?.UserName || div.AccountManager || "N/A"}`,
    `**Territory:** ${div.TerritoryCode || "N/A"}`,
    `**Phone:** ${div.PhoneNumber || "N/A"}`,
    `**Website:** ${div.Website || "N/A"}`,
    ``,
    `## Address`,
    `**AddressId:** ${addr?.AddressId || "N/A"}`,
    `**Full Address:** ${address}`,
    ``,
    `## Contacts (${contacts.value.length})`,
    contactLines.length > 0 ? contactLines.join("\n") : "  (none found)",
    ``,
    `**Division Link:** ${div.RecordLink || "N/A"}`,
  ];

  if (equipmentMaintained || totalMaintenanceValue) {
    output.push("", "## Versa Maintenance");
    if (equipmentMaintained) output.push(`**Equipment Maintained:** ${equipmentMaintained}`);
    if (totalMaintenanceValue) output.push(`**Total Maintenance Value:** ${totalMaintenanceValue}`);
  }

  if (xtra) {
    output.push("", "## Custom Fields (Xtra)");
    output.push(formatXtraData(xtra));
  }

  return output.join("\n");
}

/**
 * List all CRM users (salespeople). Essential for knowing valid SalesPersonId codes.
 */
export async function getUsers(args: z.infer<typeof getUsersSchema>): Promise<string> {
  const client = getClient();

  let params = "$select=UserCode,UserName,EmailAddress,AccountManager,Obsolete,JobTitle&$orderby=UserName";
  if (args.activeOnly) {
    params += "&$filter=Obsolete eq 0";
  }

  const result = await client.get<Record<string, unknown>>("Users", params);

  if (result.value.length === 0) {
    return "No users found.";
  }

  const lines = result.value.map((u) => {
    const am = u.AccountManager ? " [Account Manager]" : "";
    return `- **${u.UserCode}**: ${u.UserName || "(unnamed)"}${am} — ${u.EmailAddress || "N/A"} — ${u.JobTitle || ""}`;
  });

  return `CRM Users (${result.value.length}):\n\n${lines.join("\n")}`;
}

/**
 * Search for opportunities/leads.
 */
export async function searchLeads(args: z.infer<typeof searchLeadsSchema>): Promise<string> {
  const client = getClient();
  const filters: string[] = ["StatusFlag ne 'D'"];

  if (args.description) {
    filters.push(`contains(Description,'${args.description}')`);
  }
  if (args.contactName) {
    filters.push(`(contains(Contact/Forename,'${args.contactName}') or contains(Contact/Surname,'${args.contactName}'))`);
  }
  if (args.divisionName) {
    filters.push(`contains(Contact/Division/Name,'${args.divisionName}')`);
  }
  if (args.responsibleUser) {
    filters.push(`ResponsibleUser eq '${args.responsibleUser}'`);
  }

  const expand = "Contact($select=Forename,Surname;$expand=Division($select=Name)),Status($select=Description),Owner($select=UserName)";

  const params = [
    `$filter=${filters.join(" and ")}`,
    `$expand=${expand}`,
    `$select=LeadId,Description,EstimatedClose,Created,RecordLink,Guttometer`,
    `$orderby=Created desc`,
    `$top=${args.top || 10}`,
  ].join("&");

  const result = await client.get<Record<string, unknown>>("Leads", params);

  if (result.value.length === 0) {
    return "No opportunities/leads found matching the criteria.";
  }

  const lines = result.value.map((l) => {
    const contact = l.Contact as Record<string, unknown> | null;
    const div = contact?.Division as Record<string, unknown> | null;
    const status = l.Status as Record<string, unknown> | null;
    const resp = l.Owner as Record<string, unknown> | null;
    const name = contact ? `${contact.Forename || ""} ${contact.Surname || ""}`.trim() : "N/A";

    return [
      `**Lead #${l.LeadId}** — ${l.Description || "(no description)"}`,
      `  Company: ${div?.Name || "N/A"} | Contact: ${name}`,
      `  Status: ${status?.Description || "N/A"} | Owner: ${resp?.UserName || "N/A"} | Confidence: ${l.Guttometer || 0}%`,
      `  Est. Close: ${(l.EstimatedClose as string)?.substring(0, 10) || "N/A"} | Created: ${(l.Created as string)?.substring(0, 10) || "N/A"}`,
    ].join("\n");
  });

  return `Found ${result.value.length} opportunity/lead(s):\n\n${lines.join("\n\n")}`;
}

/**
 * Get full details of a lead/opportunity including contact, division, quotes.
 */
export async function getLeadDetails(args: z.infer<typeof getLeadDetailsSchema>): Promise<string> {
  const client = getClient();

  const expand = [
    "Contact($select=ContactId,Forename,Surname,Email,PhoneNumber;$expand=Division($select=DivisionId,Name,SalesLedgerId;$expand=Address($select=AddressId,AddressLine1,AddressLine2,AddressLine3,Postcode,Country)))",
    "Status($select=Description)",
    "Owner($select=UserCode,UserName)",
    "Quotes($select=QuoteId,Description,DecimalHomeNetValue,DecimalHomeGrossValue,MarginPercentage;$expand=Status($select=Description);$orderby=Created desc;$top=10)",
  ].join(",");

  const lead = await client.getById<Record<string, unknown>>(
    "Leads",
    args.leadId,
    `$expand=${expand}`
  );

  const contact = lead.Contact as Record<string, unknown> | null;
  const div = contact?.Division as Record<string, unknown> | null;
  const addr = div?.Address as Record<string, unknown> | null;
  const status = lead.Status as Record<string, unknown> | null;
  const resp = lead.Owner as Record<string, unknown> | null;
  const quotes = lead.Quotes as Array<Record<string, unknown>> | null;

  const contactName = contact ? `${contact.Forename || ""} ${contact.Surname || ""}`.trim() : "N/A";
  const address = addr
    ? [addr.AddressLine1, addr.AddressLine2, addr.AddressLine3, addr.Postcode, addr.Country].filter(Boolean).join(", ")
    : "N/A";

  let output = [
    `# Opportunity / Lead #${lead.LeadId}`,
    `**Description:** ${lead.Description || "(none)"}`,
    `**Status:** ${status?.Description || "N/A"}`,
    `**Confidence:** ${lead.Guttometer || 0}%`,
    `**Owner:** ${resp?.UserName || "N/A"} (${resp?.UserCode || "N/A"})`,
    `**Est. Close:** ${(lead.EstimatedClose as string)?.substring(0, 10) || "N/A"}`,
    `**Created:** ${(lead.Created as string)?.substring(0, 10) || "N/A"}`,
    ``,
    `## Contact`,
    `**Name:** ${contactName} (ContactId: ${contact?.ContactId || "N/A"})`,
    `**Email:** ${contact?.Email || "N/A"}`,
    `**Phone:** ${contact?.PhoneNumber || "N/A"}`,
    ``,
    `## Company`,
    `**Division:** ${div?.Name || "N/A"} (DivisionId: ${div?.DivisionId || "N/A"})`,
    `**Account Code:** ${div?.SalesLedgerId || "N/A"}`,
    `**Address:** ${address}`,
    `**AddressId:** ${addr?.AddressId || "N/A"}`,
  ].join("\n");

  if (quotes && quotes.length > 0) {
    const quoteLines = quotes.map((q) => {
      const qStatus = q.Status as Record<string, unknown> | null;
      return `  - Quote #${q.QuoteId}: ${q.Description || "(no desc)"} — ${qStatus?.Description || "?"} — Net £${(q.DecimalHomeNetValue as number)?.toFixed(2) ?? "0.00"}`;
    });
    output += `\n\n## Quotes (${quotes.length})\n${quoteLines.join("\n")}`;
  } else {
    output += "\n\n## Quotes\n(none)";
  }

  output += `\n\n**Lead Link:** ${lead.RecordLink || "N/A"}`;

  return output;
}
