/**
 * MCP tool handlers for Sales Order operations.
 * Orders are typically created from quotes (Quote → Order conversion).
 * Most fields are read-only as orders flow from the accounts system.
 */
import { z } from "zod";
import { getClient } from "../client.js";
// ─── Schemas ──────────────────────────────────────────────────
export const searchOrdersSchema = z.object({
    orderNumber: z.string().optional().describe("Order number (exact or partial match)"),
    customerReference: z.string().optional().describe("Customer PO reference (partial match)"),
    divisionId: z.number().optional().describe("Filter by DivisionId (company)"),
    divisionName: z.string().optional().describe("Company name (partial match)"),
    salesPersonId: z.string().optional().describe("Salesperson user code or name"),
    quoteId: z.number().optional().describe("Filter by linked QuoteId"),
    orderStatus: z.string().optional().describe("Order status (e.g. 'Complete', 'Open')"),
    dateFrom: z.string().optional().describe("Orders on or after (ISO date)"),
    dateTo: z.string().optional().describe("Orders on or before (ISO date)"),
    minValue: z.number().optional().describe("Minimum net value (£)"),
    top: z.number().optional().default(20).describe("Max results (default 20)"),
});
export const getOrderSchema = z.object({
    orderNumber: z.string().describe("The OrderNumber to retrieve"),
});
export const reportOrdersByDivisionSchema = z.object({
    divisionId: z.number().describe("DivisionId to get order history for"),
    dateFrom: z.string().optional().describe("Orders on or after (ISO date)"),
    top: z.number().optional().default(50).describe("Max results (default 50)"),
});
// ─── Helpers ──────────────────────────────────────────────────
/** Resolve a user name/code to a user code, same as in reports.ts */
async function resolveUser(input) {
    const client = getClient();
    const result = await client.get("Users", "$select=UserCode,UserName&$filter=Obsolete eq 0");
    const trimmed = input.trim().toUpperCase();
    // Try code match first
    const byCode = result.value.find(u => u.UserCode.toUpperCase() === trimmed);
    if (byCode)
        return byCode.UserCode;
    // Try name match
    const byName = result.value.find(u => (u.UserName || "").toUpperCase().includes(trimmed));
    if (byName)
        return byName.UserCode;
    return input; // Fall through — let the API reject if invalid
}
// ─── Handlers ─────────────────────────────────────────────────
export async function searchOrders(args) {
    const client = getClient();
    const filters = ["Statusflag ne 'D'"];
    if (args.orderNumber)
        filters.push(`contains(OrderNumber,'${args.orderNumber}')`);
    if (args.customerReference)
        filters.push(`contains(CustomerReference,'${args.customerReference}')`);
    if (args.divisionId)
        filters.push(`DivisionId eq ${args.divisionId}`);
    if (args.quoteId)
        filters.push(`QuoteId eq ${args.quoteId}`);
    if (args.orderStatus)
        filters.push(`contains(OrderStatus,'${args.orderStatus}')`);
    if (args.dateFrom)
        filters.push(`OrderDate ge ${args.dateFrom}`);
    if (args.dateTo)
        filters.push(`OrderDate le ${args.dateTo}`);
    if (args.minValue)
        filters.push(`BaseNetValue ge ${args.minValue}`);
    if (args.divisionName) {
        filters.push(`contains(Division/Name,'${args.divisionName}')`);
    }
    if (args.salesPersonId) {
        const code = await resolveUser(args.salesPersonId);
        filters.push(`SalespersonId eq '${code}'`);
    }
    const expand = "Division($select=Name),Salesperson($select=UserName),Quote($select=QuoteId,Description)";
    const params = [
        `$filter=${filters.join(" and ")}`,
        `$expand=${expand}`,
        `$select=OrderNumber,OrderDate,BaseNetValue,BaseGrossValue,CustomerReference,OrderStatus,QuoteId,DivisionId,ShippedDate,DueDate,Comments`,
        `$orderby=OrderDate desc`,
        `$top=${args.top || 20}`,
    ].join("&");
    const result = await client.get("SalesOrderHeaders", params);
    if (result.value.length === 0)
        return "No orders found matching the criteria.";
    const lines = result.value.map((o) => {
        const company = o.Division?.Name || "N/A";
        const salesperson = o.Salesperson?.UserName || "N/A";
        const quote = o.Quote;
        const quoteRef = quote ? `Quote #${quote.QuoteId} (${quote.Description || "N/A"})` : "";
        const date = o.OrderDate?.substring(0, 10) || "N/A";
        const net = typeof o.BaseNetValue === "number" ? `£${o.BaseNetValue.toFixed(2)}` : "N/A";
        const gross = typeof o.BaseGrossValue === "number" ? `£${o.BaseGrossValue.toFixed(2)}` : "N/A";
        return [
            `**Order ${o.OrderNumber}**`,
            `  Company: ${company} | Salesperson: ${salesperson}`,
            `  Date: ${date} | Status: ${o.OrderStatus || "N/A"} | Net: ${net} | Gross: ${gross}`,
            `  Customer Ref: ${o.CustomerReference || "N/A"}`,
            quoteRef ? `  Linked: ${quoteRef}` : "",
            o.ShippedDate ? `  Shipped: ${o.ShippedDate.substring(0, 10)}` : "",
        ].filter(Boolean).join("\n");
    });
    return `Found ${result.value.length} order(s):\n\n${lines.join("\n\n")}`;
}
export async function getOrder(args) {
    const client = getClient();
    const expand = [
        "Division($select=DivisionId,Name,SalesLedgerId)",
        "Salesperson($select=UserCode,UserName)",
        "Quote($select=QuoteId,Description)",
    ].join(",");
    // Composite key: OperatingCompanyCode='A',OrderNumber='...'
    const o = await client.getById("SalesOrderHeaders", `OperatingCompanyCode='A',OrderNumber='${args.orderNumber}'`, `$expand=${expand}`);
    const company = o.Division?.Name || "N/A";
    const accountCode = o.Division?.SalesLedgerId || "N/A";
    const salesperson = o.Salesperson?.UserName || "N/A";
    const quote = o.Quote;
    const deliveryAddr = [o.DeliveryName, o.DeliveryAddressLine1, o.DeliveryAddressLine2, o.DeliveryAddressLine3, o.DeliveryPostcode, o.DeliveryCountry]
        .filter(Boolean).join(", ") || "N/A";
    return [
        `# Order ${o.OrderNumber}`,
        `**Order Number:** ${o.OrderNumber}`,
        `**Company:** ${company} (${accountCode})`,
        `**Salesperson:** ${salesperson}`,
        `**Customer Ref:** ${o.CustomerReference || "N/A"}`,
        `**Order Date:** ${o.OrderDate?.substring(0, 10) || "N/A"}`,
        `**Due Date:** ${o.DueDate?.substring(0, 10) || "N/A"}`,
        `**Shipped:** ${o.ShippedDate?.substring(0, 10) || "N/A"}`,
        `**Status:** ${o.OrderStatus || "N/A"}`,
        "",
        `## Values`,
        `- Net: £${typeof o.BaseNetValue === "number" ? o.BaseNetValue.toFixed(2) : "0.00"}`,
        `- Tax: £${typeof o.BaseTaxValue === "number" ? o.BaseTaxValue.toFixed(2) : "0.00"}`,
        `- Gross: £${typeof o.BaseGrossValue === "number" ? o.BaseGrossValue.toFixed(2) : "0.00"}`,
        "",
        `## Delivery Address`,
        deliveryAddr,
        "",
        `## Linked Records`,
        quote ? `**Quote:** #${quote.QuoteId} — ${quote.Description || "N/A"}` : "**Quote:** N/A",
        `**Tracking:** ${o.DeliveryTrackingReferences || "N/A"}`,
        "",
        o.Comments ? `## Comments\n${o.Comments}` : "",
    ].filter(Boolean).join("\n");
}
export async function reportOrdersByDivision(args) {
    const client = getClient();
    const filters = [`DivisionId eq ${args.divisionId}`, "Statusflag ne 'D'"];
    if (args.dateFrom)
        filters.push(`OrderDate ge ${args.dateFrom}`);
    const params = [
        `$filter=${filters.join(" and ")}`,
        `$select=OrderNumber,OrderDate,BaseNetValue,BaseGrossValue,CustomerReference,OrderStatus`,
        `$orderby=OrderDate desc`,
        `$top=${args.top || 50}`,
        `$count=true`,
    ].join("&");
    const result = await client.get("SalesOrderHeaders", params);
    const total = result["@odata.count"];
    if (result.value.length === 0)
        return "No orders found for this division.";
    let totalNet = 0;
    const lines = result.value.map((o, i) => {
        const net = typeof o.BaseNetValue === "number" ? o.BaseNetValue : 0;
        totalNet += net;
        const date = o.OrderDate?.substring(0, 10) || "N/A";
        return `${i + 1}. **${o.OrderNumber}** — ${date} — £${net.toFixed(2)} — ${o.OrderStatus || "N/A"} — Ref: ${o.CustomerReference || "N/A"}`;
    });
    return [
        `# Order History for Division ${args.divisionId}`,
        `**Total orders:** ${total ?? result.value.length}`,
        `**Showing:** ${result.value.length}`,
        `**Total net value (shown):** £${totalNet.toFixed(2)}`,
        "",
        lines.join("\n"),
    ].join("\n");
}
//# sourceMappingURL=orders.js.map