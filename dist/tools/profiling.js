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
/**
 * Format Xtra fields into readable output.
 *
 * The Xtra entities don't have a uniform shape across tenants — DivisionXtra
 * exposes StandardDecimalField1..5 only, has StandardFlagField (not
 * StandardBooleanField), and adds StandardDropdownField1..5 + StandardMemoField1..5.
 * Iterate over whatever the API actually returned, classify by name prefix,
 * and skip null/empty values.
 */
function formatXtraFields(data) {
    const lines = [];
    const buckets = [
        ["Text", /^StandardTextField(\d+)$/],
        ["Decimal", /^StandardDecimalField(\d+)$/],
        ["Date", /^StandardDateField(\d+)$/],
        ["Flag", /^StandardFlagField(\d+)$/],
        ["Boolean", /^StandardBooleanField(\d+)$/],
        ["Memo", /^StandardMemoField(\d+)$/],
        ["Dropdown", /^StandardDropdownField(\d+)$/],
    ];
    for (const [label, pattern] of buckets) {
        const matches = Object.entries(data)
            .map(([k, v]) => {
            const m = pattern.exec(k);
            return m ? { idx: parseInt(m[1], 10), value: v } : null;
        })
            .filter((x) => x !== null && x.value != null && x.value !== "")
            .sort((a, b) => a.idx - b.idx);
        for (const { idx, value } of matches) {
            if (label === "Date" && typeof value === "string" && value.includes("T")) {
                lines.push(`**${label} ${idx}:** ${value.substring(0, 10)}`);
            }
            else {
                lines.push(`**${label} ${idx}:** ${String(value)}`);
            }
        }
    }
    return lines.length > 0 ? lines.join("\n") : "(no custom fields set)";
}
// ─── Handlers ─────────────────────────────────────────────────
export async function getDivisionRfm(args) {
    const client = getClient();
    // Look up the SalesLedgerId from the Division
    const div = await client.getById("Divisions", args.divisionId, "$select=DivisionId,Name,SalesLedgerId");
    const salesLedgerId = div.SalesLedgerId;
    if (!salesLedgerId) {
        return `Division #${args.divisionId} (${div.Name || "N/A"}) has no SalesLedgerId — RFM data requires an account code.`;
    }
    // Query DivisionRfm using SalesLedgerId
    const result = await client.get("DivisionRfm", `$filter=SalesLedgerId eq '${salesLedgerId}'`);
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
        rfm.TotalOrderValue != null ? `- Total Order Value: £${rfm.TotalOrderValue.toFixed(2)}` : "",
        `- Rank: ${rfm.MonetaryValueRank ?? "N/A"}`,
    ].filter(Boolean).join("\n");
}
export async function getXtraFields(args) {
    const client = getClient();
    // Determine the parent key field name based on entity type
    const parentKeyMap = {
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
    // Don't $select — the standard-field shape varies per Xtra entity (e.g.
    // DivisionXtra has only StandardDecimalField1..5 and uses StandardFlagField,
    // not StandardBooleanField). A hardcoded select 400s on those fields.
    // Instead, ask for everything and let the formatter ignore unknown shapes.
    const sp = new URLSearchParams();
    sp.set("$filter", `${parentKey} eq ${args.parentId}`);
    const result = await client.get(args.entityType, sp.toString());
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
export async function getContactProfiling(args) {
    const client = getClient();
    const result = await client.get("ContactProfiling", `$filter=ContactId eq ${args.contactId}`);
    if (result.value.length === 0) {
        return `No profiling/recall data found for ContactId ${args.contactId}.`;
    }
    // Format all fields from the profiling data
    const data = result.value[0];
    const lines = [
        `# Contact Profiling — ContactId ${args.contactId}`,
        "",
    ];
    // Output all non-null fields
    for (const [key, value] of Object.entries(data)) {
        if (value != null && key !== "ContactId" && key !== "@odata.etag") {
            if (typeof value === "string" && value.includes("T") && value.includes("-")) {
                lines.push(`**${key}:** ${value.substring(0, 10)}`);
            }
            else {
                lines.push(`**${key}:** ${value}`);
            }
        }
    }
    return lines.length > 2 ? lines.join("\n") : `Contact profiling record exists for ContactId ${args.contactId} but has no data set.`;
}
//# sourceMappingURL=profiling.js.map