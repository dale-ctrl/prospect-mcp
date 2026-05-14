/**
 * MCP tool handlers for Lead (Opportunity) operations.
 * In Prospect365, "Opportunities" are modelled as Leads.
 */
import { z } from "zod";
import { getClient } from "../client.js";
// ─── Schemas ───────────────────────────────────────────────────
export const searchOpportunitiesSchema = z.object({
    description: z.string().optional().describe("Search term to match against Description"),
    contactName: z.string().optional().describe("Contact forename/surname (partial match)"),
    divisionName: z.string().optional().describe("Company/division name (partial match)"),
    salesPersonId: z.string().optional().describe("Salesperson user code, e.g. 'DL'"),
    statusDescription: z.string().optional().describe("Status description, e.g. 'Qualified', 'Proposal'"),
    statusDetail: z
        .string()
        .optional()
        .describe("Status Detail label (partial match, e.g. 'Uncompetitive') or exact StatusDetailId code. Use get_lead_lookups(kind='statusDetails') to see the list."),
    pipelineId: z.string().optional().describe("Pipeline code to filter by"),
    dateFrom: z.string().optional().describe("Created on or after (ISO date)"),
    dateTo: z.string().optional().describe("Created on or before (ISO date)"),
    includeClosed: z.boolean().optional().default(false).describe("Include closed/dead opportunities (default false)"),
    top: z.number().optional().default(20).describe("Max results (default 20)"),
});
export const getOpportunitySchema = z.object({
    leadId: z.number().describe("The LeadId to retrieve"),
});
export const createOpportunitySchema = z.object({
    contactId: z.number().describe("ContactId for the opportunity. Use search_contacts to find this."),
    sizeId: z.string().describe("LeadSize code (required). Use get_lead_lookups to list available codes."),
    statusId: z.string().describe("LeadStatus code (required). Use get_lead_lookups to list available codes."),
    divisionId: z.number().optional().describe("DivisionId — auto-derived from contact if omitted"),
    addressId: z.number().optional().describe("AddressId — auto-derived from contact if omitted"),
    typeId: z.string().optional().describe("LeadType code"),
    pipelineId: z.string().optional().describe("LeadPipeline code"),
    sourceId: z.string().optional().describe("LeadSource code"),
    sourceOther: z.string().optional().describe("Free-text source (when SourceId is 'OTHER')"),
    marginId: z.string().optional().describe("Margin band code"),
    salesPersonId: z.string().optional().describe("Salesperson user code, e.g. 'DL'"),
    description: z.string().optional().describe("Short title/description of the opportunity"),
    situationSummary: z.string().optional().describe("Longer narrative of the situation"),
    alternateReference: z.string().optional().describe("External reference"),
    value: z.number().optional().describe("Estimated value (base currency)"),
    marginValue: z.number().optional().describe("Estimated margin value"),
    estimatedClose: z.string().optional().describe("Estimated close date (ISO format)"),
    autocalculateValue: z.boolean().optional().describe("Auto-calculate value from weighted projections"),
});
export const updateOpportunitySchema = z.object({
    leadId: z.number().describe("The LeadId to update"),
    sizeId: z.string().optional(),
    statusId: z.string().optional(),
    typeId: z.string().optional(),
    pipelineId: z.string().optional(),
    sourceId: z.string().optional(),
    sourceOther: z.string().optional(),
    marginId: z.string().optional(),
    salesPersonId: z.string().optional(),
    description: z.string().optional(),
    situationSummary: z.string().optional(),
    alternateReference: z.string().optional(),
    value: z.number().optional(),
    marginValue: z.number().optional(),
    estimatedClose: z.string().optional(),
    autocalculateValue: z.boolean().optional(),
});
export const getLeadLookupsSchema = z.object({
    kind: z
        .enum(["statuses", "statusDetails", "sizes", "sources", "types", "pipelines", "all"])
        .optional()
        .default("all")
        .describe("Which lookup table to fetch (default: all)"),
    includeObsolete: z.boolean().optional().default(false).describe("Include obsolete codes (default false)"),
});
// ─── Handlers ──────────────────────────────────────────────────
export async function searchOpportunities(args) {
    const client = getClient();
    const filters = [];
    const expand = "Contact($select=Forename,Surname;$expand=Division($select=Name)),Status($select=Description),StatusDetail($select=Code,Description),SalesPerson($select=UserName),Pipeline($select=Description)";
    if (args.description)
        filters.push(`contains(Description,'${args.description}')`);
    if (args.contactName) {
        filters.push(`(contains(Contact/Forename,'${args.contactName}') or contains(Contact/Surname,'${args.contactName}'))`);
    }
    if (args.divisionName)
        filters.push(`contains(Contact/Division/Name,'${args.divisionName}')`);
    if (args.salesPersonId)
        filters.push(`SalesPersonId eq '${args.salesPersonId}'`);
    if (args.statusDescription)
        filters.push(`contains(Status/Description,'${args.statusDescription}')`);
    if (args.statusDetail) {
        // Match on label (partial) OR exact code so callers can pass either.
        const escaped = args.statusDetail.replace(/'/g, "''");
        filters.push(`(contains(StatusDetail/Description,'${escaped}') or StatusDetailId eq '${escaped}')`);
    }
    if (args.pipelineId)
        filters.push(`PipelineId eq '${args.pipelineId}'`);
    if (args.dateFrom)
        filters.push(`Created ge ${args.dateFrom}`);
    if (args.dateTo)
        filters.push(`Created le ${args.dateTo}`);
    filters.push("StatusFlag ne 'D'");
    if (!args.includeClosed) {
        filters.push("Status/DeadFlag eq 0");
    }
    const params = [
        `$expand=${expand}`,
        `$orderby=Created desc`,
        `$top=${args.top || 20}`,
        `$select=LeadId,Description,Value,WeightedValue,EstimatedClose,Guttometer,Created,LastSpoke,RecordLink`,
    ];
    if (filters.length > 0)
        params.push(`$filter=${filters.join(" and ")}`);
    const result = await client.get("Leads", params.join("&"));
    if (result.value.length === 0)
        return "No opportunities found matching the search criteria.";
    const lines = result.value.map((l) => {
        const contact = l.Contact ? `${l.Contact.Forename || ""} ${l.Contact.Surname || ""}`.trim() : "N/A";
        const company = l.Contact?.Division?.Name || "N/A";
        const status = l.Status?.Description || "Unknown";
        const detailLabel = l.StatusDetail?.Description || (l.StatusDetailId ? l.StatusDetailId : null);
        const statusCol = detailLabel ? `${status} (${detailLabel})` : status;
        const pipeline = l.Pipeline?.Description || "—";
        const salesperson = l.SalesPerson?.UserName || l.SalesPersonId || "N/A";
        return [
            `**Opportunity #${l.LeadId}** — ${l.Description || "(no description)"}`,
            `  Company: ${company} | Contact: ${contact}`,
            `  Status: ${statusCol} | Pipeline: ${pipeline} | Salesperson: ${salesperson}`,
            `  Value: £${l.Value?.toFixed(2) ?? "0.00"} | Weighted: £${l.WeightedValue?.toFixed(2) ?? "0.00"} | Confidence: ${l.Guttometer ?? 0}%`,
            `  Est. Close: ${l.EstimatedClose?.substring(0, 10) || "N/A"} | Created: ${l.Created?.substring(0, 10) || "N/A"}`,
            `  Link: ${l.RecordLink || "N/A"}`,
        ].join("\n");
    });
    return `Found ${result.value.length} opportunity(ies):\n\n${lines.join("\n\n")}`;
}
export async function getOpportunity(args) {
    const client = getClient();
    const expand = [
        "Contact($select=ContactId,Forename,Surname,Email,PhoneNumber;$expand=Division($select=DivisionId,Name,SalesLedgerId))",
        "Status($select=Code,Description)",
        "StatusDetail($select=Code,Description)",
        "Size($select=Code,Description)",
        "Source($select=Code,Description)",
        "Type($select=Code,Description)",
        "Pipeline($select=Code,Description)",
        "SalesPerson($select=UserCode,UserName)",
        "Owner($select=UserCode,UserName)",
    ].join(",");
    const lead = await client.getById("Leads", args.leadId, `$expand=${expand}`);
    const contact = lead.Contact ? `${lead.Contact.Forename || ""} ${lead.Contact.Surname || ""}`.trim() : "N/A";
    const company = lead.Contact?.Division?.Name || "N/A";
    const accountCode = lead.Contact?.Division?.SalesLedgerId || "N/A";
    const detailLabel = lead.StatusDetail?.Description || (lead.StatusDetailId ?? "—");
    const detailCode = lead.StatusDetailId ?? "—";
    return [
        `# Opportunity #${lead.LeadId}`,
        `**Description:** ${lead.Description || "(none)"}`,
        `**Status:** ${lead.Status?.Description || lead.StatusId}`,
        `**Status Detail:** ${detailLabel}${lead.StatusDetailId && lead.StatusDetail?.Description ? ` (${detailCode})` : ""}`,
        `**Size:** ${lead.Size?.Description || lead.SizeId}`,
        `**Type:** ${lead.Type?.Description || lead.TypeId || "—"}`,
        `**Pipeline:** ${lead.Pipeline?.Description || lead.PipelineId || "—"}`,
        `**Source:** ${lead.Source?.Description || lead.SourceId || "—"}${lead.SourceOther ? ` (${lead.SourceOther})` : ""}`,
        `**Company:** ${company} (${accountCode})`,
        `**Contact:** ${contact} (ID: ${lead.ContactId})`,
        `**Salesperson:** ${lead.SalesPerson?.UserName || lead.SalesPersonId || "N/A"}`,
        `**Owner:** ${lead.Owner?.UserName || lead.OwnerId}`,
        `**Alternate Ref:** ${lead.AlternateReference || "—"}`,
        "",
        `## Values`,
        `- Value: £${lead.Value?.toFixed(2) ?? "0.00"}`,
        `- Weighted: £${lead.WeightedValue?.toFixed(2) ?? "0.00"}`,
        `- Worst / Likely / Best: £${lead.WorstValue?.toFixed(2) ?? "0.00"} / £${lead.LikelyValue?.toFixed(2) ?? "0.00"} / £${lead.BestValue?.toFixed(2) ?? "0.00"}`,
        `- Margin: £${lead.MarginValue?.toFixed(2) ?? "0.00"}`,
        `- Confidence (Guttometer): ${lead.Guttometer ?? 0}%`,
        `- Autocalculate: ${lead.AutocalculateValue ? "yes" : "no"}`,
        "",
        `## Dates`,
        `- Created: ${lead.Created?.substring(0, 10) || "N/A"}`,
        `- Estimated Close: ${lead.EstimatedClose?.substring(0, 10) || "N/A"}`,
        `- Status Changed: ${lead.StatusChanged?.substring(0, 10) || "N/A"}`,
        `- Last Spoke: ${lead.LastSpoke?.substring(0, 10) || "N/A"}`,
        `- First Active Engagement: ${lead.FirstActiveEngagement?.substring(0, 10) || "N/A"}`,
        `- Last Active Engagement: ${lead.LastActiveEngagement?.substring(0, 10) || "N/A"}`,
        `- Close Date: ${lead.CloseDate?.substring(0, 10) || "N/A"}`,
        "",
        `## Situation Summary`,
        lead.SituationSummary || "(none)",
        "",
        `**CRM Link:** ${lead.RecordLink || "N/A"}`,
    ].join("\n");
}
export async function createOpportunity(args) {
    const client = getClient();
    // Auto-derive DivisionId and AddressId from Contact if not provided
    let divisionId = args.divisionId;
    let addressId = args.addressId;
    if (divisionId === undefined || addressId === undefined) {
        const contact = await client.getById("Contacts", args.contactId, "$select=ContactId,DivisionId,AddressId");
        if (divisionId === undefined)
            divisionId = contact.DivisionId;
        if (addressId === undefined)
            addressId = contact.AddressId;
        if (addressId === undefined) {
            throw new Error(`Could not derive AddressId from Contact ${args.contactId}. Please pass addressId explicitly.`);
        }
    }
    const body = {
        ContactId: args.contactId,
        DivisionId: divisionId,
        AddressId: addressId,
        SizeId: args.sizeId,
        StatusId: args.statusId,
    };
    if (args.typeId !== undefined)
        body.TypeId = args.typeId;
    if (args.pipelineId !== undefined)
        body.PipelineId = args.pipelineId;
    if (args.sourceId !== undefined)
        body.SourceId = args.sourceId;
    if (args.sourceOther !== undefined)
        body.SourceOther = args.sourceOther;
    if (args.marginId !== undefined)
        body.MarginId = args.marginId;
    if (args.salesPersonId !== undefined)
        body.SalesPersonId = args.salesPersonId;
    if (args.description !== undefined)
        body.Description = args.description;
    if (args.situationSummary !== undefined)
        body.SituationSummary = args.situationSummary;
    if (args.alternateReference !== undefined)
        body.AlternateReference = args.alternateReference;
    if (args.value !== undefined)
        body.Value = args.value;
    if (args.marginValue !== undefined)
        body.MarginValue = args.marginValue;
    if (args.estimatedClose !== undefined)
        body.EstimatedClose = args.estimatedClose;
    if (args.autocalculateValue !== undefined)
        body.AutocalculateValue = args.autocalculateValue;
    const created = await client.post("Leads", body);
    return [
        `✅ Opportunity created successfully!`,
        `**LeadId:** ${created.LeadId}`,
        `**Description:** ${created.Description || "(none)"}`,
        `**Contact:** ${created.ContactId} | Division: ${created.DivisionId}`,
        `**Status:** ${created.StatusId} | Size: ${created.SizeId}`,
        `**Value:** £${created.Value?.toFixed(2) ?? "0.00"}`,
        `**Estimated Close:** ${created.EstimatedClose?.substring(0, 10) || "N/A"}`,
        `**Created:** ${created.Created?.substring(0, 10) || "now"}`,
        `**CRM Link:** ${created.RecordLink || "N/A"}`,
    ].join("\n");
}
export async function updateOpportunity(args) {
    const client = getClient();
    const { leadId, ...fields } = args;
    const body = {};
    if (fields.sizeId !== undefined)
        body.SizeId = fields.sizeId;
    if (fields.statusId !== undefined)
        body.StatusId = fields.statusId;
    if (fields.typeId !== undefined)
        body.TypeId = fields.typeId;
    if (fields.pipelineId !== undefined)
        body.PipelineId = fields.pipelineId;
    if (fields.sourceId !== undefined)
        body.SourceId = fields.sourceId;
    if (fields.sourceOther !== undefined)
        body.SourceOther = fields.sourceOther;
    if (fields.marginId !== undefined)
        body.MarginId = fields.marginId;
    if (fields.salesPersonId !== undefined)
        body.SalesPersonId = fields.salesPersonId;
    if (fields.description !== undefined)
        body.Description = fields.description;
    if (fields.situationSummary !== undefined)
        body.SituationSummary = fields.situationSummary;
    if (fields.alternateReference !== undefined)
        body.AlternateReference = fields.alternateReference;
    if (fields.value !== undefined)
        body.Value = fields.value;
    if (fields.marginValue !== undefined)
        body.MarginValue = fields.marginValue;
    if (fields.estimatedClose !== undefined)
        body.EstimatedClose = fields.estimatedClose;
    if (fields.autocalculateValue !== undefined)
        body.AutocalculateValue = fields.autocalculateValue;
    if (Object.keys(body).length === 0) {
        return "No fields provided to update. Specify at least one field to change.";
    }
    await client.patch("Leads", leadId, body);
    return `✅ Opportunity #${leadId} updated successfully. Fields changed: ${Object.keys(body).join(", ")}`;
}
export async function getLeadLookups(args) {
    const client = getClient();
    const kind = args.kind || "all";
    const includeObsolete = args.includeObsolete || false;
    const obsoleteFilter = includeObsolete ? "" : "$filter=Obsolete eq 0&";
    const sections = [];
    const fetchAndFormat = async (label, entitySet, select) => {
        const params = `${obsoleteFilter}$select=${select}&$orderby=Description&$top=200`;
        const res = await client.get(entitySet, params);
        if (res.value.length === 0)
            return `## ${label}\n(none)`;
        const rows = res.value.map((r) => `- \`${r.Code}\` — ${r.Description || "(no description)"}`);
        return `## ${label} (${res.value.length})\n${rows.join("\n")}`;
    };
    if (kind === "statuses" || kind === "all") {
        sections.push(await fetchAndFormat("Lead Statuses", "LeadStatus", "Code,Description"));
    }
    if (kind === "statusDetails" || kind === "all") {
        const params = `${obsoleteFilter}$select=StatusId,Code,Description&$orderby=StatusId,Sequence&$top=500`;
        const res = await client.get("LeadStatusDetails", params);
        if (res.value.length === 0) {
            sections.push("## Lead Status Details\n(none)");
        }
        else {
            // Group by parent status code for readability while still listing every row.
            const groups = new Map();
            for (const r of res.value) {
                const key = r.StatusId || "(no-parent)";
                if (!groups.has(key))
                    groups.set(key, []);
                groups.get(key).push(r);
            }
            const blocks = [];
            for (const [parent, rows] of groups) {
                const lines = rows.map((r) => `- \`${r.Code}\` — ${r.Description || "(no description)"} (parent: \`${r.StatusId}\`)`);
                blocks.push(`### Parent Status: ${parent} (${rows.length})\n${lines.join("\n")}`);
            }
            sections.push(`## Lead Status Details (${res.value.length})\n${blocks.join("\n\n")}`);
        }
    }
    if (kind === "sizes" || kind === "all") {
        sections.push(await fetchAndFormat("Lead Sizes", "LeadSizes", "Code,Description"));
    }
    if (kind === "sources" || kind === "all") {
        sections.push(await fetchAndFormat("Lead Sources", "LeadSources", "Code,Description"));
    }
    if (kind === "types" || kind === "all") {
        sections.push(await fetchAndFormat("Lead Types", "LeadTypes", "Code,Description"));
    }
    if (kind === "pipelines" || kind === "all") {
        sections.push(await fetchAndFormat("Lead Pipelines", "LeadPipelines", "Code,Description"));
    }
    return sections.join("\n\n");
}
//# sourceMappingURL=opportunities.js.map