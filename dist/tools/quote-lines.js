/**
 * MCP tool handlers for QuoteLine operations.
 */
import { z } from "zod";
import { getClient } from "../client.js";
import { loadXtraSlots, resolveXtraFieldsToBody } from "../lib/xtra-labels.js";
// ─── Schemas ───────────────────────────────────────────────────
export const addQuoteLineSchema = z.object({
    quoteId: z.number().describe("The QuoteId to add the line to"),
    productItemId: z.string().optional().describe("Product SKU/code from the catalogue. If provided, may auto-populate price and description."),
    description: z.string().describe("Line item description (required)"),
    quantity: z.number().optional().default(1).describe("Quantity (default 1)"),
    price: z.number().optional().describe("Unit sell price in £. If omitted and productItemId is set, catalogue price may be used."),
    costPrice: z.number().optional().describe("Unit cost price in £"),
    discountPercentage: z.number().optional().describe("Line discount percentage"),
    taxCode: z.string().optional().describe("Tax/VAT code"),
    extendedDescription: z.string().optional().describe("Additional long description or notes"),
    sequence: z.number().optional().describe("Display order sequence number"),
    groupId: z.number().optional().describe("Group ID if this line belongs to a quote line group"),
});
export const updateQuoteLineSchema = z.object({
    lineId: z.number().describe("The LineId of the quote line to update"),
    description: z.string().optional(),
    quantity: z.number().optional(),
    price: z.number().optional().describe("Unit sell price"),
    costPrice: z.number().optional(),
    discountPercentage: z.number().optional(),
    taxCode: z.string().optional(),
    extendedDescription: z.string().optional(),
    sequence: z.number().optional(),
});
export const deleteQuoteLineSchema = z.object({
    lineId: z.number().describe("The LineId of the quote line to delete"),
});
export const updateQuoteLineXtraSchema = z.object({
    lineId: z.number().int().positive().describe("LineId of the QuoteLine whose Xtra row to update (matches QuoteLineXtra.QuoteLineId)."),
    fields: z
        .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
        .describe("Custom-field values keyed by ANY of: (1) friendly label when configured (e.g. 'Colour (Extended)'), " +
        "(2) slot identifier 'StandardTextField1..10', 'StandardMemoField1..5', 'StandardDropdownField1..5', " +
        "'StandardDateField1..5', 'StandardDecimalField1..5', 'StandardFlagField1..5', or (3) raw column name " +
        "'x_365_custom_<type>_<n>' (text/memo/dropdown/date/decimal/flag). Pass null to clear a slot. " +
        "Use get_xtra_fields(entityType='QuoteLineXtras', parentId=<lineId>) to see all slots."),
});
// ─── Handlers ──────────────────────────────────────────────────
// Raw-field write strategy (v1.16.0):
//
// The WCG Prospect tenant's QuoteLines endpoint has two write-path quirks
// confirmed via probes against quote 15521 on 2026-05-21:
//
//   1. POST honours `DecimalPrice` and `DecimalCostPrice`, but the server's
//      post-write automation ZEROES any `DecimalDiscountPercentage` sent on
//      POST. The discount can't be set in the create body — must be applied
//      via a follow-up PATCH.
//
//   2. PATCH on any `Decimal*` computed field returns HTTP 500 ("An error
//      occurred"). The only write path that PATCH accepts is the raw
//      integer backing fields: `Price` (Int64, ×100), `Discount` (Int32,
//      ×100), `CostPrice` (Int64, ×100). The metadata marks these as
//      UpdateVisibility="never" but in practice they're writable and they
//      bypass the recalc cleanly.
//
// Scale: pounds × 100 (SellDecimals=2 / CostDecimals=2), percentage × 100.
// Round explicitly to dodge IEEE-754 multiplication artefacts on values
// like £100.005 or 5.55%.
function poundsToRaw(pounds) {
    return Math.round(pounds * 100);
}
function pctToRaw(pct) {
    return Math.round(pct * 100);
}
export async function addQuoteLine(args) {
    const client = getClient();
    const body = {
        QuoteId: args.quoteId,
        Description: args.description,
    };
    if (args.productItemId !== undefined)
        body.ProductItemId = args.productItemId;
    if (args.extendedDescription !== undefined)
        body.ExtendedDescription = args.extendedDescription;
    if (args.taxCode !== undefined)
        body.TaxCode = args.taxCode;
    if (args.sequence !== undefined)
        body.Sequence = args.sequence;
    if (args.groupId !== undefined)
        body.GroupId = args.groupId;
    // POST honours DecimalPrice / DecimalCostPrice — keep using them here.
    if (args.price !== undefined)
        body.DecimalPrice = args.price;
    if (args.costPrice !== undefined)
        body.DecimalCostPrice = args.costPrice;
    // DecimalDiscountPercentage is deliberately NOT in the POST body — the
    // server zeroes it on create regardless. Discount is applied below via
    // a follow-up PATCH on the raw `Discount` Int32 field.
    // Quantity — DecimalQuantity is computed/read-only, so we need the raw fields.
    // Prospect stores quantity as Int64 with 3 implied decimals (QuantityDecimals=3).
    // So Quantity = qty * 1000, e.g. qty 5 → Quantity 5000, qty 2.5 → Quantity 2500.
    if (args.quantity !== undefined) {
        body.Quantity = Math.round(args.quantity * 1000);
        body.QuantityDecimals = 3;
    }
    const created = await client.post("QuoteLines", body);
    // Follow-up PATCH for discount — only path that survives the POST recalc.
    if (args.discountPercentage !== undefined && args.discountPercentage !== 0 && created.LineId) {
        await client.patch("QuoteLines", created.LineId, {
            Discount: pctToRaw(args.discountPercentage),
        });
    }
    // For the response, prefer the args values where supplied — `created`
    // is stale w.r.t. discount after the follow-up PATCH, and the user's
    // intent is the most useful display anyway.
    const displayDiscount = args.discountPercentage ?? created.DecimalDiscountPercentage ?? 0;
    return [
        `✅ Line added to Quote #${args.quoteId}`,
        `**LineId:** ${created.LineId}`,
        `**Product:** ${created.ProductItemId || "(custom)"}`,
        `**Description:** ${created.Description}`,
        `**Qty:** ${created.DecimalQuantity ?? args.quantity}`,
        `**Price:** £${created.DecimalPrice?.toFixed(2) ?? args.price?.toFixed(2) ?? "N/A"}`,
        `**Net Value:** £${created.DecimalNetValue?.toFixed(2) ?? "pending"}`,
        `**Discount:** ${displayDiscount.toFixed(1)}%`,
    ].join("\n");
}
export async function updateQuoteLine(args) {
    const client = getClient();
    const { lineId, ...fields } = args;
    const body = {};
    if (fields.description !== undefined)
        body.Description = fields.description;
    if (fields.extendedDescription !== undefined)
        body.ExtendedDescription = fields.extendedDescription;
    // Raw integer backing fields for price/cost/discount — see the module-
    // level comment above. PATCH on the Decimal* equivalents returns HTTP 500
    // on this tenant.
    if (fields.price !== undefined)
        body.Price = poundsToRaw(fields.price);
    if (fields.costPrice !== undefined)
        body.CostPrice = poundsToRaw(fields.costPrice);
    if (fields.discountPercentage !== undefined)
        body.Discount = pctToRaw(fields.discountPercentage);
    if (fields.taxCode !== undefined)
        body.TaxCode = fields.taxCode;
    if (fields.sequence !== undefined)
        body.Sequence = fields.sequence;
    if (fields.quantity !== undefined) {
        body.Quantity = Math.round(fields.quantity * 1000);
        body.QuantityDecimals = 3;
    }
    if (Object.keys(body).length === 0) {
        return "No fields provided to update.";
    }
    await client.patch("QuoteLines", lineId, body);
    return `✅ Quote line ${lineId} updated. Fields changed: ${Object.keys(body).join(", ")}`;
}
export async function deleteQuoteLine(args) {
    const client = getClient();
    await client.delete("QuoteLines", args.lineId);
    return `✅ Quote line ${args.lineId} deleted successfully.`;
}
/**
 * PATCH the QuoteLineXtra row for a QuoteLine; if the row doesn't exist
 * (HTTP 404), POST a new one keyed by QuoteLineId.
 *
 * Mirrors the upsert pattern used by upsertDivisionXtra in
 * tools/versa-maintenance.ts. Kept here (rather than shared) because it
 * targets a different entity set and is the only QuoteLineXtra writer.
 */
async function upsertQuoteLineXtra(lineId, body) {
    const client = getClient();
    try {
        await client.patch("QuoteLineXtras", lineId, body);
    }
    catch (err) {
        const msg = err.message || "";
        if (/HTTP 404/.test(msg)) {
            await client.post("QuoteLineXtras", {
                QuoteLineId: lineId,
                ...body,
            });
        }
        else {
            throw err;
        }
    }
    const sp = new URLSearchParams();
    sp.set("$filter", `QuoteLineId eq ${lineId}`);
    sp.set("$top", "1");
    const result = await client.get("QuoteLineXtras", sp.toString());
    return result.value[0] ?? { QuoteLineId: lineId, ...body };
}
export async function updateQuoteLineXtra(input) {
    const args = updateQuoteLineXtraSchema.parse(input);
    const client = getClient();
    if (!args.fields || Object.keys(args.fields).length === 0) {
        return `No fields provided to update on QuoteLineXtra ${args.lineId}.`;
    }
    // Translate {label | identifier | columnName → value} into {identifier → value}
    // for the PATCH body. Resolver accepts all three forms and falls back to
    // the structural slot pattern even if EntityFields returns nothing.
    const slots = await loadXtraSlots(client, "QuoteLineXtras").catch(() => []);
    const body = resolveXtraFieldsToBody(slots, args.fields);
    // Deliberately NOT combined with QuoteLines PATCH — the live tenant
    // triggers price-recalc automation when QuoteLines is touched, and we
    // don't want xtra-field updates to drag the unit price with them.
    await upsertQuoteLineXtra(args.lineId, body);
    return `✅ QuoteLineXtra ${args.lineId} updated. Fields changed: ${Object.keys(body).join(", ")}`;
}
//# sourceMappingURL=quote-lines.js.map