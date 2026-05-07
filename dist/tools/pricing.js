/**
 * MCP tool handlers for Pricing — price bands, price lists, and product pricing lookups.
 */
import { z } from "zod";
import { getClient } from "../client.js";
// ─── Schemas ──────────────────────────────────────────────────
export const getPriceBandsSchema = z.object({
    includeObsolete: z.boolean().optional().default(false).describe("Include obsolete price bands"),
});
export const getPriceBandProductPricesSchema = z.object({
    priceBandId: z.number().describe("PriceBandId to list product prices for"),
    productItemId: z.string().optional().describe("Filter to a specific product code"),
    top: z.number().optional().default(50).describe("Max results (default 50)"),
});
export const searchPriceListSchema = z.object({
    productItemId: z.string().optional().describe("Product code/SKU to look up prices for"),
    code: z.string().optional().describe("Price list code"),
    top: z.number().optional().default(50).describe("Max results (default 50)"),
});
export const getProductPricingSchema = z.object({
    productItemId: z.string().describe("Product code/SKU to get all pricing for — returns catalogue price, price band prices, and price list entries"),
});
// ─── Handlers ─────────────────────────────────────────────────
export async function getPriceBands(args) {
    const client = getClient();
    const filter = args.includeObsolete ? "" : "$filter=Obsolete eq false&";
    const params = `${filter}$select=PriceBandId,Description,CurrencyCode&$orderby=Description`;
    const result = await client.get("PriceBands", params);
    if (result.value.length === 0)
        return "No price bands found.";
    const lines = result.value.map((b) => `- **${b.Description}** (ID: ${b.PriceBandId}) — ${b.CurrencyCode || "GBP"}`);
    return `## Price Bands (${result.value.length})\n${lines.join("\n")}`;
}
export async function getPriceBandProductPrices(args) {
    const client = getClient();
    const filters = [`PriceBandId eq ${args.priceBandId}`];
    if (args.productItemId)
        filters.push(`ProductItemId eq '${args.productItemId}'`);
    const params = [
        `$filter=${filters.join(" and ")}`,
        `$select=ProductItemId,DecimalSellingPrice,DecimalCostPrice,DecimalMargin`,
        `$orderby=ProductItemId`,
        `$top=${args.top || 50}`,
    ].join("&");
    const result = await client.get("PriceBandProductPrices", params);
    if (result.value.length === 0)
        return "No product prices found for this price band.";
    const lines = result.value.map((p) => {
        const sell = typeof p.DecimalSellingPrice === "number" ? `£${p.DecimalSellingPrice.toFixed(2)}` : "N/A";
        const cost = typeof p.DecimalCostPrice === "number" ? `£${p.DecimalCostPrice.toFixed(2)}` : "N/A";
        const margin = typeof p.DecimalMargin === "number" ? `${p.DecimalMargin.toFixed(1)}%` : "N/A";
        return `- **${p.ProductItemId}** — Sell: ${sell} | Cost: ${cost} | Margin: ${margin}`;
    });
    return `## Prices in Band ${args.priceBandId} (${result.value.length})\n${lines.join("\n")}`;
}
export async function searchPriceList(args) {
    const client = getClient();
    const filters = ["Obsolete eq 0"];
    if (args.productItemId)
        filters.push(`ProductItemId eq '${args.productItemId}'`);
    if (args.code)
        filters.push(`Code eq '${args.code}'`);
    const params = [
        `$filter=${filters.join(" and ")}`,
        `$select=Code,ProductItemId,LineDescription,SellingPrice,SellDecimals,CurrencyCode`,
        `$orderby=ProductItemId`,
        `$top=${args.top || 50}`,
    ].join("&");
    const result = await client.get("PriceLists", params);
    if (result.value.length === 0)
        return "No price list entries found.";
    const lines = result.value.map((p) => {
        const price = typeof p.SellingPrice === "number" && typeof p.SellDecimals === "number"
            ? `£${(p.SellingPrice / Math.pow(10, p.SellDecimals)).toFixed(2)}`
            : `${p.SellingPrice || "N/A"}`;
        return `- **${p.ProductItemId}** — ${p.LineDescription || "N/A"} — ${price} (list: ${p.Code})`;
    });
    return `## Price List Entries (${result.value.length})\n${lines.join("\n")}`;
}
export async function getProductPricing(args) {
    const client = getClient();
    const sections = [];
    // 1. Catalogue price from ProductItems
    try {
        const products = await client.get("ProductItems", `$filter=ProductItemId eq '${args.productItemId}'&$select=ProductItemId,Description,DecimalSellingPrice,DecimalCostPrice,UnitDescription,CategoryId`);
        if (products.value.length > 0) {
            const p = products.value[0];
            sections.push([
                `## Catalogue Price`,
                `**Product:** ${p.ProductItemId} — ${p.Description || "N/A"}`,
                `**Sell:** £${typeof p.DecimalSellingPrice === "number" ? p.DecimalSellingPrice.toFixed(2) : "N/A"}`,
                `**Cost:** £${typeof p.DecimalCostPrice === "number" ? p.DecimalCostPrice.toFixed(2) : "N/A"}`,
                `**Unit:** ${p.UnitDescription || "N/A"} | **Category:** ${p.CategoryId || "N/A"}`,
            ].join("\n"));
        }
    }
    catch { /* product may not exist */ }
    // 2. Price band prices
    try {
        const bandPrices = await client.get("PriceBandProductPrices", `$filter=ProductItemId eq '${args.productItemId}'&$select=PriceBandId,DecimalSellingPrice,DecimalCostPrice&$expand=PriceBand($select=Description)&$top=20`);
        if (bandPrices.value.length > 0) {
            const lines = bandPrices.value.map((bp) => {
                const band = bp.PriceBand?.Description || `Band ${bp.PriceBandId}`;
                const sell = typeof bp.DecimalSellingPrice === "number" ? `£${bp.DecimalSellingPrice.toFixed(2)}` : "N/A";
                const cost = typeof bp.DecimalCostPrice === "number" ? `£${bp.DecimalCostPrice.toFixed(2)}` : "N/A";
                return `- **${band}** — Sell: ${sell} | Cost: ${cost}`;
            });
            sections.push(`## Price Band Prices (${bandPrices.value.length})\n${lines.join("\n")}`);
        }
    }
    catch { /* no band prices */ }
    // 3. Price list entries
    try {
        const listPrices = await client.get("PriceLists", `$filter=ProductItemId eq '${args.productItemId}' and Obsolete eq 0&$select=Code,LineDescription,SellingPrice,SellDecimals&$top=20`);
        if (listPrices.value.length > 0) {
            const lines = listPrices.value.map((lp) => {
                const price = typeof lp.SellingPrice === "number" && typeof lp.SellDecimals === "number"
                    ? `£${(lp.SellingPrice / Math.pow(10, lp.SellDecimals)).toFixed(2)}`
                    : "N/A";
                return `- **${lp.Code}** — ${lp.LineDescription || "N/A"} — ${price}`;
            });
            sections.push(`## Price List Entries (${listPrices.value.length})\n${lines.join("\n")}`);
        }
    }
    catch { /* no list prices */ }
    if (sections.length === 0) {
        return `No pricing information found for product "${args.productItemId}".`;
    }
    return `# Pricing for ${args.productItemId}\n\n${sections.join("\n\n")}`;
}
//# sourceMappingURL=pricing.js.map