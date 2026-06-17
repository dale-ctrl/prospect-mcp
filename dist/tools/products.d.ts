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
export declare const createProductSchema: z.ZodObject<{
    productItemId: z.ZodOptional<z.ZodString>;
    autoCode: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    description: z.ZodString;
    sellPrice: z.ZodNumber;
    costPrice: z.ZodNumber;
    manufacturer: z.ZodOptional<z.ZodString>;
    manufacturerReference: z.ZodOptional<z.ZodString>;
    categoryId: z.ZodOptional<z.ZodString>;
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
    autoCode: boolean;
    sellPrice: number;
    unitDescription: string;
    obsolete: boolean;
    productItemId?: string | undefined;
    taxCode?: string | undefined;
    extendedDescription?: string | undefined;
    categoryId?: string | undefined;
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
    sellPrice: z.ZodOptional<z.ZodNumber>;
    costPrice: z.ZodOptional<z.ZodNumber>;
    manufacturer: z.ZodOptional<z.ZodString>;
    manufacturerReference: z.ZodOptional<z.ZodString>;
    categoryId: z.ZodOptional<z.ZodString>;
    unitDescription: z.ZodOptional<z.ZodString>;
    salesAnalysis: z.ZodOptional<z.ZodString>;
    extendedDescription: z.ZodOptional<z.ZodString>;
    specification: z.ZodOptional<z.ZodString>;
    internalNotes: z.ZodOptional<z.ZodString>;
    obsolete: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    productItemId: string;
    description?: string | undefined;
    costPrice?: number | undefined;
    extendedDescription?: string | undefined;
    categoryId?: string | undefined;
    manufacturerReference?: string | undefined;
    sellPrice?: number | undefined;
    manufacturer?: string | undefined;
    unitDescription?: string | undefined;
    salesAnalysis?: string | undefined;
    specification?: string | undefined;
    internalNotes?: string | undefined;
    obsolete?: boolean | undefined;
}, {
    productItemId: string;
    description?: string | undefined;
    costPrice?: number | undefined;
    extendedDescription?: string | undefined;
    categoryId?: string | undefined;
    manufacturerReference?: string | undefined;
    sellPrice?: number | undefined;
    manufacturer?: string | undefined;
    unitDescription?: string | undefined;
    salesAnalysis?: string | undefined;
    specification?: string | undefined;
    internalNotes?: string | undefined;
    obsolete?: boolean | undefined;
}>;
export declare function createProduct(args: z.infer<typeof createProductSchema>): Promise<string>;
export declare function updateProduct(args: z.infer<typeof updateProductSchema>): Promise<string>;
//# sourceMappingURL=products.d.ts.map