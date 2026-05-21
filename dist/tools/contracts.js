/**
 * MCP tool handlers for Contract and ContractSchedule operations.
 * Contracts are agreements with divisions. Each contract has one or more schedules (terms/periods).
 */
import { z } from "zod";
import { getClient } from "../client.js";
import { toCrmLink } from "../lib/urls.js";
// ─── Schemas ──────────────────────────────────────────────────
export const searchContractsSchema = z.object({
    divisionId: z.number().optional().describe("Filter by DivisionId (company)"),
    divisionName: z.string().optional().describe("Company name (partial match)"),
    description: z.string().optional().describe("Search in contract description (partial match)"),
    alternateReference: z.string().optional().describe("Alternate reference (partial match)"),
    currentOnly: z.boolean().optional().default(true).describe("Only show contracts with current schedules (default true)"),
    top: z.number().optional().default(20).describe("Max results (default 20)"),
});
export const getContractSchema = z.object({
    contractId: z.number().describe("The ContractId to retrieve"),
});
export const searchContractSchedulesSchema = z.object({
    contractId: z.number().optional().describe("Filter by parent ContractId"),
    divisionId: z.number().optional().describe("Filter by DivisionId via parent Contract"),
    currentOnly: z.boolean().optional().default(true).describe("Only current (non-expired) schedules"),
    expiringBefore: z.string().optional().describe("Schedules expiring before this date (ISO) — useful for renewal alerts"),
    top: z.number().optional().default(20).describe("Max results (default 20)"),
});
export const createContractSchema = z.object({
    divisionId: z.number().describe("DivisionId (company) for this contract"),
    typeCode: z.string().describe("Contract type code — use get_contract_lookups to list available types"),
    contractDesc: z.string().optional().describe("Contract description"),
    details: z.string().optional().describe("Detailed notes"),
    alternateReference: z.string().optional().describe("Alternate reference"),
});
export const updateContractSchema = z.object({
    contractId: z.number().describe("The ContractId to update"),
    typeCode: z.string().optional().describe("Contract type code"),
    contractDesc: z.string().optional().describe("Contract description"),
    details: z.string().optional().describe("Detailed notes"),
    alternateReference: z.string().optional().describe("Alternate reference"),
});
export const getContractLookupsSchema = z.object({});
export async function createContract(args) {
    const client = getClient();
    const body = {
        DivisionId: args.divisionId,
        TypeCode: args.typeCode,
    };
    if (args.contractDesc !== undefined)
        body.ContractDesc = args.contractDesc;
    if (args.details !== undefined)
        body.Details = args.details;
    if (args.alternateReference !== undefined)
        body.AlternateReference = args.alternateReference;
    const created = await client.post("Contracts", body);
    return [
        `Contract created successfully!`,
        `**ContractId:** ${created.ContractId}`,
        `**Description:** ${created.ContractDesc || args.contractDesc || "N/A"}`,
        `**DivisionId:** ${args.divisionId}`,
        `**Type:** ${args.typeCode}`,
        `**CRM Link:** ${toCrmLink(created.RecordLink)}`,
    ].join("\n");
}
export async function updateContract(args) {
    const client = getClient();
    const { contractId, ...fields } = args;
    const body = {};
    if (fields.typeCode !== undefined)
        body.TypeCode = fields.typeCode;
    if (fields.contractDesc !== undefined)
        body.ContractDesc = fields.contractDesc;
    if (fields.details !== undefined)
        body.Details = fields.details;
    if (fields.alternateReference !== undefined)
        body.AlternateReference = fields.alternateReference;
    if (Object.keys(body).length === 0) {
        return "No fields provided to update. Specify at least one field to change.";
    }
    await client.patch("Contracts", contractId, body);
    return `Contract #${contractId} updated successfully. Fields changed: ${Object.keys(body).join(", ")}`;
}
export async function getContractLookups() {
    const client = getClient();
    const [types, statuses] = await Promise.all([
        client.get("ContractTypes", "$select=TypeCode,Description&$orderby=Description"),
        client.get("ContractScheduleStatus", "$select=StatusCode,Description&$orderby=Description"),
    ]);
    const typeLines = types.value.map(t => `- \`${t.TypeCode}\` — ${t.Description}`);
    const statusLines = statuses.value.map(s => `- \`${s.StatusCode}\` — ${s.Description}`);
    return [
        `## Contract Types (${types.value.length})`,
        typeLines.join("\n"),
        "",
        `## Contract Schedule Statuses (${statuses.value.length})`,
        statusLines.join("\n"),
    ].join("\n");
}
// ─── Handlers ─────────────────────────────────────────────────
export async function searchContracts(args) {
    const client = getClient();
    const filters = ["StatusFlag ne 'D'"];
    if (args.divisionId)
        filters.push(`DivisionId eq ${args.divisionId}`);
    if (args.divisionName)
        filters.push(`contains(Division/Name,'${args.divisionName}')`);
    if (args.description)
        filters.push(`contains(ContractDesc,'${args.description}')`);
    if (args.alternateReference)
        filters.push(`contains(AlternateReference,'${args.alternateReference}')`);
    const expand = "Division($select=Name),Type($select=Description),ContractSchedules($select=ScheduleId,Description,StartDate,ExpectedEndDate,Current;$filter=StatusFlag ne 'D';$orderby=StartDate desc;$top=3)";
    const params = [
        `$filter=${filters.join(" and ")}`,
        `$expand=${expand}`,
        `$select=ContractId,ContractDesc,AlternateReference,Details,DivisionId,RecordLink,Created`,
        `$orderby=Created desc`,
        `$top=${args.top || 20}`,
    ].join("&");
    const result = await client.get("Contracts", params);
    // Filter to contracts with current schedules if requested
    let filtered = result.value;
    if (args.currentOnly) {
        filtered = filtered.filter((c) => {
            const schedules = c.ContractSchedules || [];
            return schedules.some((s) => s.Current === true);
        });
    }
    if (filtered.length === 0)
        return "No contracts found matching the criteria.";
    const lines = filtered.map((c) => {
        const company = c.Division?.Name || "N/A";
        const type = c.Type?.Description || "N/A";
        const schedules = c.ContractSchedules || [];
        const currentSchedule = schedules.find(s => s.Current === true);
        const scheduleInfo = currentSchedule
            ? `${currentSchedule.StartDate?.substring(0, 10) || "?"} → ${currentSchedule.ExpectedEndDate?.substring(0, 10) || "?"}`
            : `${schedules.length} schedule(s)`;
        return [
            `**Contract #${c.ContractId}** — ${c.ContractDesc || "(untitled)"}`,
            `  Company: ${company} | Type: ${type}`,
            `  Ref: ${c.AlternateReference || "N/A"} | ${scheduleInfo}`,
            `  Link: ${toCrmLink(c.RecordLink)}`,
        ].join("\n");
    });
    return `Found ${filtered.length} contract(s):\n\n${lines.join("\n\n")}`;
}
export async function getContract(args) {
    const client = getClient();
    const expand = [
        "Division($select=DivisionId,Name,SalesLedgerId)",
        "Type($select=Description)",
        "ContractSchedules($select=ScheduleId,Description,CustomerReference,StartDate,ExpectedEndDate,ActualEndDate,Current,Details;$filter=StatusFlag ne 'D';$orderby=StartDate desc)",
    ].join(",");
    const c = await client.getById("Contracts", args.contractId, `$expand=${expand}`);
    const company = c.Division?.Name || "N/A";
    const type = c.Type?.Description || "N/A";
    const schedules = c.ContractSchedules || [];
    let output = [
        `# Contract #${c.ContractId}`,
        `**Description:** ${c.ContractDesc || "N/A"}`,
        `**Type:** ${type}`,
        `**Company:** ${company} (DivisionId: ${c.DivisionId})`,
        `**Alternate Ref:** ${c.AlternateReference || "N/A"}`,
        `**Created:** ${c.Created?.substring(0, 10) || "N/A"}`,
        "",
        c.Details ? `## Details\n${c.Details}\n` : "",
        `## Schedules (${schedules.length})`,
    ].filter(Boolean).join("\n");
    if (schedules.length > 0) {
        const schedLines = schedules.map((s, i) => {
            const current = s.Current ? " **[CURRENT]**" : "";
            const start = s.StartDate?.substring(0, 10) || "N/A";
            const end = s.ExpectedEndDate?.substring(0, 10) || "N/A";
            const actual = s.ActualEndDate ? ` (ended ${s.ActualEndDate.substring(0, 10)})` : "";
            return [
                `${i + 1}. **${s.Description || "Schedule"}** (ID: ${s.ScheduleId})${current}`,
                `   ${start} → ${end}${actual}`,
                `   Customer Ref: ${s.CustomerReference || "N/A"}`,
                s.Details ? `   ${s.Details.substring(0, 100)}` : "",
            ].filter(Boolean).join("\n");
        });
        output += "\n" + schedLines.join("\n\n");
    }
    else {
        output += "\n(no schedules)";
    }
    output += `\n\n**CRM Link:** ${toCrmLink(c.RecordLink)}`;
    return output;
}
export async function searchContractSchedules(args) {
    const client = getClient();
    const filters = ["StatusFlag ne 'D'"];
    if (args.contractId)
        filters.push(`ContractId eq ${args.contractId}`);
    if (args.currentOnly)
        filters.push("Current eq true");
    if (args.expiringBefore)
        filters.push(`ExpectedEndDate le ${args.expiringBefore}`);
    if (args.divisionId)
        filters.push(`Contract/DivisionId eq ${args.divisionId}`);
    const expand = "Contract($select=ContractId,ContractDesc;$expand=Division($select=Name)),MainContact($select=Forename,Surname)";
    const params = [
        `$filter=${filters.join(" and ")}`,
        `$expand=${expand}`,
        `$select=ScheduleId,ContractId,Description,CustomerReference,StartDate,ExpectedEndDate,ActualEndDate,Current`,
        `$orderby=ExpectedEndDate`,
        `$top=${args.top || 20}`,
    ].join("&");
    const result = await client.get("ContractSchedules", params);
    if (result.value.length === 0)
        return "No contract schedules found matching the criteria.";
    const lines = result.value.map((s) => {
        const contract = s.Contract;
        const company = contract?.Division?.Name || "N/A";
        const mainContact = s.MainContact;
        const contactName = mainContact ? `${mainContact.Forename || ""} ${mainContact.Surname || ""}`.trim() : "";
        const current = s.Current ? " [CURRENT]" : "";
        const start = s.StartDate?.substring(0, 10) || "N/A";
        const end = s.ExpectedEndDate?.substring(0, 10) || "N/A";
        return [
            `**Schedule #${s.ScheduleId}**${current} — ${s.Description || contract?.ContractDesc || "(untitled)"}`,
            `  Company: ${company} | Contract #${s.ContractId}`,
            `  ${start} → ${end}${contactName ? ` | Contact: ${contactName}` : ""}`,
            `  Customer Ref: ${s.CustomerReference || "N/A"}`,
        ].join("\n");
    });
    return `Found ${result.value.length} schedule(s):\n\n${lines.join("\n\n")}`;
}
//# sourceMappingURL=contracts.js.map