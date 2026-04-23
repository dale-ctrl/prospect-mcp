/**
 * MCP tool handlers for Document operations.
 * Documents are emails, letters, notes, and files attached to contacts/divisions/quotes/leads.
 */

import { z } from "zod";
import { getClient } from "../client.js";

// ─── Schemas ──────────────────────────────────────────────────

export const searchDocumentsSchema = z.object({
  divisionId: z.number().optional().describe("Filter by DivisionId (company)"),
  contactId: z.number().optional().describe("Filter by ContactId"),
  quoteId: z.number().optional().describe("Filter by QuoteId"),
  leadId: z.number().optional().describe("Filter by LeadId (opportunity)"),
  description: z.string().optional().describe("Search in document description (partial match)"),
  emailSubject: z.string().optional().describe("Search in email subject (partial match)"),
  dateFrom: z.string().optional().describe("Created on or after (ISO date)"),
  dateTo: z.string().optional().describe("Created on or before (ISO date)"),
  top: z.number().optional().default(20).describe("Max results (default 20)"),
});

export const getDocumentSchema = z.object({
  documentId: z.number().describe("The DocumentId to retrieve"),
});

export const getDocumentTypesSchema = z.object({});

// ─── Handlers ─────────────────────────────────────────────────

export async function searchDocuments(args: z.infer<typeof searchDocumentsSchema>): Promise<string> {
  const client = getClient();
  const filters: string[] = ["StatusFlag ne 'D'"];

  if (args.divisionId) filters.push(`Contact/DivisionId eq ${args.divisionId}`);
  if (args.contactId) filters.push(`ContactId eq ${args.contactId}`);
  if (args.quoteId) filters.push(`QuoteId eq ${args.quoteId}`);
  if (args.leadId) filters.push(`LeadId eq ${args.leadId}`);
  if (args.description) filters.push(`contains(Description,'${args.description}')`);
  if (args.emailSubject) filters.push(`contains(EmailSubject,'${args.emailSubject}')`);
  if (args.dateFrom) filters.push(`Created ge ${args.dateFrom}`);
  if (args.dateTo) filters.push(`Created le ${args.dateTo}`);

  const expand = "Contact($select=Forename,Surname;$expand=Division($select=Name)),DocumentType($select=Description)";
  const params = [
    `$filter=${filters.join(" and ")}`,
    `$expand=${expand}`,
    `$select=DocumentId,Description,EmailSubject,FileName,FileExtension,DocumentDate,Created,ContactId,QuoteId,LeadId,Direction,ToAddress,FromAddress`,
    `$orderby=Created desc`,
    `$top=${args.top || 20}`,
  ].join("&");

  const result = await client.get<Record<string, unknown>>("Documents", params);
  if (result.value.length === 0) return "No documents found matching the criteria.";

  const lines = result.value.map((d) => {
    const contact = d.Contact as Record<string, unknown> | null;
    const contactName = contact ? `${contact.Forename || ""} ${contact.Surname || ""}`.trim() : "N/A";
    const company = (contact?.Division as Record<string, unknown>)?.Name || "";
    const docType = (d.DocumentType as Record<string, unknown>)?.Description || "Unknown";
    const direction = d.Direction === 1 ? "Inbound" : d.Direction === 2 ? "Outbound" : "";
    const date = (d.Created as string)?.substring(0, 10) || "N/A";

    const title = d.EmailSubject || d.Description || d.FileName || "(untitled)";

    return [
      `**Doc #${d.DocumentId}** — ${title}`,
      `  Type: ${docType}${direction ? ` (${direction})` : ""} | Date: ${date}`,
      `  Contact: ${contactName}${company ? ` @ ${company}` : ""}`,
      d.FileName ? `  File: ${d.FileName}` : "",
    ].filter(Boolean).join("\n");
  });

  return `Found ${result.value.length} document(s):\n\n${lines.join("\n\n")}`;
}

export async function getDocument(args: z.infer<typeof getDocumentSchema>): Promise<string> {
  const client = getClient();
  const expand = [
    "Contact($select=ContactId,Forename,Surname,Email;$expand=Division($select=DivisionId,Name))",
    "DocumentType($select=Description)",
    "CreatedByUser($select=UserName)",
  ].join(",");

  const d = await client.getById<Record<string, unknown>>(
    "Documents", args.documentId, `$expand=${expand}`
  );

  const contact = d.Contact as Record<string, unknown> | null;
  const contactName = contact ? `${contact.Forename || ""} ${contact.Surname || ""}`.trim() : "N/A";
  const company = (contact?.Division as Record<string, unknown>)?.Name || "N/A";
  const docType = (d.DocumentType as Record<string, unknown>)?.Description || "Unknown";
  const createdBy = (d.CreatedByUser as Record<string, unknown>)?.UserName || "N/A";
  const direction = d.Direction === 1 ? "Inbound" : d.Direction === 2 ? "Outbound" : "N/A";

  return [
    `# Document #${d.DocumentId}`,
    `**Description:** ${d.Description || "N/A"}`,
    `**Type:** ${docType} | Direction: ${direction}`,
    `**File:** ${d.FileName || "N/A"} (${d.FileExtension || "N/A"})`,
    "",
    `## Email Details`,
    `**Subject:** ${d.EmailSubject || "N/A"}`,
    `**From:** ${d.FromAddress || "N/A"}`,
    `**To:** ${d.ToAddress || "N/A"}`,
    `**CC:** ${d.CcAddresses || "N/A"}`,
    `**Attachments:** ${d.Attachments || "N/A"}`,
    "",
    `## Linked Records`,
    `**Contact:** ${contactName} (ID: ${d.ContactId || "N/A"})`,
    `**Company:** ${company}`,
    d.QuoteId ? `**Quote:** #${d.QuoteId}` : "",
    d.LeadId ? `**Lead:** #${d.LeadId}` : "",
    "",
    `**Created:** ${(d.Created as string)?.substring(0, 10) || "N/A"} by ${createdBy}`,
    `**Document Date:** ${(d.DocumentDate as string)?.substring(0, 10) || "N/A"}`,
  ].filter(Boolean).join("\n");
}

export async function getDocumentTypes(): Promise<string> {
  const client = getClient();
  const result = await client.get<Record<string, unknown>>(
    "DocumentTemplates",
    "$select=DocumentTypeCode,Description&$orderby=Description&$top=100"
  );
  if (result.value.length === 0) return "No document types found.";

  const lines = result.value.map(
    (t) => `- \`${t.DocumentTypeCode}\` — ${t.Description || "(no description)"}`
  );
  return `## Document Types (${result.value.length})\n${lines.join("\n")}`;
}
