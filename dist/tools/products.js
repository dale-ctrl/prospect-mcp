/**
 * MCP tool handlers for the Product Catalogue — CREATE / UPDATE ProductItem records.
 *
 * Read-side product tooling already exists (search_products, get_product_detail,
 * get_product_pricing in extended.ts / pricing.ts / catalogue.ts). This module adds the
 * write path that was missing: create_product (and a light update_product), so non-catalogue
 * (NC) bespoke items can be created from a Cowork session instead of the Prospect web UI.
 *
 * Entity set: ProductItems  (same set search_products / get_product_pricing read from).
 *
 * KEY + WRITE QUIRKS (confirmed via v1.22.0 smoke test against the live tenant):
 *   1. ProductItem has a COMPOSITE primary key (OperatingCompanyCode + ProductItemId).
 *      Other write-target entities have single-property surrogate keys; here we must
 *      address rows as ProductItems(OperatingCompanyCode='A',ProductItemId='NC...')
 *      for PATCH/GET-by-id, and include OperatingCompanyCode in every POST body.
 *      Pre-v1.22.0, the POST omitted OperatingCompanyCode and the server returned
 *      HTTP 500 "Unable to generate primary key for new record".
 *   2. Prices are stored as integer-pounds × 10^decimals, not decimals. The
 *      computed Decimal* fields (DecimalSellingPrice, DecimalCostPrice) have
 *      meta:Computed="1" + meta:UpdateVisibility="never" — POST silently ignores
 *      them. Send raw SellingPrice (e.g. 1000 for £10.00) + SellDecimals (e.g. 2),
 *      same for CostPrice + CostDecimals. Mirrors the PriceLists read pattern in
 *      pricing.ts (price / 10^decimals to display).
 *   3. UpdateVisibility="never" governs PATCH, NOT POST. Fields like Description,
 *      CategoryId, SellingPrice all have UpdateVisibility="never" but they ARE
 *      writable on POST — that's how the row gets its initial values. Practical
 *      consequence: sell / cost are CREATE-ONLY on this entity. update_product
 *      can't change them via the API (the UI must use a different admin endpoint).
 *   4. CategoryId is required on POST (server-side validation), even though
 *      metadata marks it Nullable. WCG convention for NC items is CategoryId='STOCK'.
 */
import { z } from "zod";
import { getClient } from "../client.js";
import { toCrmLink } from "../lib/urls.js";
// WCG operating company — same as contacts.ts / quotes.ts. ProductItem's
// primary key is composite (OperatingCompanyCode + ProductItemId), so the
// POST body must include BOTH halves or the server returns HTTP 500
// "Unable to generate primary key for new record". Other entity sets
// (Contacts, Inventories, Quotes) have single-property surrogate keys so
// they don't hit this — ProductItems was the only entity where the
// missing field manifested as a 500.
const OPERATING_COMPANY_CODE = "A";
// ─── Helpers ──────────────────────────────────────────────────
/** WCG non-catalogue code: NC + DDMMYY (today) + NN (zero-padded daily sequence). */
function ncPrefixForToday(date = new Date()) {
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const yy = String(date.getFullYear()).slice(-2);
    return `NC${dd}${mm}${yy}`;
}
/**
 * Find the next free NN for today's NC prefix by reading existing ProductItems.
 * Looks at every code beginning NC<DDMMYY>, parses the trailing 2 digits, returns prefix+NN.
 * NOTE: small race window if two users create simultaneously — the caller should re-check on
 * a duplicate-key error and retry with the next number.
 */
async function nextNcCode(client) {
    const prefix = ncPrefixForToday();
    const res = await client.get("ProductItems", `$filter=startswith(ProductItemId,'${prefix}')&$select=ProductItemId&$top=200`);
    let max = 0;
    for (const p of res.value) {
        const code = String(p.ProductItemId ?? "");
        const tail = code.slice(prefix.length); // expect 2 digits
        const n = parseInt(tail, 10);
        if (!Number.isNaN(n) && n > max)
            max = n;
    }
    return `${prefix}${String(max + 1).padStart(2, "0")}`;
}
// ─── Schemas ──────────────────────────────────────────────────
export const createProductSchema = z.object({
    productItemId: z
        .string()
        .optional()
        .describe("Product code / SKU. Omit AND set autoCode=true to auto-generate the next NC code for today (NC+DDMMYY+NN). If supplied, used verbatim."),
    autoCode: z
        .boolean()
        .optional()
        .default(false)
        .describe("When true and productItemId is omitted, generate the next free NC<DDMMYY><NN> code by scanning existing ProductItems. Ignored if productItemId is supplied."),
    description: z.string().describe("Product description (required) — carries to quote lines and Dimensions orders."),
    sellPrice: z.number().describe("Unit sell price in £ (DecimalSellingPrice)."),
    costPrice: z.number().describe("Unit cost price in £ (DecimalCostPrice)."),
    manufacturer: z.string().optional().describe("Supplier / manufacturer name, e.g. 'Hawk Furniture Ltd'."),
    manufacturerReference: z
        .string()
        .optional()
        .describe("Supplier's own product code / manufacturer reference, e.g. 'WESTCOUNTRY-31797'."),
    categoryId: z
        .string()
        .optional()
        .default("STOCK")
        .describe("ProductCategory code (the server requires one — defaults to 'STOCK' which matches every existing WCG NC item). Use get_product_categories to list alternatives."),
    unitDescription: z.string().optional().default("Each").describe("Unit of measure (default 'Each')."),
    salesAnalysis: z
        .string()
        .optional()
        .describe("Access Dimensions sales nominal string, e.g. '10-1-4000-000'. Match a comparable catalogue item if unsure."),
    extendedDescription: z.string().optional().describe("Long-form description / spec (the product blurb shown on quotes)."),
    specification: z.string().optional().describe("Specification notes (internal-facing detail)."),
    internalNotes: z.string().optional().describe("Internal notes."),
    alternateReference1: z.string().optional().describe("Alternate reference 1."),
    alternateReference2: z.string().optional().describe("Alternate reference 2."),
    barcode: z.string().optional().describe("Barcode."),
    taxCode: z.string().optional().describe("Tax / VAT code (defaults to the tenant standard if omitted)."),
    obsolete: z.boolean().optional().default(false).describe("Mark obsolete on creation (default false)."),
});
export const updateProductSchema = z.object({
    productItemId: z
        .string()
        .describe("Product code / SKU (ProductItemId) to update."),
    // Note: sellPrice / costPrice / categoryId / SellingPrice et al. all have
    // meta:UpdateVisibility="never" on this entity and the server rejects PATCHes
    // that try to change them — they're create-only. Use create_product (or the
    // Prospect UI) to set the price; this tool can only flip Obsolete and edit
    // text fields. See quirk note (3) at the top of products.ts.
    description: z.string().optional(),
    manufacturer: z.string().optional(),
    manufacturerReference: z.string().optional(),
    unitDescription: z.string().optional(),
    extendedDescription: z.string().optional(),
    specification: z.string().optional(),
    internalNotes: z.string().optional(),
    obsolete: z.boolean().optional().describe("Mark obsolete / un-obsolete (PATCH-able)."),
});
// ─── Handlers ─────────────────────────────────────────────────
export async function createProduct(args) {
    const client = getClient();
    // 1. Resolve the code
    let code = args.productItemId?.trim();
    if (!code) {
        if (!args.autoCode) {
            return "No productItemId supplied. Either pass productItemId, or set autoCode=true to auto-generate the next NC<DDMMYY><NN> code.";
        }
        code = await nextNcCode(client);
    }
    // 2. Guard against overwriting an existing SKU (ProductItems POST would otherwise clash)
    const existing = await client.get("ProductItems", `$filter=ProductItemId eq '${code}'&$select=ProductItemId&$top=1`);
    if (existing.value.length > 0) {
        return `Product '${code}' already exists. Pick a different code (or use autoCode=true to take the next free NC number), then retry.`;
    }
    // 3. Build the body. Prices use raw integer fields, NOT Decimal* — see quirk
    //    note (2) at the top of this file. £10.00 → SellingPrice=1000, SellDecimals=2.
    const margin = args.sellPrice > 0 ? (((args.sellPrice - args.costPrice) / args.sellPrice) * 100).toFixed(1) : "N/A";
    const PRICE_DECIMALS = 2; // GBP — 2 dp (pence). Matches every existing WCG product.
    const toRawPrice = (pounds) => Math.round(pounds * Math.pow(10, PRICE_DECIMALS));
    const body = {
        OperatingCompanyCode: OPERATING_COMPANY_CODE,
        ProductItemId: code,
        Description: args.description,
        CategoryId: args.categoryId, // schema defaults to "STOCK"; server requires it
        SellingPrice: toRawPrice(args.sellPrice),
        SellDecimals: PRICE_DECIMALS,
        CostPrice: toRawPrice(args.costPrice),
        CostDecimals: PRICE_DECIMALS,
        UnitDescription: args.unitDescription ?? "Each",
        Obsolete: args.obsolete ? 1 : 0,
    };
    if (args.manufacturer !== undefined)
        body.Manufacturer = args.manufacturer;
    if (args.manufacturerReference !== undefined)
        body.ManufacturerReference = args.manufacturerReference;
    if (args.salesAnalysis !== undefined)
        body.SalesAnalysis = args.salesAnalysis;
    if (args.extendedDescription !== undefined)
        body.ExtendedDescription = args.extendedDescription;
    if (args.specification !== undefined)
        body.Specification = args.specification;
    if (args.internalNotes !== undefined)
        body.InternalNotes = args.internalNotes;
    if (args.alternateReference1 !== undefined)
        body.AlternateReference1 = args.alternateReference1;
    if (args.alternateReference2 !== undefined)
        body.AlternateReference2 = args.alternateReference2;
    if (args.barcode !== undefined)
        body.Barcode = args.barcode;
    if (args.taxCode !== undefined)
        body.TaxCode = args.taxCode;
    const created = await client.post("ProductItems", body);
    // Read back so we report the persisted price, not just what we sent.
    const check = await client.get("ProductItems", `$filter=ProductItemId eq '${code}'&$select=ProductItemId,Description,DecimalSellingPrice,DecimalCostPrice,Manufacturer,ManufacturerReference,CategoryId`);
    const p = check.value[0] ?? created;
    const sell = typeof p.DecimalSellingPrice === "number" ? `£${p.DecimalSellingPrice.toFixed(2)}` : "N/A";
    const cost = typeof p.DecimalCostPrice === "number" ? `£${p.DecimalCostPrice.toFixed(2)}` : "N/A";
    const warn = sell === "£0.00" || cost === "£0.00"
        ? "\n\n⚠️ Sell or cost persisted as £0.00. SellingPrice / SellDecimals (raw integer fields) were sent but the server did not honour them — check the live row and the PRICE quirk note at the top of products.ts."
        : "";
    return [
        `Product created successfully!`,
        `**Code:** ${p.ProductItemId}`,
        `**Description:** ${p.Description}`,
        `**Sell:** ${sell} | **Cost:** ${cost} | **Margin:** ${margin}%`,
        `**Supplier:** ${p.Manufacturer ?? "N/A"} | **Mfr Ref:** ${p.ManufacturerReference ?? "N/A"}`,
        `**Category:** ${p.CategoryId ?? "N/A"}`,
        `**CRM Link:** ${toCrmLink(created.RecordLink)}`,
        warn,
    ]
        .filter(Boolean)
        .join("\n");
}
export async function updateProduct(args) {
    const client = getClient();
    const { productItemId, ...fields } = args;
    const body = {};
    if (fields.description !== undefined)
        body.Description = fields.description;
    if (fields.manufacturer !== undefined)
        body.Manufacturer = fields.manufacturer;
    if (fields.manufacturerReference !== undefined)
        body.ManufacturerReference = fields.manufacturerReference;
    if (fields.unitDescription !== undefined)
        body.UnitDescription = fields.unitDescription;
    if (fields.extendedDescription !== undefined)
        body.ExtendedDescription = fields.extendedDescription;
    if (fields.specification !== undefined)
        body.Specification = fields.specification;
    if (fields.internalNotes !== undefined)
        body.InternalNotes = fields.internalNotes;
    if (fields.obsolete !== undefined)
        body.Obsolete = fields.obsolete ? 1 : 0;
    if (Object.keys(body).length === 0)
        return "No fields provided to update.";
    // ProductItem has a COMPOSITE primary key (OperatingCompanyCode + ProductItemId).
    // The single-string-key URL form /ProductItems('NC...') returns HTTP 500 — quirk
    // note (1) in this file. Build the full key expression.
    const keyExpr = `OperatingCompanyCode='${OPERATING_COMPANY_CODE}',ProductItemId='${productItemId}'`;
    await client.patch("ProductItems", keyExpr, body);
    return `Product '${productItemId}' updated. Fields changed: ${Object.keys(body).join(", ")}`;
}
//# sourceMappingURL=products.js.map