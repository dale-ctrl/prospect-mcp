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
 * PRICE STORAGE NOTE (verify on first live deploy):
 *   The read-side selects DecimalSellingPrice / DecimalCostPrice and they round-trip fine on
 *   GET. add_quote_line POSTs DecimalPrice directly and the server honours it on POST (it is
 *   only PATCH on the Decimal* computed fields that gets clobbered — see the quote-line
 *   pitfalls). We therefore POST DecimalSellingPrice / DecimalCostPrice here. If a live test
 *   shows the created product comes back with £0.00 sell/cost, switch to the raw integer
 *   backing fields instead: SellingPrice (pounds × 10^SellDecimals) + SellDecimals, and the
 *   matching CostPrice / CostDecimals — mirroring the PriceLists pattern in pricing.ts.
 */

import { z } from "zod";
import { getClient } from "../client.js";
import { toCrmLink } from "../lib/urls.js";

// ─── Helpers ──────────────────────────────────────────────────

/** WCG non-catalogue code: NC + DDMMYY (today) + NN (zero-padded daily sequence). */
function ncPrefixForToday(date = new Date()): string {
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
async function nextNcCode(client: ReturnType<typeof getClient>): Promise<string> {
  const prefix = ncPrefixForToday();
  const res = await client.get<Record<string, unknown>>(
    "ProductItems",
    `$filter=startswith(ProductItemId,'${prefix}')&$select=ProductItemId&$top=200`
  );
  let max = 0;
  for (const p of res.value) {
    const code = String(p.ProductItemId ?? "");
    const tail = code.slice(prefix.length); // expect 2 digits
    const n = parseInt(tail, 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(2, "0")}`;
}

// ─── Schemas ──────────────────────────────────────────────────

export const createProductSchema = z.object({
  productItemId: z
    .string()
    .optional()
    .describe(
      "Product code / SKU. Omit AND set autoCode=true to auto-generate the next NC code for today (NC+DDMMYY+NN). If supplied, used verbatim."
    ),
  autoCode: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "When true and productItemId is omitted, generate the next free NC<DDMMYY><NN> code by scanning existing ProductItems. Ignored if productItemId is supplied."
    ),
  description: z.string().describe("Product description (required) — carries to quote lines and Dimensions orders."),
  sellPrice: z.number().describe("Unit sell price in £ (DecimalSellingPrice)."),
  costPrice: z.number().describe("Unit cost price in £ (DecimalCostPrice)."),
  manufacturer: z.string().optional().describe("Supplier / manufacturer name, e.g. 'Hawk Furniture Ltd'."),
  manufacturerReference: z
    .string()
    .optional()
    .describe("Supplier's own product code / manufacturer reference, e.g. 'WESTCOUNTRY-31797'."),
  categoryId: z.string().optional().describe("ProductCategory code — use get_product_categories to list."),
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
  productItemId: z.string().describe("Product code / SKU (ProductItemId) to update."),
  description: z.string().optional(),
  sellPrice: z.number().optional().describe("Unit sell price in £ (DecimalSellingPrice)."),
  costPrice: z.number().optional().describe("Unit cost price in £ (DecimalCostPrice)."),
  manufacturer: z.string().optional(),
  manufacturerReference: z.string().optional(),
  categoryId: z.string().optional(),
  unitDescription: z.string().optional(),
  salesAnalysis: z.string().optional(),
  extendedDescription: z.string().optional(),
  specification: z.string().optional(),
  internalNotes: z.string().optional(),
  obsolete: z.boolean().optional(),
});

// ─── Handlers ─────────────────────────────────────────────────

export async function createProduct(args: z.infer<typeof createProductSchema>): Promise<string> {
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
  const existing = await client.get<Record<string, unknown>>(
    "ProductItems",
    `$filter=ProductItemId eq '${code}'&$select=ProductItemId&$top=1`
  );
  if (existing.value.length > 0) {
    return `Product '${code}' already exists. Pick a different code (or use autoCode=true to take the next free NC number), then retry.`;
  }

  // 3. Build the body. Price via Decimal* (POST honours it — see PRICE STORAGE NOTE).
  const margin =
    args.sellPrice > 0 ? (((args.sellPrice - args.costPrice) / args.sellPrice) * 100).toFixed(1) : "N/A";

  const body: Record<string, unknown> = {
    ProductItemId: code,
    Description: args.description,
    DecimalSellingPrice: args.sellPrice,
    DecimalCostPrice: args.costPrice,
    UnitDescription: args.unitDescription ?? "Each",
    Obsolete: args.obsolete ? 1 : 0,
  };
  if (args.manufacturer !== undefined) body.Manufacturer = args.manufacturer;
  if (args.manufacturerReference !== undefined) body.ManufacturerReference = args.manufacturerReference;
  if (args.categoryId !== undefined) body.CategoryId = args.categoryId;
  if (args.salesAnalysis !== undefined) body.SalesAnalysis = args.salesAnalysis;
  if (args.extendedDescription !== undefined) body.ExtendedDescription = args.extendedDescription;
  if (args.specification !== undefined) body.Specification = args.specification;
  if (args.internalNotes !== undefined) body.InternalNotes = args.internalNotes;
  if (args.alternateReference1 !== undefined) body.AlternateReference1 = args.alternateReference1;
  if (args.alternateReference2 !== undefined) body.AlternateReference2 = args.alternateReference2;
  if (args.barcode !== undefined) body.Barcode = args.barcode;
  if (args.taxCode !== undefined) body.TaxCode = args.taxCode;

  const created = await client.post<Record<string, unknown>>("ProductItems", body);

  // Read back so we report the persisted price, not just what we sent.
  const check = await client.get<Record<string, unknown>>(
    "ProductItems",
    `$filter=ProductItemId eq '${code}'&$select=ProductItemId,Description,DecimalSellingPrice,DecimalCostPrice,Manufacturer,ManufacturerReference,CategoryId`
  );
  const p = check.value[0] ?? created;
  const sell = typeof p.DecimalSellingPrice === "number" ? `£${p.DecimalSellingPrice.toFixed(2)}` : "N/A";
  const cost = typeof p.DecimalCostPrice === "number" ? `£${p.DecimalCostPrice.toFixed(2)}` : "N/A";

  const warn =
    sell === "£0.00" || cost === "£0.00"
      ? "\n\n⚠️ Sell or cost persisted as £0.00 — the server likely ignored the Decimal* fields on POST. Switch the wrapper to the raw integer backing fields (SellingPrice × 10^SellDecimals + SellDecimals, CostPrice × 10^CostDecimals + CostDecimals) per the PRICE STORAGE NOTE, then retry."
      : "";

  return [
    `Product created successfully!`,
    `**Code:** ${p.ProductItemId}`,
    `**Description:** ${p.Description}`,
    `**Sell:** ${sell} | **Cost:** ${cost} | **Margin:** ${margin}%`,
    `**Supplier:** ${p.Manufacturer ?? "N/A"} | **Mfr Ref:** ${p.ManufacturerReference ?? "N/A"}`,
    `**Category:** ${p.CategoryId ?? "N/A"}`,
    `**CRM Link:** ${toCrmLink(created.RecordLink as string | null | undefined)}`,
    warn,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function updateProduct(args: z.infer<typeof updateProductSchema>): Promise<string> {
  const client = getClient();
  const { productItemId, ...fields } = args;

  const body: Record<string, unknown> = {};
  if (fields.description !== undefined) body.Description = fields.description;
  if (fields.sellPrice !== undefined) body.DecimalSellingPrice = fields.sellPrice;
  if (fields.costPrice !== undefined) body.DecimalCostPrice = fields.costPrice;
  if (fields.manufacturer !== undefined) body.Manufacturer = fields.manufacturer;
  if (fields.manufacturerReference !== undefined) body.ManufacturerReference = fields.manufacturerReference;
  if (fields.categoryId !== undefined) body.CategoryId = fields.categoryId;
  if (fields.unitDescription !== undefined) body.UnitDescription = fields.unitDescription;
  if (fields.salesAnalysis !== undefined) body.SalesAnalysis = fields.salesAnalysis;
  if (fields.extendedDescription !== undefined) body.ExtendedDescription = fields.extendedDescription;
  if (fields.specification !== undefined) body.Specification = fields.specification;
  if (fields.internalNotes !== undefined) body.InternalNotes = fields.internalNotes;
  if (fields.obsolete !== undefined) body.Obsolete = fields.obsolete ? 1 : 0;

  if (Object.keys(body).length === 0) return "No fields provided to update.";

  // ProductItems uses a string key — client.patch must target ProductItems('<code>').
  await client.patch<Record<string, unknown>>("ProductItems", `'${productItemId}'`, body);
  return `Product '${productItemId}' updated. Fields changed: ${Object.keys(body).join(", ")}`;
}
