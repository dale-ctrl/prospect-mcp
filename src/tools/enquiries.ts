/**
 * MCP tool handlers for Enquiry operations.
 * Enquiries are inbound leads/web forms that can be converted to contacts/opportunities.
 */

import { z } from "zod";
import { getClient } from "../client.js";

// ─── Schemas ──────────────────────────────────────────────────

export const searchEnquiriesSchema = z.object({
  forename: z.string().optional().describe("Enquirer first name (partial match)"),
  surname: z.string().optional().describe("Enquirer surname (partial match)"),
  companyName: z.string().optional().describe("Company name (partial match)"),
  email: z.string().optional().describe("Email address (partial match)"),
  source: z.string().optional().describe("Source filter (e.g. 'Website', 'Telemarketing')"),
  dateFrom: z.string().optional().describe("Created on or after (ISO date)"),
  dateTo: z.string().optional().describe("Created on or before (ISO date)"),
  convertedOnly: z.boolean().optional().default(false).describe("Only show converted enquiries"),
  unconvertedOnly: z.boolean().optional().default(false).describe("Only show unconverted enquiries"),
  top: z.number().optional().default(20).describe("Max results (default 20)"),
});

export const getEnquirySchema = z.object({
  enquiryId: z.number().describe("The EnquiryId to retrieve"),
});

export const createEnquirySchema = z.object({
  title: z.string().optional().describe("Title (Mr, Mrs, etc.)"),
  forename: z.string().optional().describe("First name"),
  surname: z.string().optional().describe("Last name"),
  jobTitle: z.string().optional().describe("Job title"),
  email: z.string().optional().describe("Email address"),
  companyName: z.string().optional().describe("Company name"),
  website: z.string().optional().describe("Website URL"),
  phoneNumber: z.string().optional().describe("Phone number"),
  mobileNumber: z.string().optional().describe("Mobile number"),
  description: z.string().optional().describe("Enquiry description"),
  source: z.string().optional().describe("Source (e.g. 'Website', 'Phone')"),
  enquiryFormId: z.string().optional().describe("Enquiry form ID"),
  sourceTypeCode: z.string().optional().describe("Source type code"),
  utmSource: z.string().optional().describe("UTM source"),
  utmMedium: z.string().optional().describe("UTM medium"),
  utmCampaign: z.string().optional().describe("UTM campaign"),
  utmTerm: z.string().optional().describe("UTM term"),
  utmContent: z.string().optional().describe("UTM content"),
  addressLine1: z.string().optional().describe("Address line 1"),
  addressLine2: z.string().optional().describe("Address line 2"),
  addressLine3: z.string().optional().describe("Address line 3"),
  postcode: z.string().optional().describe("Postcode"),
  country: z.string().optional().describe("Country"),
});

export const updateEnquirySchema = z.object({
  enquiryId: z.number().describe("The EnquiryId to update"),
  title: z.string().optional(),
  forename: z.string().optional(),
  surname: z.string().optional(),
  jobTitle: z.string().optional(),
  email: z.string().optional(),
  companyName: z.string().optional(),
  website: z.string().optional(),
  phoneNumber: z.string().optional(),
  mobileNumber: z.string().optional(),
  description: z.string().optional(),
  source: z.string().optional(),
  sourceTypeCode: z.string().optional(),
});

// ─── Handlers ─────────────────────────────────────────────────

export async function createEnquiry(args: z.infer<typeof createEnquirySchema>): Promise<string> {
  const client = getClient();

  const body: Record<string, unknown> = {};
  if (args.title !== undefined) body.Title = args.title;
  if (args.forename !== undefined) body.Forename = args.forename;
  if (args.surname !== undefined) body.Surname = args.surname;
  if (args.jobTitle !== undefined) body.JobTitle = args.jobTitle;
  if (args.email !== undefined) body.Email = args.email;
  if (args.companyName !== undefined) body.CompanyName = args.companyName;
  if (args.website !== undefined) body.Website = args.website;
  if (args.phoneNumber !== undefined) body.PhoneNumber = args.phoneNumber;
  if (args.mobileNumber !== undefined) body.MobileNumber = args.mobileNumber;
  if (args.description !== undefined) body.Description = args.description;
  if (args.source !== undefined) body.Source = args.source;
  if (args.enquiryFormId !== undefined) body.EnquiryFormId = args.enquiryFormId;
  if (args.sourceTypeCode !== undefined) body.SourceTypeCode = args.sourceTypeCode;
  if (args.utmSource !== undefined) body.UtmSource = args.utmSource;
  if (args.utmMedium !== undefined) body.UtmMedium = args.utmMedium;
  if (args.utmCampaign !== undefined) body.UtmCampaign = args.utmCampaign;
  if (args.utmTerm !== undefined) body.UtmTerm = args.utmTerm;
  if (args.utmContent !== undefined) body.UtmContent = args.utmContent;
  if (args.addressLine1 !== undefined) body.AddressLine1 = args.addressLine1;
  if (args.addressLine2 !== undefined) body.AddressLine2 = args.addressLine2;
  if (args.addressLine3 !== undefined) body.AddressLine3 = args.addressLine3;
  if (args.postcode !== undefined) body.Postcode = args.postcode;
  if (args.country !== undefined) body.Country = args.country;

  const created = await client.post<Record<string, unknown>>("Enquiries", body);

  const name = `${created.Forename || args.forename || ""} ${created.Surname || args.surname || ""}`.trim();

  return [
    `Enquiry created successfully!`,
    `**EnquiryId:** ${created.EnquiryId}`,
    `**Name:** ${name || "N/A"}`,
    `**Company:** ${created.CompanyName || args.companyName || "N/A"}`,
    `**Email:** ${created.Email || args.email || "N/A"}`,
    `**Source:** ${created.Source || args.source || "N/A"}`,
  ].join("\n");
}

export async function updateEnquiry(args: z.infer<typeof updateEnquirySchema>): Promise<string> {
  const client = getClient();
  const { enquiryId, ...fields } = args;

  const body: Record<string, unknown> = {};
  if (fields.title !== undefined) body.Title = fields.title;
  if (fields.forename !== undefined) body.Forename = fields.forename;
  if (fields.surname !== undefined) body.Surname = fields.surname;
  if (fields.jobTitle !== undefined) body.JobTitle = fields.jobTitle;
  if (fields.email !== undefined) body.Email = fields.email;
  if (fields.companyName !== undefined) body.CompanyName = fields.companyName;
  if (fields.website !== undefined) body.Website = fields.website;
  if (fields.phoneNumber !== undefined) body.PhoneNumber = fields.phoneNumber;
  if (fields.mobileNumber !== undefined) body.MobileNumber = fields.mobileNumber;
  if (fields.description !== undefined) body.Description = fields.description;
  if (fields.source !== undefined) body.Source = fields.source;
  if (fields.sourceTypeCode !== undefined) body.SourceTypeCode = fields.sourceTypeCode;

  if (Object.keys(body).length === 0) {
    return "No fields provided to update. Specify at least one field to change.";
  }

  await client.patch<Record<string, unknown>>("Enquiries", enquiryId, body);

  return `Enquiry #${enquiryId} updated successfully. Fields changed: ${Object.keys(body).join(", ")}`;
}

export async function searchEnquiries(args: z.infer<typeof searchEnquiriesSchema>): Promise<string> {
  const client = getClient();
  const filters: string[] = ["StatusFlag ne 'D'"];

  if (args.forename) filters.push(`contains(Forename,'${args.forename}')`);
  if (args.surname) filters.push(`contains(Surname,'${args.surname}')`);
  if (args.companyName) filters.push(`contains(CompanyName,'${args.companyName}')`);
  if (args.email) filters.push(`contains(Email,'${args.email}')`);
  if (args.source) filters.push(`contains(Source,'${args.source}')`);
  if (args.dateFrom) filters.push(`Created ge ${args.dateFrom}`);
  if (args.dateTo) filters.push(`Created le ${args.dateTo}`);
  if (args.convertedOnly) filters.push("ConvertedDate ne null");
  if (args.unconvertedOnly) filters.push("ConvertedDate eq null");

  const expand = "AssignedToUser($select=UserName),Division($select=Name)";
  const params = [
    `$filter=${filters.join(" and ")}`,
    `$expand=${expand}`,
    `$select=EnquiryId,Forename,Surname,CompanyName,Email,PhoneNumber,Source,Description,ConvertedDate,ContactId,DivisionId,Created`,
    `$orderby=Created desc`,
    `$top=${args.top || 20}`,
  ].join("&");

  const result = await client.get<Record<string, unknown>>("Enquiries", params);
  if (result.value.length === 0) return "No enquiries found matching the criteria.";

  const lines = result.value.map((e) => {
    const name = `${e.Forename || ""} ${e.Surname || ""}`.trim() || "N/A";
    const assignee = (e.AssignedToUser as Record<string, unknown>)?.UserName || "Unassigned";
    const division = (e.Division as Record<string, unknown>)?.Name || "";
    const converted = e.ConvertedDate ? `Converted ${(e.ConvertedDate as string).substring(0, 10)}` : "Unconverted";
    const desc = e.Description ? (e.Description as string).substring(0, 80) + "..." : "";

    return [
      `**Enquiry #${e.EnquiryId}** — ${name} (${e.CompanyName || "No company"})`,
      `  Email: ${e.Email || "N/A"} | Phone: ${e.PhoneNumber || "N/A"}`,
      `  Source: ${e.Source || "N/A"} | Assigned: ${assignee} | ${converted}`,
      `  Created: ${(e.Created as string)?.substring(0, 10) || "N/A"}${division ? ` | Linked to: ${division}` : ""}`,
      desc ? `  ${desc}` : "",
    ].filter(Boolean).join("\n");
  });

  return `Found ${result.value.length} enquiry(ies):\n\n${lines.join("\n\n")}`;
}

export async function getEnquiry(args: z.infer<typeof getEnquirySchema>): Promise<string> {
  const client = getClient();
  const expand = [
    "AssignedToUser($select=UserName)",
    "ConvertedByUser($select=UserName)",
    "Division($select=DivisionId,Name)",
    "Contact($select=ContactId,Forename,Surname,Email)",
  ].join(",");

  const e = await client.getById<Record<string, unknown>>(
    "Enquiries", args.enquiryId, `$expand=${expand}`
  );

  const name = `${e.Forename || ""} ${e.Surname || ""}`.trim() || "N/A";
  const assignee = (e.AssignedToUser as Record<string, unknown>)?.UserName || "Unassigned";
  const convertedBy = (e.ConvertedByUser as Record<string, unknown>)?.UserName || "";
  const contact = e.Contact as Record<string, unknown> | null;
  const division = e.Division as Record<string, unknown> | null;

  const address = [e.AddressLine1, e.AddressLine2, e.AddressLine3, e.Postcode, e.Country]
    .filter(Boolean).join(", ") || "N/A";

  return [
    `# Enquiry #${e.EnquiryId}`,
    `**Name:** ${e.Title || ""} ${name}`,
    `**Company:** ${e.CompanyName || "N/A"}`,
    `**Job Title:** ${e.JobTitle || "N/A"}`,
    `**Email:** ${e.Email || "N/A"}`,
    `**Phone:** ${e.PhoneNumber || "N/A"} | Mobile: ${e.MobileNumber || "N/A"}`,
    `**Website:** ${e.Website || "N/A"}`,
    `**Address:** ${address}`,
    "",
    `## Source & Tracking`,
    `**Source:** ${e.Source || "N/A"}`,
    `**UTM:** ${[e.UtmSource, e.UtmMedium, e.UtmCampaign].filter(Boolean).join(" / ") || "N/A"}`,
    `**Assigned To:** ${assignee}`,
    `**Created:** ${(e.Created as string)?.substring(0, 10) || "N/A"}`,
    "",
    `## Conversion`,
    e.ConvertedDate
      ? `**Converted:** ${(e.ConvertedDate as string).substring(0, 10)} by ${convertedBy}`
      : "**Status:** Unconverted",
    contact ? `**Linked Contact:** ${contact.Forename} ${contact.Surname} (ID: ${contact.ContactId})` : "",
    division ? `**Linked Division:** ${division.Name} (ID: ${division.DivisionId})` : "",
    e.LeadId ? `**Linked Lead:** #${e.LeadId}` : "",
    "",
    `## Description`,
    (e.Description as string) || "(none)",
  ].filter(Boolean).join("\n");
}
