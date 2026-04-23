/**
 * MCP tool handlers for Job (service delivery / project) operations.
 * Jobs track work against divisions/contacts, linked to quotes, leads, and problems.
 */

import { z } from "zod";
import { getClient } from "../client.js";

// ─── Schemas ──────────────────────────────────────────────────

export const searchJobsSchema = z.object({
  description: z.string().optional().describe("Search in job description (partial match)"),
  divisionId: z.number().optional().describe("Filter by DivisionId (company)"),
  divisionName: z.string().optional().describe("Company name (partial match)"),
  contactId: z.number().optional().describe("Filter by ContactId"),
  manager: z.string().optional().describe("Job manager — name or code"),
  customerReference: z.string().optional().describe("Customer reference (partial match)"),
  dateFrom: z.string().optional().describe("Target start on or after (ISO date)"),
  dateTo: z.string().optional().describe("Target start on or before (ISO date)"),
  openOnly: z.boolean().optional().default(true).describe("Only open/active jobs (default true)"),
  top: z.number().optional().default(20).describe("Max results (default 20)"),
});

export const getJobSchema = z.object({
  jobId: z.number().describe("The JobId to retrieve"),
});

// ─── Helpers ──────────────────────────────────────────────────

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

export const createJobSchema = z.object({
  divisionId: z.number().describe("DivisionId (company) for this job"),
  description: z.string().describe("Job description"),
  typeCode: z.string().describe("Job type code — use get_job_lookups to list available types"),
  statusCode: z.string().describe("Job status code — use get_job_lookups to list available statuses"),
  contactId: z.number().optional().describe("ContactId"),
  leadId: z.number().optional().describe("LeadId (opportunity)"),
  problemId: z.number().optional().describe("ProblemId to link"),
  quoteId: z.number().optional().describe("QuoteId to link"),
  customerReference: z.string().optional().describe("Customer reference"),
  alternateReference: z.string().optional().describe("Alternate reference"),
  targetStartDate: z.string().optional().describe("Target start date (ISO)"),
  targetEndDate: z.string().optional().describe("Target end date (ISO)"),
  actualStartDate: z.string().optional().describe("Actual start date (ISO)"),
  actualEndDate: z.string().optional().describe("Actual end date (ISO)"),
  manager: z.string().optional().describe("Job manager — user code or name"),
});

export const updateJobSchema = z.object({
  jobId: z.number().describe("The JobId to update"),
  description: z.string().optional().describe("Job description"),
  typeCode: z.string().optional().describe("Job type code"),
  statusCode: z.string().optional().describe("Job status code"),
  contactId: z.number().optional().describe("ContactId"),
  leadId: z.number().optional().describe("LeadId"),
  problemId: z.number().optional().describe("ProblemId"),
  quoteId: z.number().optional().describe("QuoteId"),
  customerReference: z.string().optional().describe("Customer reference"),
  alternateReference: z.string().optional().describe("Alternate reference"),
  targetStartDate: z.string().optional().describe("Target start date (ISO)"),
  targetEndDate: z.string().optional().describe("Target end date (ISO)"),
  actualStartDate: z.string().optional().describe("Actual start date (ISO)"),
  actualEndDate: z.string().optional().describe("Actual end date (ISO)"),
  manager: z.string().optional().describe("Job manager — user code or name"),
});

export const getJobLookupsSchema = z.object({});

export async function createJob(args: z.infer<typeof createJobSchema>): Promise<string> {
  const client = getClient();

  const body: Record<string, unknown> = {
    DivisionId: args.divisionId,
    Description: args.description,
    TypeCode: args.typeCode,
    StatusCode: args.statusCode,
  };

  if (args.contactId !== undefined) body.ContactId = args.contactId;
  if (args.leadId !== undefined) body.LeadId = args.leadId;
  if (args.problemId !== undefined) body.ProblemId = args.problemId;
  if (args.quoteId !== undefined) body.QuoteId = args.quoteId;
  if (args.customerReference !== undefined) body.CustomerReference = args.customerReference;
  if (args.alternateReference !== undefined) body.AlternateReference = args.alternateReference;
  if (args.targetStartDate !== undefined) body.TargetStartDate = args.targetStartDate;
  if (args.targetEndDate !== undefined) body.TargetEndDate = args.targetEndDate;
  if (args.actualStartDate !== undefined) body.ActualStartDate = args.actualStartDate;
  if (args.actualEndDate !== undefined) body.ActualEndDate = args.actualEndDate;

  if (args.manager !== undefined) {
    body.Manager = await resolveUser(args.manager);
  }

  const created = await client.post<Record<string, unknown>>("Jobs", body);

  return [
    `Job created successfully!`,
    `**JobId:** ${created.JobId}`,
    `**Description:** ${created.Description || args.description}`,
    `**DivisionId:** ${args.divisionId}`,
    `**Type:** ${args.typeCode}`,
    `**Status:** ${args.statusCode}`,
  ].join("\n");
}

export async function updateJob(args: z.infer<typeof updateJobSchema>): Promise<string> {
  const client = getClient();
  const { jobId, ...fields } = args;

  const body: Record<string, unknown> = {};
  if (fields.description !== undefined) body.Description = fields.description;
  if (fields.typeCode !== undefined) body.TypeCode = fields.typeCode;
  if (fields.statusCode !== undefined) body.StatusCode = fields.statusCode;
  if (fields.contactId !== undefined) body.ContactId = fields.contactId;
  if (fields.leadId !== undefined) body.LeadId = fields.leadId;
  if (fields.problemId !== undefined) body.ProblemId = fields.problemId;
  if (fields.quoteId !== undefined) body.QuoteId = fields.quoteId;
  if (fields.customerReference !== undefined) body.CustomerReference = fields.customerReference;
  if (fields.alternateReference !== undefined) body.AlternateReference = fields.alternateReference;
  if (fields.targetStartDate !== undefined) body.TargetStartDate = fields.targetStartDate;
  if (fields.targetEndDate !== undefined) body.TargetEndDate = fields.targetEndDate;
  if (fields.actualStartDate !== undefined) body.ActualStartDate = fields.actualStartDate;
  if (fields.actualEndDate !== undefined) body.ActualEndDate = fields.actualEndDate;

  if (fields.manager !== undefined) {
    body.Manager = await resolveUser(fields.manager);
  }

  if (Object.keys(body).length === 0) {
    return "No fields provided to update. Specify at least one field to change.";
  }

  await client.patch<Record<string, unknown>>("Jobs", jobId, body);

  return `Job #${jobId} updated successfully. Fields changed: ${Object.keys(body).join(", ")}`;
}

export async function getJobLookups(): Promise<string> {
  const client = getClient();

  const [types, statuses] = await Promise.all([
    client.get<{ TypeCode: string; Description: string }>(
      "JobTypes", "$select=TypeCode,Description&$orderby=Description"
    ),
    client.get<{ StatusCode: string; Description: string }>(
      "JobStatus", "$select=StatusCode,Description&$orderby=Description"
    ),
  ]);

  const typeLines = types.value.map(t => `- \`${t.TypeCode}\` — ${t.Description}`);
  const statusLines = statuses.value.map(s => `- \`${s.StatusCode}\` — ${s.Description}`);

  return [
    `## Job Types (${types.value.length})`,
    typeLines.join("\n"),
    "",
    `## Job Statuses (${statuses.value.length})`,
    statusLines.join("\n"),
  ].join("\n");
}

// ─── Handlers ─────────────────────────────────────────────────

export async function searchJobs(args: z.infer<typeof searchJobsSchema>): Promise<string> {
  const client = getClient();
  const filters: string[] = ["StatusFlag ne 'D'"];

  if (args.description) filters.push(`contains(Description,'${args.description}')`);
  if (args.divisionId) filters.push(`DivisionId eq ${args.divisionId}`);
  if (args.divisionName) filters.push(`contains(Division/Name,'${args.divisionName}')`);
  if (args.contactId) filters.push(`ContactId eq ${args.contactId}`);
  if (args.customerReference) filters.push(`contains(CustomerReference,'${args.customerReference}')`);
  if (args.dateFrom) filters.push(`TargetStartDate ge ${args.dateFrom}`);
  if (args.dateTo) filters.push(`TargetStartDate le ${args.dateTo}`);

  if (args.manager) {
    const code = await resolveUser(args.manager);
    filters.push(`Manager eq '${code}'`);
  }

  const expand = "Division($select=Name),Status($select=Description),Type($select=Description),ManagerUser($select=UserName)";
  const params = [
    `$filter=${filters.join(" and ")}`,
    `$expand=${expand}`,
    `$select=JobId,Description,CustomerReference,AlternateReference,TargetStartDate,TargetEndDate,ActualStartDate,ActualEndDate,DivisionId,ContactId,QuoteId,LeadId,ProblemId,Created`,
    `$orderby=Created desc`,
    `$top=${args.top || 20}`,
  ].join("&");

  const result = await client.get<Record<string, unknown>>("Jobs", params);
  if (result.value.length === 0) return "No jobs found matching the criteria.";

  const lines = result.value.map((j) => {
    const company = (j.Division as Record<string, unknown>)?.Name || "N/A";
    const status = (j.Status as Record<string, unknown>)?.Description || "N/A";
    const type = (j.Type as Record<string, unknown>)?.Description || "N/A";
    const manager = (j.ManagerUser as Record<string, unknown>)?.UserName || "N/A";
    const start = (j.TargetStartDate as string)?.substring(0, 10) || "N/A";
    const end = (j.TargetEndDate as string)?.substring(0, 10) || "N/A";

    const linkedParts: string[] = [];
    if (j.QuoteId) linkedParts.push(`Quote #${j.QuoteId}`);
    if (j.LeadId) linkedParts.push(`Lead #${j.LeadId}`);
    if (j.ProblemId) linkedParts.push(`Problem #${j.ProblemId}`);

    return [
      `**Job #${j.JobId}** — ${j.Description || "(untitled)"}`,
      `  Company: ${company} | Type: ${type} | Status: ${status}`,
      `  Manager: ${manager} | Dates: ${start} → ${end}`,
      `  Customer Ref: ${j.CustomerReference || "N/A"}`,
      linkedParts.length > 0 ? `  Linked: ${linkedParts.join(", ")}` : "",
    ].filter(Boolean).join("\n");
  });

  return `Found ${result.value.length} job(s):\n\n${lines.join("\n\n")}`;
}

export async function getJob(args: z.infer<typeof getJobSchema>): Promise<string> {
  const client = getClient();
  const expand = [
    "Division($select=DivisionId,Name,SalesLedgerId)",
    "Contact($select=ContactId,Forename,Surname,Email)",
    "Status($select=Description)",
    "Type($select=Description)",
    "ManagerUser($select=UserCode,UserName)",
    "Lead($select=LeadId,Description)",
    "Problem($select=ProblemId,Description)",
  ].join(",");

  const j = await client.getById<Record<string, unknown>>("Jobs", args.jobId, `$expand=${expand}`);

  const company = (j.Division as Record<string, unknown>)?.Name || "N/A";
  const contact = j.Contact as Record<string, unknown> | null;
  const contactName = contact ? `${contact.Forename || ""} ${contact.Surname || ""}`.trim() : "N/A";
  const status = (j.Status as Record<string, unknown>)?.Description || "N/A";
  const type = (j.Type as Record<string, unknown>)?.Description || "N/A";
  const manager = (j.ManagerUser as Record<string, unknown>)?.UserName || "N/A";
  const lead = j.Lead as Record<string, unknown> | null;
  const problem = j.Problem as Record<string, unknown> | null;

  return [
    `# Job #${j.JobId}`,
    `**Description:** ${j.Description || "N/A"}`,
    `**Type:** ${type} | **Status:** ${status}`,
    `**Company:** ${company}`,
    `**Contact:** ${contactName} (ID: ${j.ContactId || "N/A"})`,
    `**Manager:** ${manager}`,
    `**Customer Ref:** ${j.CustomerReference || "N/A"}`,
    `**Alternate Ref:** ${j.AlternateReference || "N/A"}`,
    "",
    `## Dates`,
    `- Target: ${(j.TargetStartDate as string)?.substring(0, 10) || "N/A"} → ${(j.TargetEndDate as string)?.substring(0, 10) || "N/A"}`,
    `- Actual: ${(j.ActualStartDate as string)?.substring(0, 10) || "N/A"} → ${(j.ActualEndDate as string)?.substring(0, 10) || "N/A"}`,
    `- Created: ${(j.Created as string)?.substring(0, 10) || "N/A"}`,
    "",
    `## Linked Records`,
    j.QuoteId ? `**Quote:** #${j.QuoteId}` : "",
    lead ? `**Lead:** #${lead.LeadId} — ${lead.Description || "N/A"}` : "",
    problem ? `**Problem:** #${problem.ProblemId} — ${problem.Description || "N/A"}` : "",
  ].filter(Boolean).join("\n");
}
