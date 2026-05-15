/**
 * MCP tool handlers for QuoteLine operations.
 */

import { z } from "zod";
import { getClient } from "../client.js";
import type { QuoteLine } from "../types/prospect.js";
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
    .describe(
      "Custom-field values keyed by ANY of: (1) friendly label when configured (e.g. 'Colour (Extended)'), " +
        "(2) slot identifier 'StandardTextField1..10', 'StandardMemoField1..5', 'StandardDropdownField1..5', " +
        "'StandardDateField1..5', 'StandardDecimalField1..5', 'StandardFlagField1..5', or (3) raw column name " +
        "'x_365_custom_<type>_<n>' (text/memo/dropdown/date/decimal/flag). Pass null to clear a slot. " +
        "Use get_xtra_fields(entityType='QuoteLineXtras', parentId=<lineId>) to see all slots.",
    ),
});

// ─── Handlers ──────────────────────────────────────────────────

export async function addQuoteLine(args: z.infer<typeof addQuoteLineSchema>): Promise<string> {
  const client = getClient();

  const body: Record<string, unknown> = {
    QuoteId: args.quoteId,
    Description: args.description,
  };

  if (args.productItemId !== undefined) body.ProductItemId = args.productItemId;
  if (args.extendedDescription !== undefined) body.ExtendedDescription = args.extendedDescription;
  if (args.taxCode !== undefined) body.TaxCode = args.taxCode;
  if (args.sequence !== undefined) body.Sequence = args.sequence;
  if (args.groupId !== undefined) body.GroupId = args.groupId;

  // Try the Decimal* fields first for price/qty/cost.
  // If Prospect rejects computed fields on write, fall back to raw integer fields.
  if (args.price !== undefined) body.DecimalPrice = args.price;
  if (args.costPrice !== undefined) body.DecimalCostPrice = args.costPrice;
  if (args.discountPercentage !== undefined) body.DecimalDiscountPercentage = args.discountPercentage;

  // Quantity — DecimalQuantity is computed/read-only, so we need the raw fields.
  // Prospect stores quantity as Int64 with 3 implied decimals (QuantityDecimals=3).
  // So Quantity = qty * 1000, e.g. qty 5 → Quantity 5000, qty 2.5 → Quantity 2500.
  if (args.quantity !== undefined) {
    body.Quantity = Math.round(args.quantity * 1000);
    body.QuantityDecimals = 3;
  }

  const created = await client.post<QuoteLine>("QuoteLines", body);

  return [
    `✅ Line added to Quote #${args.quoteId}`,
    `**LineId:** ${created.LineId}`,
    `**Product:** ${created.ProductItemId || "(custom)"}`,
    `**Description:** ${created.Description}`,
    `**Qty:** ${created.DecimalQuantity ?? args.quantity}`,
    `**Price:** £${created.DecimalPrice?.toFixed(2) ?? args.price?.toFixed(2) ?? "N/A"}`,
    `**Net Value:** £${created.DecimalNetValue?.toFixed(2) ?? "pending"}`,
    `**Discount:** ${created.DecimalDiscountPercentage?.toFixed(1) ?? "0"}%`,
  ].join("\n");
}

export async function updateQuoteLine(args: z.infer<typeof updateQuoteLineSchema>): Promise<string> {
  const client = getClient();
  const { lineId, ...fields } = args;

  const body: Record<string, unknown> = {};
  if (fields.description !== undefined) body.Description = fields.description;
  if (fields.extendedDescription !== undefined) body.ExtendedDescription = fields.extendedDescription;
  if (fields.price !== undefined) body.DecimalPrice = fields.price;
  if (fields.costPrice !== undefined) body.DecimalCostPrice = fields.costPrice;
  if (fields.discountPercentage !== undefined) body.DecimalDiscountPercentage = fields.discountPercentage;
  if (fields.taxCode !== undefined) body.TaxCode = fields.taxCode;
  if (fields.sequence !== undefined) body.Sequence = fields.sequence;

  if (fields.quantity !== undefined) {
    body.Quantity = Math.round(fields.quantity * 1000);
    body.QuantityDecimals = 3;
  }

  if (Object.keys(body).length === 0) {
    return "No fields provided to update.";
  }

  await client.patch<QuoteLine>("QuoteLines", lineId, body);

  return `✅ Quote line ${lineId} updated. Fields changed: ${Object.keys(body).join(", ")}`;
}

export async function deleteQuoteLine(args: z.infer<typeof deleteQuoteLineSchema>): Promise<string> {
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
async function upsertQuoteLineXtra(
  lineId: number,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const client = getClient();
  try {
    await client.patch<Record<string, unknown>>("QuoteLineXtras", lineId, body);
  } catch (err) {
    const msg = (err as Error).message || "";
    if (/HTTP 404/.test(msg)) {
      await client.post<Record<string, unknown>>("QuoteLineXtras", {
        QuoteLineId: lineId,
        ...body,
      });
    } else {
      throw err;
    }
  }
  const sp = new URLSearchParams();
  sp.set("$filter", `QuoteLineId eq ${lineId}`);
  sp.set("$top", "1");
  const result = await client.get<Record<string, unknown>>("QuoteLineXtras", sp.toString());
  return result.value[0] ?? { QuoteLineId: lineId, ...body };
}

export async function updateQuoteLineXtra(
  input: z.input<typeof updateQuoteLineXtraSchema>,
): Promise<string> {
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
