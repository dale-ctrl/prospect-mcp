/**
 * MCP tool handlers for Pricing — price bands, price lists, and product pricing lookups.
 */
import { z } from "zod";
export declare const getPriceBandsSchema: z.ZodObject<{
    includeObsolete: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    includeObsolete: boolean;
}, {
    includeObsolete?: boolean | undefined;
}>;
export declare const getPriceBandProductPricesSchema: z.ZodObject<{
    priceBandId: z.ZodNumber;
    productItemId: z.ZodOptional<z.ZodString>;
    top: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    top: number;
    priceBandId: number;
    productItemId?: string | undefined;
}, {
    priceBandId: number;
    top?: number | undefined;
    productItemId?: string | undefined;
}>;
export declare const searchPriceListSchema: z.ZodObject<{
    productItemId: z.ZodOptional<z.ZodString>;
    code: z.ZodOptional<z.ZodString>;
    top: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    top: number;
    code?: string | undefined;
    productItemId?: string | undefined;
}, {
    top?: number | undefined;
    code?: string | undefined;
    productItemId?: string | undefined;
}>;
export declare const getProductPricingSchema: z.ZodObject<{
    productItemId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    productItemId: string;
}, {
    productItemId: string;
}>;
export declare function getPriceBands(args: z.infer<typeof getPriceBandsSchema>): Promise<string>;
export declare function getPriceBandProductPrices(args: z.infer<typeof getPriceBandProductPricesSchema>): Promise<string>;
export declare function searchPriceList(args: z.infer<typeof searchPriceListSchema>): Promise<string>;
export declare function getProductPricing(args: z.infer<typeof getProductPricingSchema>): Promise<string>;
//# sourceMappingURL=pricing.d.ts.map