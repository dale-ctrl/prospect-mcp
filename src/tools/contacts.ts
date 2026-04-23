/**
 * MCP tool handlers for Contact and Division creation/update.
 * Contacts belong to Divisions (companies) — creating a contact
 * for a new company requires creating the Division first.
 */

import { z } from "zod";
import { getClient } from "../client.js";

// ─── Schemas ───────────────────────────────────────────────────

export const createDivisionSchema = z.object({
  name: z.string().describe("Company/organisation name"),
  phoneNumber: z.string().optional().describe("Main phone number"),
  website: z.string().optional().describe("Company website URL"),
  relationship: z.string().optional().describe("Relationship type, e.g. 'Customer', 'Prospect', 'Supplier'"),
  salesLedgerId: z.string().optional().describe("Account code in the sales ledger"),
  territoryCode: z.string().optional().describe("Territory code"),
  customerType: z.string().optional().describe("Customer type code"),
  source: z.string().optional().describe("How this company was sourced"),
  longDescription: z.string().optional().describe("Notes about the company"),
  addressLine1: z.string().optional().describe("Address line 1"),
  addressLine2: z.string().optional().describe("Address line 2"),
  addressLine3: z.string().optional().describe("Address line 3 (town/city)"),
  addressLine4: z.string().optional().describe("Address line 4 (county)"),
  addressLine5: z.string().optional().describe("Address line 5"),
  postcode: z.string().optional().describe("Postcode"),
  country: z.string().optional().describe("Country"),
});

export const createContactSchema = z.object({
  divisionId: z.number().describe("DivisionId (company) this contact belongs to. Use search_divisions to find, or create_division to create a new company first."),
  forename: z.string().describe("First name"),
  surname: z.string().describe("Last name"),
  roleCode: z.string().optional().describe("Contact role code. Use get_contact_roles to list available codes. Defaults to 'Office / Admin' if omitted."),
  title: z.string().optional().describe("Title (Mr, Mrs, Ms, Dr, etc.)"),
  jobTitle: z.string().optional().describe("Job title"),
  department: z.string().optional().describe("Department"),
  email: z.string().optional().describe("Email address"),
  phoneNumber: z.string().optional().describe("Phone number"),
  mobilePhoneNumber: z.string().optional().describe("Mobile phone number"),
  salutation: z.string().optional().describe("How to address them in letters (e.g. 'Dear Dale')"),
  source: z.string().optional().describe("How this contact was sourced"),
});

export const updateContactSchema = z.object({
  contactId: z.number().describe("The ContactId to update"),
  forename: z.string().optional(),
  surname: z.string().optional(),
  title: z.string().optional(),
  jobTitle: z.string().optional(),
  department: z.string().optional(),
  email: z.string().optional(),
  phoneNumber: z.string().optional(),
  mobilePhoneNumber: z.string().optional(),
  salutation: z.string().optional(),
  source: z.string().optional(),
});

export const updateDivisionSchema = z.object({
  divisionId: z.number().describe("The DivisionId to update"),
  name: z.string().optional().describe("Company name"),
  phoneNumber: z.string().optional().describe("Phone number"),
  website: z.string().optional().describe("Website URL"),
  employees: z.number().optional().describe("Employee/pupil count"),
  relationship: z.string().optional().describe("Relationship type"),
  salesLedgerId: z.string().optional().describe("Account code"),
  territoryCode: z.string().optional().describe("Territory code"),
  customerType: z.string().optional().describe("Customer type"),
  source: z.string().optional().describe("Source"),
  longDescription: z.string().optional().describe("Notes about the company"),
  locale: z.string().optional().describe("Locale"),
});

export const getContactRolesSchema = z.object({});

export const lookupCompanyInfoSchema = z.object({
  companyName: z.string().describe("Company name to search for online"),
  website: z.string().optional().describe("Company website URL if known — more accurate than name search"),
});

// ─── Handlers ──────────────────────────────────────────────────

const DEFAULT_ROLE_CODE = "271c0d"; // "Office / Admin"
const OPERATING_COMPANY_CODE = "A";  // Westcountry Group (single company)

export async function createDivision(args: z.infer<typeof createDivisionSchema>): Promise<string> {
  const client = getClient();

  // Prospect hierarchy: Company → Division → Contact.
  // Step 1: Create the Company (requires Name + TypeId "CUS" for customer)
  const company = await client.post<Record<string, unknown>>("Companies", {
    Name: args.name,
    TypeId: "CUS",
  });
  const companyId = company.CompanyId as number;

  // Step 2: Create the Division under the Company
  const divBody: Record<string, unknown> = {
    Name: args.name,
    CompanyId: companyId,
    OperatingCompanyCode: OPERATING_COMPANY_CODE,
  };

  if (args.phoneNumber !== undefined) divBody.PhoneNumber = args.phoneNumber;
  if (args.website !== undefined) divBody.Website = args.website;
  if (args.relationship !== undefined) divBody.Relationship = args.relationship;
  if (args.salesLedgerId !== undefined) divBody.SalesLedgerId = args.salesLedgerId;
  if (args.territoryCode !== undefined) divBody.TerritoryCode = args.territoryCode;
  if (args.customerType !== undefined) divBody.CustomerType = args.customerType;
  if (args.source !== undefined) divBody.Source = args.source;
  if (args.longDescription !== undefined) divBody.LongDescription = args.longDescription;

  const division = await client.post<Record<string, unknown>>("Divisions", divBody);
  const divisionId = division.DivisionId as number;
  const addressId = division.AddressId as number;

  // Step 3: Update the address if any address fields were provided
  const hasAddress = args.addressLine1 || args.addressLine2 || args.addressLine3 ||
    args.addressLine4 || args.addressLine5 || args.postcode || args.country;

  if (hasAddress && addressId) {
    const addrBody: Record<string, unknown> = {};
    if (args.addressLine1 !== undefined) addrBody.AddressLine1 = args.addressLine1;
    if (args.addressLine2 !== undefined) addrBody.AddressLine2 = args.addressLine2;
    if (args.addressLine3 !== undefined) addrBody.AddressLine3 = args.addressLine3;
    if (args.addressLine4 !== undefined) addrBody.AddressLine4 = args.addressLine4;
    if (args.addressLine5 !== undefined) addrBody.AddressLine5 = args.addressLine5;
    if (args.postcode !== undefined) addrBody.Postcode = args.postcode;
    if (args.country !== undefined) addrBody.Country = args.country;
    await client.patch("Addresses", addressId, addrBody);
  }

  return [
    `Company and division created successfully!`,
    `**CompanyId:** ${companyId}`,
    `**DivisionId:** ${divisionId}`,
    `**Name:** ${division.Name || args.name}`,
    `**AddressId:** ${addressId}`,
    `**Website:** ${division.Website || "N/A"}`,
    `**Phone:** ${division.PhoneNumber || "N/A"}`,
    `**Created:** ${(division.Created as string)?.substring(0, 10) || "now"}`,
    `**CRM Link:** ${division.RecordLink || "N/A"}`,
    "",
    `Next: Use **create_contact** with DivisionId ${divisionId} to add people at this company.`,
  ].join("\n");
}

export async function updateDivision(args: z.infer<typeof updateDivisionSchema>): Promise<string> {
  const client = getClient();
  const { divisionId, ...fields } = args;

  const body: Record<string, unknown> = {};
  if (fields.name !== undefined) body.Name = fields.name;
  if (fields.phoneNumber !== undefined) body.PhoneNumber = fields.phoneNumber;
  if (fields.website !== undefined) body.Website = fields.website;
  if (fields.employees !== undefined) body.Employees = fields.employees;
  if (fields.relationship !== undefined) body.Relationship = fields.relationship;
  if (fields.salesLedgerId !== undefined) body.SalesLedgerId = fields.salesLedgerId;
  if (fields.territoryCode !== undefined) body.TerritoryCode = fields.territoryCode;
  if (fields.customerType !== undefined) body.CustomerType = fields.customerType;
  if (fields.source !== undefined) body.Source = fields.source;
  if (fields.longDescription !== undefined) body.LongDescription = fields.longDescription;
  if (fields.locale !== undefined) body.Locale = fields.locale;

  if (Object.keys(body).length === 0) {
    return "No fields provided to update. Specify at least one field to change.";
  }

  await client.patch<Record<string, unknown>>("Divisions", divisionId, body);

  return `Division #${divisionId} updated successfully. Fields changed: ${Object.keys(body).join(", ")}`;
}

export async function createContact(args: z.infer<typeof createContactSchema>): Promise<string> {
  const client = getClient();

  const body: Record<string, unknown> = {
    DivisionId: args.divisionId,
    Forename: args.forename,
    Surname: args.surname,
    RoleCode: args.roleCode || DEFAULT_ROLE_CODE,
  };

  if (args.title !== undefined) body.Title = args.title;
  if (args.jobTitle !== undefined) body.JobTitle = args.jobTitle;
  if (args.department !== undefined) body.Department = args.department;
  if (args.email !== undefined) body.Email = args.email;
  if (args.phoneNumber !== undefined) body.PhoneNumber = args.phoneNumber;
  if (args.mobilePhoneNumber !== undefined) body.MobilePhoneNumber = args.mobilePhoneNumber;
  if (args.salutation !== undefined) body.Salutation = args.salutation;
  if (args.source !== undefined) body.Source = args.source;

  const created = await client.post<Record<string, unknown>>("Contacts", body);

  return [
    `Contact created successfully!`,
    `**ContactId:** ${created.ContactId}`,
    `**Name:** ${created.Forename || args.forename} ${created.Surname || args.surname}`,
    `**DivisionId:** ${created.DivisionId}`,
    `**Email:** ${created.Email || "N/A"}`,
    `**Phone:** ${created.PhoneNumber || "N/A"}`,
    `**Job Title:** ${created.JobTitle || "N/A"}`,
    `**Role:** ${created.RoleCode}`,
    `**CRM Link:** ${created.RecordLink || "N/A"}`,
  ].join("\n");
}

export async function updateContact(args: z.infer<typeof updateContactSchema>): Promise<string> {
  const client = getClient();
  const { contactId, ...fields } = args;

  const body: Record<string, unknown> = {};
  if (fields.forename !== undefined) body.Forename = fields.forename;
  if (fields.surname !== undefined) body.Surname = fields.surname;
  if (fields.title !== undefined) body.Title = fields.title;
  if (fields.jobTitle !== undefined) body.JobTitle = fields.jobTitle;
  if (fields.department !== undefined) body.Department = fields.department;
  if (fields.email !== undefined) body.Email = fields.email;
  if (fields.phoneNumber !== undefined) body.PhoneNumber = fields.phoneNumber;
  if (fields.mobilePhoneNumber !== undefined) body.MobilePhoneNumber = fields.mobilePhoneNumber;
  if (fields.salutation !== undefined) body.Salutation = fields.salutation;
  if (fields.source !== undefined) body.Source = fields.source;

  if (Object.keys(body).length === 0) {
    return "No fields provided to update. Specify at least one field to change.";
  }

  await client.patch<Record<string, unknown>>("Contacts", contactId, body);

  return `Contact #${contactId} updated successfully. Fields changed: ${Object.keys(body).join(", ")}`;
}

export async function getContactRoles(): Promise<string> {
  const client = getClient();

  const result = await client.get<{ Code: string; Description: string | null }>(
    "ContactRoles",
    "$select=Code,Description&$filter=Obsolete eq 0&$orderby=Description"
  );

  if (result.value.length === 0) return "No contact roles found.";

  const lines = result.value.map(
    (r) => `- \`${r.Code}\` — ${r.Description || "(no description)"}`
  );

  return `## Contact Roles (${result.value.length})\n${lines.join("\n")}`;
}

export async function lookupCompanyInfo(args: z.infer<typeof lookupCompanyInfoSchema>): Promise<string> {
  // This tool returns a structured prompt for Claude to use with web search.
  // The MCP server itself doesn't have web access — Claude Desktop does.
  // We return instructions for Claude to search and then call create_division/create_contact.
  const searchTarget = args.website || args.companyName;

  return [
    `## Company Lookup Request`,
    ``,
    `Please search the web for publicly available information about: **${args.companyName}**${args.website ? ` (website: ${args.website})` : ""}`,
    ``,
    `Look for:`,
    `- **Full company name** and any trading names`,
    `- **Address** (registered office or main office)`,
    `- **Phone number** (main switchboard)`,
    `- **Website URL**`,
    `- **Key contacts** — names, job titles, email addresses if publicly listed`,
    `- **Industry / sector** — what they do`,
    `- **Company size** — employees, turnover if available`,
    ``,
    `Once you have this information, use **create_division** to create the company in Prospect CRM, then **create_contact** for each person you find.`,
    ``,
    `Tip: Check the company's website "About", "Team", "Contact Us" pages. Also try LinkedIn and Companies House.`,
  ].join("\n");
}
