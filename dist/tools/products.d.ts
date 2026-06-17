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
export declare const createProductSchema: z.ZodObject<{
    productItemId: z.ZodOptional<z.ZodString>;
    autoCode: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    description: z.ZodString;
    sellPrice: z.ZodNumber;
    costPrice: z.ZodNumber;
    manufacturer: z.ZodOptional<z.ZodString>;
    manufacturerReference: z.ZodOptional<z.ZodString>;
    categoryId: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    unitDescription: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    salesAnalysis: z.ZodOptional<z.ZodString>;
    extendedDescription: z.ZodOptional<z.ZodString>;
    specification: z.ZodOptional<z.ZodString>;
    internalNotes: z.ZodOptional<z.ZodString>;
    alternateReference1: z.ZodOptional<z.ZodString>;
    alternateReference2: z.ZodOptional<z.ZodString>;
    barcode: z.ZodOptional<z.ZodString>;
    taxCode: z.ZodOptional<z.ZodString>;
    obsolete: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    description: string;
    costPrice: number;
    categoryId: string;
    autoCode: boolean;
    sellPrice: number;
    unitDescription: string;
    obsolete: boolean;
    productItemId?: string | undefined;
    taxCode?: string | undefined;
    extendedDescription?: string | undefined;
    manufacturerReference?: string | undefined;
    manufacturer?: string | undefined;
    salesAnalysis?: string | undefined;
    specification?: string | undefined;
    internalNotes?: string | undefined;
    alternateReference1?: string | undefined;
    alternateReference2?: string | undefined;
    barcode?: string | undefined;
}, {
    description: string;
    costPrice: number;
    sellPrice: number;
    productItemId?: string | undefined;
    taxCode?: string | undefined;
    extendedDescription?: string | undefined;
    categoryId?: string | undefined;
    manufacturerReference?: string | undefined;
    autoCode?: boolean | undefined;
    manufacturer?: string | undefined;
    unitDescription?: string | undefined;
    salesAnalysis?: string | undefined;
    specification?: string | undefined;
    internalNotes?: string | undefined;
    alternateReference1?: string | undefined;
    alternateReference2?: string | undefined;
    barcode?: string | undefined;
    obsolete?: boolean | undefined;
}>;
export declare const updateProductSchema: z.ZodObject<{
    productItemId: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    manufacturer: z.ZodOptional<z.ZodString>;
    manufacturerReference: z.ZodOptional<z.ZodString>;
    unitDescription: z.ZodOptional<z.ZodString>;
    extendedDescription: z.ZodOptional<z.ZodString>;
    specification: z.ZodOptional<z.ZodString>;
    internalNotes: z.ZodOptional<z.ZodString>;
    obsolete: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    productItemId: string;
    description?: string | undefined;
    extendedDescription?: string | undefined;
    manufacturerReference?: string | undefined;
    manufacturer?: string | undefined;
    unitDescription?: string | undefined;
    specification?: string | undefined;
    internalNotes?: string | undefined;
    obsolete?: boolean | undefined;
}, {
    productItemId: string;
    description?: string | undefined;
    extendedDescription?: string | undefined;
    manufacturerReference?: string | undefined;
    manufacturer?: string | undefined;
    unitDescription?: string | undefined;
    specification?: string | undefined;
    internalNotes?: string | undefined;
    obsolete?: boolean | undefined;
}>;
export declare function createProduct(args: z.infer<typeof createProductSchema>): Promise<string>;
export declare function updateProduct(args: z.infer<typeof updateProductSchema>): Promise<string>;
//# sourceMappingURL=products.d.ts.map