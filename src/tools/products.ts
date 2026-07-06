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
import { loadXtraSlots, resolveXtraFieldsToBody } from "../lib/xtra-labels.js";

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
  categoryId: z
    .string()
    .optional()
    .default("STOCK")
    .describe(
      "ProductCategory code (the server requires one — defaults to 'STOCK' which matches every existing WCG NC item). Use get_product_categories to list alternatives.",
    ),
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
  vatCode: z
    .string()
    .optional()
    .describe(
      "VAT code (writes ProductItem.VatCode). WCG standard: '1' = standard 20% VAT. ALWAYS pass this for NC items — the tenant's 'Default Tax Code' system option is N/A, so if you omit it the product is created with VatCode=null and quote lines add without VAT. Every existing catalogue Y-code has VatCode='1'.",
    ),
  purchaseAnalysis: z
    .string()
    .optional()
    .describe(
      "Access Dimensions purchase nominal (writes ProductItem.PurchaseAnalysis). WCG standard for furniture: '10-1-2006-000'. Match a comparable SKU via get_product_detail if unsure. ALWAYS pass this for NC items — without it, Access Dimensions rejects order conversion with 'Invalid product category'. Create-only: cannot be set via update_product afterwards (UpdateVisibility=never), only the Prospect UI.",
    ),
  taxCode: z
    .string()
    .optional()
    .describe(
      "DEPRECATED — legacy alias for vatCode (there is no TaxCode property on ProductItem; earlier versions of this tool wrote a non-existent field and silently failed). Kept for back-compat; pass vatCode instead. If both are supplied, vatCode wins.",
    ),
  type: z
    .string()
    .optional()
    .default("STOCK")
    .describe(
      "Product type / prodtype — writes ProductItem.Type. Access Dimensions validates this at order conversion time and rejects the line with 'Invalid product category' when it's null (root cause of the NC06072602 / 2026-07-06 order-conversion failure, even after v1.30.0 fixed VatCode + PurchaseAnalysis). Every UI-created stock item has Type='STOCK'; MCP-created items pre-v1.31.0 came back with Type=null because the field wasn't in the POST body. Create-only (UpdateVisibility='never'), like VatCode / PurchaseAnalysis — cannot be repaired by update_product; recreate the product if you need to change it. Default 'STOCK' matches every WCG Y-code catalogue item.",
    ),
  obsolete: z.boolean().optional().default(false).describe("Mark obsolete on creation (default false)."),
  allowDuplicate: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Suppress the manufacturer-reference duplicate guard. Default false: when manufacturerReference matches an existing product, the tool returns the existing code instead of creating a second SKU. Set true only for a genuine variant (same supplier code, different size/finish) where a duplicate is intentional.",
    ),
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

  // 2a. Manufacturer-reference duplicate guard.
  //     Many "bespoke" items are already in the catalogue under a different
  //     NC code from a previous job — re-creating them spawns duplicate SKUs
  //     that fragment sales history. Search by ManufacturerReference (and
  //     Manufacturer when supplied) BEFORE the existence-by-code check, and
  //     short-circuit with the existing code unless allowDuplicate=true. The
  //     skill (prospect-crm-create-product §1) is supposed to do this search
  //     first; this is the server-side backstop.
  if (args.manufacturerReference && !args.allowDuplicate) {
    const odataEscape = (s: string): string => s.replace(/'/g, "''");
    const refFilter = `ManufacturerReference eq '${odataEscape(args.manufacturerReference)}'`;
    const mfrFilter = args.manufacturer
      ? ` and Manufacturer eq '${odataEscape(args.manufacturer)}'`
      : "";
    const dupes = await client.get<Record<string, unknown>>(
      "ProductItems",
      `$filter=${refFilter}${mfrFilter}&$select=ProductItemId,Description,DecimalSellingPrice,DecimalCostPrice,Manufacturer,ManufacturerReference,Obsolete&$top=3`,
    );
    if (dupes.value.length > 0) {
      const lines = dupes.value.map((p) => {
        const sell =
          typeof p.DecimalSellingPrice === "number" ? `£${p.DecimalSellingPrice.toFixed(2)}` : "N/A";
        const cost =
          typeof p.DecimalCostPrice === "number" ? `£${p.DecimalCostPrice.toFixed(2)}` : "N/A";
        const obsoleteTag = p.Obsolete === 1 || p.Obsolete === true ? " [OBSOLETE]" : "";
        return `- **${p.ProductItemId}**${obsoleteTag} — ${p.Description}\n  Sell ${sell} / Cost ${cost} | Mfr: ${p.Manufacturer ?? "N/A"} | Ref: ${p.ManufacturerReference ?? "N/A"}`;
      });
      return [
        `**duplicate: true** — a product with ManufacturerReference '${args.manufacturerReference}'${args.manufacturer ? ` (Manufacturer '${args.manufacturer}')` : ""} already exists.`,
        "",
        "Existing match(es):",
        ...lines,
        "",
        "Use the existing code on the quote instead of creating a new one. If this is a genuine variant (same supplier code, different size/finish) and you really need a second SKU, re-run with `allowDuplicate: true`.",
      ].join("\n");
    }
  }

  // 2b. Guard against overwriting an existing SKU (ProductItems POST would otherwise clash)
  const existing = await client.get<Record<string, unknown>>(
    "ProductItems",
    `$filter=ProductItemId eq '${code}'&$select=ProductItemId&$top=1`
  );
  if (existing.value.length > 0) {
    return `Product '${code}' already exists. Pick a different code (or use autoCode=true to take the next free NC number), then retry.`;
  }

  // 3. Build the body. Prices use raw integer fields, NOT Decimal* — see quirk
  //    note (2) at the top of this file. £10.00 → SellingPrice=1000, SellDecimals=2.
  const margin =
    args.sellPrice > 0 ? (((args.sellPrice - args.costPrice) / args.sellPrice) * 100).toFixed(1) : "N/A";

  const PRICE_DECIMALS = 2; // GBP — 2 dp (pence). Matches every existing WCG product.
  const toRawPrice = (pounds: number): number => Math.round(pounds * Math.pow(10, PRICE_DECIMALS));

  const body: Record<string, unknown> = {
    OperatingCompanyCode: OPERATING_COMPANY_CODE,
    ProductItemId: code,
    Description: args.description,
    CategoryId: args.categoryId, // schema defaults to "STOCK"; server requires it
    // Type / prodtype (Edm.String, UpdateVisibility='never'). Root cause of the
    // NC06072602 order-conversion failure — Access Dimensions rejects with
    // "Invalid product category" when Type is null, EVEN with a good CategoryId,
    // VatCode, and PurchaseAnalysis. UI-created stock items always have
    // Type='STOCK'. Diff of Y100201 vs NC06072602 (2026-07-06) had this as the
    // one remaining suspect after v1.30.0 landed. Schema defaults `type` to
    // 'STOCK'; expose via arg so someone can pick a different value if the
    // tenant ever configures other product types.
    Type: args.type,
    // The block below matches the UI's own product-form defaults, cross-checked
    // against Y100201 (which has been through the full UI flow + Dimensions
    // sync). All UpdateVisibility='never', so we set them here or never. Values
    // are hardcoded rather than schema args because they're WCG conventions
    // that nobody would want to change per-product.
    Pack: "1",
    AllowSplit: 1,
    AllowLineDiscount: 1,
    AllowOverallDiscount: 1,
    AllowSettlementDiscount: 1,
    QuantityDecimal: 3,
    QuantityFactor: 1,
    UnitWeightDecimals: 4,
    SellingPrice: toRawPrice(args.sellPrice),
    SellDecimals: PRICE_DECIMALS,
    CostPrice: toRawPrice(args.costPrice),
    CostDecimals: PRICE_DECIMALS,
    UnitDescription: args.unitDescription ?? "Each",
    Obsolete: args.obsolete ? 1 : 0,
  };
  if (args.manufacturer !== undefined) body.Manufacturer = args.manufacturer;
  if (args.manufacturerReference !== undefined) body.ManufacturerReference = args.manufacturerReference;
  if (args.salesAnalysis !== undefined) body.SalesAnalysis = args.salesAnalysis;
  if (args.extendedDescription !== undefined) body.ExtendedDescription = args.extendedDescription;
  if (args.specification !== undefined) body.Specification = args.specification;
  if (args.internalNotes !== undefined) body.InternalNotes = args.internalNotes;
  if (args.alternateReference1 !== undefined) body.AlternateReference1 = args.alternateReference1;
  if (args.alternateReference2 !== undefined) body.AlternateReference2 = args.alternateReference2;
  if (args.barcode !== undefined) body.Barcode = args.barcode;
  // VatCode / PurchaseAnalysis: create-only POST fields (UpdateVisibility="never").
  // Missing either causes downstream Access Dimensions to reject the order at
  // conversion time with "Invalid product category" — see v1.29.0 skill notes.
  // Pre-v1.30.0 wrote body.TaxCode which does NOT exist on ProductItem; the
  // POST 400'd but the outer flow silently discarded the error, so products
  // were created with VatCode=null. `taxCode` kept as a deprecated alias so
  // existing callers keep working; vatCode wins when both are supplied.
  const resolvedVatCode = args.vatCode ?? args.taxCode;
  if (resolvedVatCode !== undefined) body.VatCode = resolvedVatCode;
  if (args.purchaseAnalysis !== undefined) body.PurchaseAnalysis = args.purchaseAnalysis;

  const created = await client.post<Record<string, unknown>>("ProductItems", body);

  // Read back so we report the persisted price, VAT code, and purchase
  // nominal — not just what we sent. Missing VatCode or PurchaseAnalysis is
  // silently order-blocking (see comment above the POST body), so surface
  // them in the response so the caller sees the round-tripped values.
  const check = await client.get<Record<string, unknown>>(
    "ProductItems",
    `$filter=ProductItemId eq '${code}'&$select=ProductItemId,Description,DecimalSellingPrice,DecimalCostPrice,Manufacturer,ManufacturerReference,CategoryId,VatCode,PurchaseAnalysis,SalesAnalysis,Type`
  );
  const p = check.value[0] ?? created;
  const sell = typeof p.DecimalSellingPrice === "number" ? `£${p.DecimalSellingPrice.toFixed(2)}` : "N/A";
  const cost = typeof p.DecimalCostPrice === "number" ? `£${p.DecimalCostPrice.toFixed(2)}` : "N/A";

  const priceWarn =
    sell === "£0.00" || cost === "£0.00"
      ? "\n\n⚠️ Sell or cost persisted as £0.00. SellingPrice / SellDecimals (raw integer fields) were sent but the server did not honour them — check the live row and the PRICE quirk note at the top of products.ts."
      : "";
  const nominalWarn =
    p.VatCode == null || p.PurchaseAnalysis == null
      ? `\n\n⚠️ ${p.VatCode == null ? "VatCode" : ""}${p.VatCode == null && p.PurchaseAnalysis == null ? " and " : ""}${p.PurchaseAnalysis == null ? "PurchaseAnalysis" : ""} came back null. Quote lines added with this SKU will ${p.VatCode == null ? "price at Gross=Net (no VAT applied)" : ""}${p.VatCode == null && p.PurchaseAnalysis == null ? ", and " : ""}${p.PurchaseAnalysis == null ? "Access Dimensions will reject order conversion with 'Invalid product category'" : ""}. Both fields are create-only on this entity — you'll need to set them in the Prospect UI (update_product cannot). Re-run with vatCode / purchaseAnalysis populated to fix at source.`
      : "";
  const typeWarn =
    p.Type == null
      ? `\n\n⚠️ Type came back null. Access Dimensions will reject order conversion with 'Invalid product category' regardless of VatCode / PurchaseAnalysis (that was the NC06072602 breakage — root cause diagnosed 2026-07-06). Create-only field — cannot be repaired via update_product; recreate the product with type='STOCK' set to fix.`
      : "";

  return [
    `Product created successfully!`,
    `**Code:** ${p.ProductItemId}`,
    `**Description:** ${p.Description}`,
    `**Sell:** ${sell} | **Cost:** ${cost} | **Margin:** ${margin}%`,
    `**VAT code:** ${p.VatCode ?? "(null — order will not price with VAT)"}`,
    `**Purchase Nominal:** ${p.PurchaseAnalysis ?? "(null — Dimensions will reject order)"}`,
    `**Sales Nominal:** ${p.SalesAnalysis ?? "N/A"}`,
    `**Category:** ${p.CategoryId ?? "N/A"} | **Type:** ${p.Type ?? "(null — Dimensions will reject order)"}`,
    `**Supplier:** ${p.Manufacturer ?? "N/A"} | **Mfr Ref:** ${p.ManufacturerReference ?? "N/A"}`,
    `**CRM Link:** ${toCrmLink(created.RecordLink as string | null | undefined)}`,
    priceWarn,
    nominalWarn,
    typeWarn,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function updateProduct(args: z.infer<typeof updateProductSchema>): Promise<string> {
  const client = getClient();
  const { productItemId, ...fields } = args;

  const body: Record<string, unknown> = {};
  if (fields.description !== undefined) body.Description = fields.description;
  if (fields.manufacturer !== undefined) body.Manufacturer = fields.manufacturer;
  if (fields.manufacturerReference !== undefined) body.ManufacturerReference = fields.manufacturerReference;
  if (fields.unitDescription !== undefined) body.UnitDescription = fields.unitDescription;
  if (fields.extendedDescription !== undefined) body.ExtendedDescription = fields.extendedDescription;
  if (fields.specification !== undefined) body.Specification = fields.specification;
  if (fields.internalNotes !== undefined) body.InternalNotes = fields.internalNotes;
  if (fields.obsolete !== undefined) body.Obsolete = fields.obsolete ? 1 : 0;

  if (Object.keys(body).length === 0) return "No fields provided to update.";

  // ProductItem has a COMPOSITE primary key (OperatingCompanyCode + ProductItemId).
  // The single-string-key URL form /ProductItems('NC...') returns HTTP 500 — quirk
  // note (1) in this file. Build the full key expression.
  const keyExpr = `OperatingCompanyCode='${OPERATING_COMPANY_CODE}',ProductItemId='${productItemId}'`;
  await client.patch<Record<string, unknown>>("ProductItems", keyExpr, body);
  return `Product '${productItemId}' updated. Fields changed: ${Object.keys(body).join(", ")}`;
}

// ─── upload_product_image ─────────────────────────────────────
//
// Attach an image to a product's Manage Images panel. Endpoint confirmed via
// DevTools capture against the live tenant 2026-06-22 — it's a bound OData
// action that takes the raw image bytes as the request body (NOT multipart,
// NOT a JSON wrapper, NOT a separate ProductItemImages collection):
//
//     POST /ProductItems('A','<code>')/UploadImage
//     Content-Type: image/<format>     (image/png, image/jpeg, image/gif, image/webp)
//     Content-Length: <byte count>
//     <raw image bytes>
//
// Composite key uses the POSITIONAL form ('A','<code>') here, matching what
// the web UI sends — that's distinct from the NAMED form
// (OperatingCompanyCode='A',ProductItemId='<code>') used for PATCH in
// update_product. Both work for Prospect; we follow the UI's lead for this
// endpoint.
//
// makePrimary is intentionally NOT in the schema for v1.24.0: the first image
// uploaded to a product becomes primary on Prospect by default, which covers
// the common (new NC item) case. Changing primary on a multi-image product
// needs a separate endpoint not yet captured — punt to a follow-up release.
const PRODUCT_IMAGE_MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED_IMAGE_MIMES = /^image\/(jpe?g|png|gif|webp)$/i;

function extFromMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.startsWith("image/jpeg") || m.startsWith("image/jpg")) return "jpg";
  if (m.startsWith("image/png")) return "png";
  if (m.startsWith("image/gif")) return "gif";
  if (m.startsWith("image/webp")) return "webp";
  return "bin";
}

// Exactly-one-of imageUrl / imageBase64 is enforced in the handler (not via
// .refine()) so the schema stays a plain ZodObject and the MCP wrapper's
// `.shape` access keeps working.
export const uploadProductImageSchema = z.object({
  productItemId: z
    .string()
    .describe("Product code / SKU (ProductItemId) to attach the image to, e.g. 'NC17062601'."),
  imageUrl: z
    .string()
    .url()
    .optional()
    .describe(
      "URL of the image to attach — the server fetches the bytes itself. Provide this OR imageBase64 (exactly one).",
    ),
  imageBase64: z
    .string()
    .optional()
    .describe(
      "Base64-encoded image bytes (no `data:` prefix). Provide this OR imageUrl (exactly one).",
    ),
  filename: z
    .string()
    .optional()
    .describe(
      "Optional filename (informational only — Prospect names the stored asset itself). Defaults to '<productItemId>.<ext>'.",
    ),
  contentType: z
    .string()
    .optional()
    .describe(
      "MIME type, e.g. 'image/jpeg' or 'image/png'. Inferred from the fetched response / filename if omitted; falls back to 'image/jpeg'. Must be one of: image/jpeg, image/png, image/gif, image/webp.",
    ),
});

export async function uploadProductImage(
  args: z.infer<typeof uploadProductImageSchema>,
): Promise<string> {
  const client = getClient();

  // Refine-style guard: exactly one of imageUrl / imageBase64.
  const hasUrl = !!args.imageUrl;
  const hasB64 = !!args.imageBase64;
  if (hasUrl === hasB64) {
    return "Provide exactly one of imageUrl or imageBase64.";
  }

  // 1. Resolve bytes + content type.
  let bytes: Buffer;
  let contentType: string;
  if (args.imageUrl) {
    const res = await fetch(args.imageUrl);
    if (!res.ok) {
      return `Failed to fetch imageUrl: HTTP ${res.status} ${res.statusText} from ${args.imageUrl}`;
    }
    contentType =
      args.contentType || res.headers.get("content-type") || "image/jpeg";
    bytes = Buffer.from(await res.arrayBuffer());
  } else {
    // imageBase64 branch — refine guarantees exactly one of the two is set.
    bytes = Buffer.from(args.imageBase64!, "base64");
    contentType = args.contentType || "image/jpeg";
  }
  // Strip any "; charset=..." suffix from the content type before validating.
  contentType = contentType.split(";")[0].trim().toLowerCase();

  // 2. Guardrails — type + size.
  if (!ALLOWED_IMAGE_MIMES.test(contentType)) {
    return `Unsupported image type '${contentType}'. Allowed: image/jpeg, image/png, image/gif, image/webp.`;
  }
  if (bytes.length === 0) {
    return "Image resolved to zero bytes — check the URL or base64 payload.";
  }
  if (bytes.length > PRODUCT_IMAGE_MAX_BYTES) {
    return `Image is ${(bytes.length / 1024 / 1024).toFixed(2)} MB which exceeds the 8 MB cap — resize before upload.`;
  }

  // 3. POST raw bytes to the bound action.
  //    URL escape the product code in case it contains apostrophes (OData
  //    escape doubles single quotes); the OperatingCompanyCode is the fixed
  //    1-char WCG code 'A'.
  const code = args.productItemId.replace(/'/g, "''");
  const path = `ProductItems('${OPERATING_COMPANY_CODE}','${code}')/UploadImage`;

  let response: unknown;
  try {
    response = await client.postBinary<unknown>(path, bytes, contentType);
  } catch (err) {
    return `Image upload failed for '${args.productItemId}': ${(err as Error).message}`;
  }

  // The captured DevTools call shows no response body shape (caller fired and
  // forgot in the browser). The server may return {value: <imageId>}, the
  // updated ProductItem, or nothing — surface whatever came back so the
  // first-live caller can refine this output if useful.
  const responseNote =
    response == null
      ? "(server returned no body — image attached)"
      : `(server response: ${JSON.stringify(response).slice(0, 200)})`;

  const sizeKb = (bytes.length / 1024).toFixed(1);
  const filename = args.filename || `${args.productItemId}.${extFromMime(contentType)}`;

  return [
    `Image uploaded to '${args.productItemId}'.`,
    `**File:** ${filename} (${contentType}, ${sizeKb} KB)`,
    `**Endpoint:** POST /${path}`,
    responseNote,
    "",
    "Verify in **Manage Images** on the product. The first image uploaded to a product is normally auto-primary in Prospect; if you need to change primary on a multi-image product, use the web UI for now (separate endpoint not yet wired).",
  ].join("\n");
}

// ─── update_product_xtra ──────────────────────────────────────
//
// Generic writer for ProductItemXtra custom fields (Dimensions, Supplier,
// Supplier Code, Colour, etc. — whatever the tenant has configured under
// "Custom Fields" on a ProductItem). Counterpart to update_division_xtra
// (division-xtra.ts) and the update_quote_line_xtra branch inside
// quote-lines.ts. Reuses the shared label resolver in lib/xtra-labels.ts
// so callers can key by friendly label, slot identifier, or raw column.
//
// ProductItemXtra shares ProductItem's COMPOSITE primary key
// (OperatingCompanyCode + ProductItemId). PATCH/GET-by-id therefore needs
// the full key URL form ProductItemXtras(OperatingCompanyCode='A',
// ProductItemId='NC...') — confirmed in $metadata, line 10302-10377.
// The single-string-key form returns HTTP 500 on this tenant, same quirk
// resolved for ProductItems in v1.22.0.
//
// All slot columns (StandardTextField1-10, StandardMemoField1-5,
// StandardDropdownField1-5, StandardDateField1-5, StandardDecimalField1-5,
// StandardFlagField1-5, StandardSearchTextField1-3) have
// meta:UpdateVisibility="common" — direct PATCH works; no computed-field
// quirks like the price-storage situation on ProductItem itself.
const PRODUCT_ITEM_XTRAS_ENTITY_SET = "ProductItemXtras";

export const updateProductXtraSchema = z.object({
  productItemId: z
    .string()
    .describe(
      "Product code / SKU (ProductItemId) whose ProductItemXtra row to update (matches the ProductItem this Xtra row hangs off of, e.g. 'NC17062601').",
    ),
  fields: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .describe(
      "Custom-field values keyed by ANY of: (1) friendly label when configured " +
        "(e.g. 'Dimensions'), (2) slot identifier — 'StandardTextField1..10', " +
        "'StandardMemoField1..5', 'StandardDropdownField1..5', 'StandardDateField1..5', " +
        "'StandardDecimalField1..5', 'StandardFlagField1..5', 'StandardSearchTextField1..3' " +
        "— or (3) raw column name 'x_365_custom_<type>_<n>'. Pass null to clear a slot. " +
        "Use get_xtra_fields(entityType='ProductItemXtras', parentId='<productItemId>') to " +
        "see all configured slots and their friendly labels for this tenant.",
    ),
});

/**
 * PATCH the ProductItemXtra row for a ProductItem; if the row doesn't exist
 * (HTTP 404), POST a new one keyed by the composite (OperatingCompanyCode +
 * ProductItemId). Mirrors upsertDivisionXtra (division-xtra.ts) / upsert
 * pattern in quote-lines.ts, with the composite-key URL form for PATCH.
 */
async function upsertProductItemXtra(
  productItemId: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const client = getClient();
  const escapedCode = productItemId.replace(/'/g, "''");
  const keyExpr =
    `OperatingCompanyCode='${OPERATING_COMPANY_CODE}',ProductItemId='${escapedCode}'`;
  try {
    await client.patch<Record<string, unknown>>(
      PRODUCT_ITEM_XTRAS_ENTITY_SET,
      keyExpr,
      body,
    );
  } catch (err) {
    const msg = (err as Error).message || "";
    if (/HTTP 404/.test(msg)) {
      // No Xtra row yet for this product — create one with both halves of
      // the composite key in the body. Both columns have
      // meta:UpdateVisibility="never" but POST honours them at creation
      // time (same POST-vs-PATCH distinction documented for ProductItem
      // itself; see quirk note 3 at the top of this file).
      await client.post<Record<string, unknown>>(PRODUCT_ITEM_XTRAS_ENTITY_SET, {
        OperatingCompanyCode: OPERATING_COMPANY_CODE,
        ProductItemId: productItemId,
        ...body,
      });
    } else {
      throw err;
    }
  }
  // Read back the row so the caller sees the persisted state, not just
  // what we sent. Use ProductItemId-only filter — single OperatingCompanyCode
  // tenant, ProductItemId is unique within it.
  const sp = new URLSearchParams();
  sp.set("$filter", `ProductItemId eq '${escapedCode}'`);
  sp.set("$top", "1");
  const result = await client.get<Record<string, unknown>>(
    PRODUCT_ITEM_XTRAS_ENTITY_SET,
    sp.toString(),
  );
  return (
    result.value[0] ?? {
      OperatingCompanyCode: OPERATING_COMPANY_CODE,
      ProductItemId: productItemId,
      ...body,
    }
  );
}

export async function updateProductXtra(
  input: z.input<typeof updateProductXtraSchema>,
): Promise<string> {
  const args = updateProductXtraSchema.parse(input);
  const client = getClient();

  if (!args.fields || Object.keys(args.fields).length === 0) {
    return `No fields provided to update on ProductItemXtra for '${args.productItemId}'.`;
  }

  // Translate {label | identifier | columnName -> value} into {identifier -> value}.
  // Resolver pulls live slot config + friendly labels from EntityFields +
  // Translations; falls back to the structural slot pattern if either is
  // unreachable so writes via identifier/column always succeed.
  const slots = await loadXtraSlots(client, PRODUCT_ITEM_XTRAS_ENTITY_SET).catch(
    () => [],
  );
  const body = resolveXtraFieldsToBody(slots, args.fields);

  const row = await upsertProductItemXtra(args.productItemId, body);
  return JSON.stringify({
    ok: true,
    productItemId: args.productItemId,
    fieldsUpdated: Object.keys(body),
    row,
  });
}
