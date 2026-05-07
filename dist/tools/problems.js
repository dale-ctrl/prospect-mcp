/**
 * MCP tool handlers for Problem/Ticket (support case) operations.
 * Problems are service/support tickets linked to contacts, divisions, and optionally leads/inventories.
 */
import { z } from "zod";
import { getClient } from "../client.js";
// ─── Schemas ──────────────────────────────────────────────────
export const searchProblemsSchema = z.object({
    description: z.string().optional().describe("Search in problem description (partial match)"),
    divisionId: z.number().optional().describe("Filter by DivisionId (company)"),
    divisionName: z.string().optional().describe("Company name (partial match)"),
    contactId: z.number().optional().describe("Filter by ContactId"),
    responsibleUser: z.string().optional().describe("Responsible user — name or code"),
    owner: z.string().optional().describe("Owner user — name or code"),
    priority: z.number().optional().describe("Priority level (1=highest)"),
    openOnly: z.boolean().optional().default(true).describe("Only open problems (default true)"),
    dateFrom: z.string().optional().describe("Created on or after (ISO date)"),
    dateTo: z.string().optional().describe("Created on or before (ISO date)"),
    top: z.number().optional().default(20).describe("Max results (default 20)"),
});
export const getProblemSchema = z.object({
    problemId: z.number().describe("The ProblemId to retrieve"),
});
// ─── Helpers ──────────────────────────────────────────────────
async function resolveUser(input) {
    const client = getClient();
    const result = await client.get("Users", "$select=UserCode,UserName&$filter=Obsolete eq 0");
    const trimmed = input.trim().toUpperCase();
    const byCode = result.value.find(u => u.UserCode.toUpperCase() === trimmed);
    if (byCode)
        return byCode.UserCode;
    const byName = result.value.find(u => (u.UserName || "").toUpperCase().includes(trimmed));
    if (byName)
        return byName.UserCode;
    return input;
}
export const createProblemSchema = z.object({
    contactId: z.number().describe("ContactId — the contact this problem is for. DivisionId and AddressId are auto-derived from the contact."),
    description: z.string().describe("Problem description"),
    ownerId: z.string().describe("Owner — user code or name"),
    responsibleUserId: z.string().describe("Responsible user — code or name"),
    type1Id: z.string().describe("Problem type ID — use get_problem_lookups to list available types"),
    statusId: z.string().describe("Status code — use get_problem_lookups to list available statuses"),
    supplierReference: z.string().optional().describe("Supplier reference"),
    customerReference: z.string().optional().describe("Customer reference"),
    serialNumber: z.string().optional().describe("Serial number"),
    priority: z.number().optional().describe("Priority level (1=highest)"),
    situationSummary: z.string().optional().describe("Situation summary notes"),
    pipelineId: z.string().optional().describe("Pipeline ID"),
});
export const updateProblemSchema = z.object({
    problemId: z.number().describe("The ProblemId to update"),
    description: z.string().optional().describe("Problem description"),
    ownerId: z.string().optional().describe("Owner — user code or name"),
    responsibleUserId: z.string().optional().describe("Responsible user — code or name"),
    type1Id: z.string().optional().describe("Problem type ID"),
    statusId: z.string().optional().describe("Status code"),
    supplierReference: z.string().optional().describe("Supplier reference"),
    customerReference: z.string().optional().describe("Customer reference"),
    serialNumber: z.string().optional().describe("Serial number"),
    priority: z.number().optional().describe("Priority level"),
    situationSummary: z.string().optional().describe("Situation summary notes"),
    pipelineId: z.string().optional().describe("Pipeline ID"),
});
export const getProblemLookupsSchema = z.object({});
// ─── Handlers ─────────────────────────────────────────────────
export async function createProblem(args) {
    const client = getClient();
    // Resolve user fields
    const ownerCode = await resolveUser(args.ownerId);
    const responsibleCode = await resolveUser(args.responsibleUserId);
    // Auto-derive DivisionId and AddressId from the contact
    const contact = await client.getById("Contacts", args.contactId, "$select=ContactId,DivisionId,AddressId");
    const body = {
        ContactId: args.contactId,
        DivisionId: contact.DivisionId,
        AddressId: contact.AddressId,
        Description: args.description,
        OwnerId: ownerCode,
        ResponsibleUserId: responsibleCode,
        Type1Id: args.type1Id,
        StatusId: args.statusId,
    };
    if (args.supplierReference !== undefined)
        body.SupplierReference = args.supplierReference;
    if (args.customerReference !== undefined)
        body.CustomerReference = args.customerReference;
    if (args.serialNumber !== undefined)
        body.SerialNumber = args.serialNumber;
    if (args.priority !== undefined)
        body.Priority = args.priority;
    if (args.situationSummary !== undefined)
        body.SituationSummary = args.situationSummary;
    if (args.pipelineId !== undefined)
        body.PipelineId = args.pipelineId;
    const created = await client.post("Problems", body);
    return [
        `Problem created successfully!`,
        `**ProblemId:** ${created.ProblemId}`,
        `**Description:** ${created.Description || args.description}`,
        `**ContactId:** ${args.contactId}`,
        `**DivisionId:** ${contact.DivisionId}`,
        `**Owner:** ${ownerCode}`,
        `**Responsible:** ${responsibleCode}`,
    ].join("\n");
}
export async function updateProblem(args) {
    const client = getClient();
    const { problemId, ...fields } = args;
    const body = {};
    if (fields.description !== undefined)
        body.Description = fields.description;
    if (fields.type1Id !== undefined)
        body.Type1Id = fields.type1Id;
    if (fields.statusId !== undefined)
        body.StatusId = fields.statusId;
    if (fields.supplierReference !== undefined)
        body.SupplierReference = fields.supplierReference;
    if (fields.customerReference !== undefined)
        body.CustomerReference = fields.customerReference;
    if (fields.serialNumber !== undefined)
        body.SerialNumber = fields.serialNumber;
    if (fields.priority !== undefined)
        body.Priority = fields.priority;
    if (fields.situationSummary !== undefined)
        body.SituationSummary = fields.situationSummary;
    if (fields.pipelineId !== undefined)
        body.PipelineId = fields.pipelineId;
    if (fields.ownerId !== undefined) {
        body.OwnerId = await resolveUser(fields.ownerId);
    }
    if (fields.responsibleUserId !== undefined) {
        body.ResponsibleUserId = await resolveUser(fields.responsibleUserId);
    }
    if (Object.keys(body).length === 0) {
        return "No fields provided to update. Specify at least one field to change.";
    }
    await client.patch("Problems", problemId, body);
    return `Problem #${problemId} updated successfully. Fields changed: ${Object.keys(body).join(", ")}`;
}
export async function getProblemLookups() {
    const client = getClient();
    const [types, statuses] = await Promise.all([
        client.get("ProblemTypes1", "$select=Type1Id,Description&$orderby=Description"),
        client.get("ProblemStatus", "$select=StatusCode,Description&$orderby=Description"),
    ]);
    const typeLines = types.value.map(t => `- \`${t.Type1Id}\` — ${t.Description}`);
    const statusLines = statuses.value.map(s => `- \`${s.StatusCode}\` — ${s.Description}`);
    return [
        `## Problem Types (${types.value.length})`,
        typeLines.join("\n"),
        "",
        `## Problem Statuses (${statuses.value.length})`,
        statusLines.join("\n"),
    ].join("\n");
}
export async function searchProblems(args) {
    const client = getClient();
    const filters = ["StatusFlag ne 'D'"];
    if (args.description)
        filters.push(`contains(Description,'${args.description}')`);
    if (args.divisionId)
        filters.push(`DivisionId eq ${args.divisionId}`);
    if (args.divisionName)
        filters.push(`contains(Division/Name,'${args.divisionName}')`);
    if (args.contactId)
        filters.push(`ContactId eq ${args.contactId}`);
    if (args.priority)
        filters.push(`Priority eq ${args.priority}`);
    if (args.dateFrom)
        filters.push(`Created ge ${args.dateFrom}`);
    if (args.dateTo)
        filters.push(`Created le ${args.dateTo}`);
    if (args.responsibleUser) {
        const code = await resolveUser(args.responsibleUser);
        filters.push(`ResponsibleUserId eq '${code}'`);
    }
    if (args.owner) {
        const code = await resolveUser(args.owner);
        filters.push(`OwnerId eq '${code}'`);
    }
    const expand = "Contact($select=Forename,Surname;$expand=Division($select=Name)),Status($select=Description),ResponsibleUser($select=UserName),Owner($select=UserName)";
    const params = [
        `$filter=${filters.join(" and ")}`,
        `$expand=${expand}`,
        `$select=ProblemId,Description,Priority,CustomerReference,SupplierReference,SituationSummary,Created,LastSpoke,StatusChanged`,
        `$orderby=Created desc`,
        `$top=${args.top || 20}`,
    ].join("&");
    const result = await client.get("Problems", params);
    if (result.value.length === 0)
        return "No problems/tickets found matching the criteria.";
    const lines = result.value.map((p) => {
        const contact = p.Contact;
        const contactName = contact ? `${contact.Forename || ""} ${contact.Surname || ""}`.trim() : "N/A";
        const company = contact?.Division?.Name || "N/A";
        const status = p.Status?.Description || "N/A";
        const responsible = p.ResponsibleUser?.UserName || "N/A";
        const owner = p.Owner?.UserName || "N/A";
        const date = p.Created?.substring(0, 10) || "N/A";
        return [
            `**Problem #${p.ProblemId}** — ${p.Description || "(untitled)"}`,
            `  Company: ${company} | Contact: ${contactName}`,
            `  Status: ${status} | Priority: ${p.Priority ?? "N/A"} | Responsible: ${responsible} | Owner: ${owner}`,
            `  Created: ${date} | Customer Ref: ${p.CustomerReference || "N/A"}`,
        ].join("\n");
    });
    return `Found ${result.value.length} problem(s)/ticket(s):\n\n${lines.join("\n\n")}`;
}
export async function getProblem(args) {
    const client = getClient();
    const expand = [
        "Contact($select=ContactId,Forename,Surname,Email,PhoneNumber;$expand=Division($select=DivisionId,Name,SalesLedgerId))",
        "Status($select=Description)",
        "ResponsibleUser($select=UserCode,UserName)",
        "Owner($select=UserCode,UserName)",
    ].join(",");
    const p = await client.getById("Problems", args.problemId, `$expand=${expand}`);
    const contact = p.Contact;
    const contactName = contact ? `${contact.Forename || ""} ${contact.Surname || ""}`.trim() : "N/A";
    const company = contact?.Division?.Name || "N/A";
    const status = p.Status?.Description || "N/A";
    const responsible = p.ResponsibleUser?.UserName || "N/A";
    const owner = p.Owner?.UserName || "N/A";
    return [
        `# Problem #${p.ProblemId}`,
        `**Description:** ${p.Description || "N/A"}`,
        `**Status:** ${status}`,
        `**Priority:** ${p.Priority ?? "N/A"}`,
        `**Company:** ${company}`,
        `**Contact:** ${contactName} (ID: ${p.ContactId || "N/A"})`,
        `**Responsible:** ${responsible}`,
        `**Owner:** ${owner}`,
        `**Customer Ref:** ${p.CustomerReference || "N/A"}`,
        `**Supplier Ref:** ${p.SupplierReference || "N/A"}`,
        `**Serial Number:** ${p.SerialNumber || "N/A"}`,
        "",
        `## Dates`,
        `- Created: ${p.Created?.substring(0, 10) || "N/A"}`,
        `- Status Changed: ${p.StatusChanged?.substring(0, 10) || "N/A"}`,
        `- Last Spoke: ${p.LastSpoke?.substring(0, 10) || "N/A"}`,
        "",
        `## Situation Summary`,
        p.SituationSummary || "(none)",
    ].join("\n");
}
//# sourceMappingURL=problems.js.map