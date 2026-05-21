/**
 * MCP tool handlers for Product Catalogue (categories/families),
 * Contact Preferences, and Division Sales History.
 */
import { z } from "zod";
import { getClient } from "../client.js";
import { toCrmLink } from "../lib/urls.js";
// ─── Schemas ──────────────────────────────────────────────────
export const getProductCategoriesSchema = z.object({
    includeObsolete: z.boolean().optional().default(false).describe("Include obsolete categories"),
});
export const searchProductsByCategorySchema = z.object({
    categoryId: z.string().describe("CategoryId to list products for"),
    top: z.number().optional().default(50).describe("Max results (default 50)"),
});
export const getContactPreferencesSchema = z.object({
    contactId: z.number().describe("ContactId to get preferences for"),
});
export const getDivisionSalesHistorySchema = z.object({
    divisionId: z.number().describe("DivisionId to get sales history for"),
    dateFrom: z.string().optional().describe("Orders on or after (ISO date)"),
    dateTo: z.string().optional().describe("Orders on or before (ISO date)"),
    top: z.number().optional().default(50).describe("Max results (default 50)"),
});
export const createInventorySchema = z.object({
    divisionId: z.number().describe("DivisionId (company) this inventory item belongs to"),
    description: z.string().describe("Item description"),
    typeId: z.string().describe("Inventory type code — use get_inventory_lookups"),
    statusCode: z.string().describe("Status code — use get_inventory_lookups"),
    serialNumber: z.string().optional().describe("Serial number"),
    productItemId: z.string().optional().describe("Product code/SKU"),
    location: z.string().optional().describe("Physical location"),
    versionNumber: z.string().optional().describe("Version/model number"),
    instances: z.number().optional().describe("Number of instances/units"),
    extendedDescription: z.string().optional().describe("Extended notes"),
    documentRef: z.string().optional().describe("Document reference"),
    invoiceNumber: z.string().optional().describe("Invoice number"),
    manufacturerReference: z.string().optional().describe("Manufacturer reference"),
    contractReference: z.string().optional().describe("Contract reference"),
});
export const updateInventorySchema = z.object({
    inventoryId: z.number().describe("The InventoryId to update"),
    description: z.string().optional(),
    serialNumber: z.string().optional(),
    location: z.string().optional(),
    versionNumber: z.string().optional(),
    instances: z.number().optional(),
    extendedDescription: z.string().optional(),
    documentRef: z.string().optional(),
    invoiceNumber: z.string().optional(),
    manufacturerReference: z.string().optional(),
    contractReference: z.string().optional(),
});
export const getInventoryLookupsSchema = z.object({});
// ─── Handlers ─────────────────────────────────────────────────
export async function getProductCategories(args) {
    const client = getClient();
    const filter = args.includeObsolete ? "" : "$filter=Obsolete eq 0&";
    const params = `${filter}$select=CategoryId,Description&$orderby=Description&$top=200`;
    const result = await client.get("ProductCategories", params);
    if (result.value.length === 0)
        return "No product categories found.";
    const lines = result.value.map((c) => `- \`${c.CategoryId}\` — ${c.Description || "(no description)"}`);
    return `## Product Categories (${result.value.length})\n${lines.join("\n")}`;
}
export async function searchProductsByCategory(args) {
    const client = getClient();
    const params = [
        `$filter=CategoryId eq '${args.categoryId}' and Obsolete eq 0`,
        `$select=ProductItemId,Description,DecimalSellingPrice,DecimalCostPrice,UnitDescription,DecimalQuantityAvailable`,
        `$orderby=Description`,
        `$top=${args.top || 50}`,
    ].join("&");
    const result = await client.get("ProductItems", params);
    if (result.value.length === 0)
        return `No products found in category "${args.categoryId}".`;
    const lines = result.value.map((p) => {
        const sell = typeof p.DecimalSellingPrice === "number" ? `£${p.DecimalSellingPrice.toFixed(2)}` : "N/A";
        const cost = typeof p.DecimalCostPrice === "number" ? `£${p.DecimalCostPrice.toFixed(2)}` : "N/A";
        const stock = p.DecimalQuantityAvailable ?? "N/A";
        return `- **${p.ProductItemId}** — ${p.Description || "N/A"} | Sell: ${sell} | Cost: ${cost} | Stock: ${stock}`;
    });
    return `## Products in ${args.categoryId} (${result.value.length})\n${lines.join("\n")}`;
}
export async function getContactPreferences(args) {
    const client = getClient();
    const result = await client.get("ContactPreferences", `$filter=ContactID eq ${args.contactId}`);
    if (result.value.length === 0)
        return `No preferences found for contact ${args.contactId}.`;
    const pref = result.value[0];
    const flags = [];
    for (let i = 1; i <= 20; i++) {
        const key = `Flag${i}`;
        if (pref[key] !== undefined && pref[key] !== null) {
            flags.push(`- Flag ${i}: ${pref[key] ? "Yes" : "No"}`);
        }
    }
    if (flags.length === 0)
        return `Contact ${args.contactId} has no preference flags set.`;
    return `## Contact Preferences (Contact ${args.contactId})\n${flags.join("\n")}`;
}
export async function getDivisionSalesHistory(args) {
    const client = getClient();
    // Look up division name for display
    const div = await client.getById("Divisions", args.divisionId, "$select=DivisionId,Name");
    const filters = [`DivisionId eq ${args.divisionId}`];
    if (args.dateFrom)
        filters.push(`OrderDate ge ${args.dateFrom}`);
    if (args.dateTo)
        filters.push(`OrderDate le ${args.dateTo}`);
    const params = [
        `$filter=${filters.join(" and ")}`,
        `$select=ProductReference,LineProductDescription,QtyOrdered,QtyDelivered,QtyInvoiced,Price,OrderNo,OrderDate,InvoiceNo,CustomerReference`,
        `$orderby=OrderDate desc`,
        `$top=${args.top || 50}`,
    ].join("&");
    const result = await client.get("DivisionSalesHistory", params);
    if (result.value.length === 0)
        return `No sales history found for ${div.Name}.`;
    let totalValue = 0;
    const lines = result.value.map((h, i) => {
        const date = h.OrderDate?.substring(0, 10) || "N/A";
        const price = typeof h.Price === "number" ? h.Price : 0;
        const qty = typeof h.QtyOrdered === "number" ? h.QtyOrdered : 0;
        const lineVal = price * qty;
        totalValue += lineVal;
        return [
            `${i + 1}. **${h.ProductReference || "N/A"}** — ${h.LineProductDescription || "N/A"}`,
            `   Qty: ${qty} × £${price.toFixed(2)} = £${lineVal.toFixed(2)}`,
            `   Order: ${h.OrderNo || "N/A"} (${date}) | Invoice: ${h.InvoiceNo || "N/A"} | Ref: ${h.CustomerReference || "N/A"}`,
        ].join("\n");
    });
    return [
        `# Sales History — ${div.Name}`,
        `**Showing:** ${result.value.length} line(s)`,
        `**Total value (shown):** £${totalValue.toFixed(2)}`,
        "",
        lines.join("\n\n"),
    ].join("\n");
}
export async function createInventory(args) {
    const client = getClient();
    const body = {
        DivisionId: args.divisionId,
        Description: args.description,
        TypeId: args.typeId,
        StatusCode: args.statusCode,
    };
    if (args.serialNumber !== undefined)
        body.SerialNumber = args.serialNumber;
    if (args.productItemId !== undefined)
        body.ProductItemId = args.productItemId;
    if (args.location !== undefined)
        body.Location = args.location;
    if (args.versionNumber !== undefined)
        body.VersionNumber = args.versionNumber;
    if (args.instances !== undefined)
        body.Instances = args.instances;
    if (args.extendedDescription !== undefined)
        body.ExtendedDescription = args.extendedDescription;
    if (args.documentRef !== undefined)
        body.DocumentRef = args.documentRef;
    if (args.invoiceNumber !== undefined)
        body.InvoiceNumber = args.invoiceNumber;
    if (args.manufacturerReference !== undefined)
        body.ManufacturerReference = args.manufacturerReference;
    if (args.contractReference !== undefined)
        body.ContractReference = args.contractReference;
    const created = await client.post("Inventories", body);
    return [
        `Inventory item created successfully!`,
        `**InventoryId:** ${created.InventoryId}`,
        `**Description:** ${created.Description || args.description}`,
        `**DivisionId:** ${args.divisionId}`,
        `**Type:** ${args.typeId}`,
        `**Status:** ${args.statusCode}`,
        `**Serial:** ${created.SerialNumber || "N/A"}`,
        `**CRM Link:** ${toCrmLink(created.RecordLink)}`,
    ].join("\n");
}
export async function updateInventory(args) {
    const client = getClient();
    const { inventoryId, ...fields } = args;
    const body = {};
    if (fields.description !== undefined)
        body.Description = fields.description;
    if (fields.serialNumber !== undefined)
        body.SerialNumber = fields.serialNumber;
    if (fields.location !== undefined)
        body.Location = fields.location;
    if (fields.versionNumber !== undefined)
        body.VersionNumber = fields.versionNumber;
    if (fields.instances !== undefined)
        body.Instances = fields.instances;
    if (fields.extendedDescription !== undefined)
        body.ExtendedDescription = fields.extendedDescription;
    if (fields.documentRef !== undefined)
        body.DocumentRef = fields.documentRef;
    if (fields.invoiceNumber !== undefined)
        body.InvoiceNumber = fields.invoiceNumber;
    if (fields.manufacturerReference !== undefined)
        body.ManufacturerReference = fields.manufacturerReference;
    if (fields.contractReference !== undefined)
        body.ContractReference = fields.contractReference;
    if (Object.keys(body).length === 0) {
        return "No fields provided to update.";
    }
    await client.patch("Inventories", inventoryId, body);
    return `Inventory #${inventoryId} updated successfully. Fields changed: ${Object.keys(body).join(", ")}`;
}
export async function getInventoryLookups() {
    const client = getClient();
    const [types, statuses] = await Promise.all([
        client.get("InventoryTypes", "$select=Code,Description&$orderby=Description"),
        client.get("InventoryStatus", "$select=StatusCode,Description&$orderby=Description"),
    ]);
    const typeLines = types.value.map(t => `- \`${t.Code}\` — ${t.Description}`);
    const statusLines = statuses.value.map(s => `- \`${s.StatusCode}\` — ${s.Description}`);
    return [
        `## Inventory Types (${types.value.length})`,
        typeLines.join("\n"),
        "",
        `## Inventory Statuses (${statuses.value.length})`,
        statusLines.join("\n"),
    ].join("\n");
}
//# sourceMappingURL=catalogue.js.map