/**
 * MCP tool handlers for QuoteLine operations.
 */
import { z } from "zod";
export declare const addQuoteLineSchema: z.ZodObject<{
    quoteId: z.ZodNumber;
    productItemId: z.ZodOptional<z.ZodString>;
    description: z.ZodString;
    quantity: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    price: z.ZodOptional<z.ZodNumber>;
    costPrice: z.ZodOptional<z.ZodNumber>;
    discountPercentage: z.ZodOptional<z.ZodNumber>;
    taxCode: z.ZodOptional<z.ZodString>;
    extendedDescription: z.ZodOptional<z.ZodString>;
    sequence: z.ZodOptional<z.ZodNumber>;
    groupId: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    description: string;
    quoteId: number;
    quantity: number;
    sequence?: number | undefined;
    productItemId?: string | undefined;
    price?: number | undefined;
    costPrice?: number | undefined;
    discountPercentage?: number | undefined;
    taxCode?: string | undefined;
    extendedDescription?: string | undefined;
    groupId?: number | undefined;
}, {
    description: string;
    quoteId: number;
    sequence?: number | undefined;
    productItemId?: string | undefined;
    quantity?: number | undefined;
    price?: number | undefined;
    costPrice?: number | undefined;
    discountPercentage?: number | undefined;
    taxCode?: string | undefined;
    extendedDescription?: string | undefined;
    groupId?: number | undefined;
}>;
export declare const updateQuoteLineSchema: z.ZodObject<{
    lineId: z.ZodNumber;
    description: z.ZodOptional<z.ZodString>;
    quantity: z.ZodOptional<z.ZodNumber>;
    price: z.ZodOptional<z.ZodNumber>;
    costPrice: z.ZodOptional<z.ZodNumber>;
    discountPercentage: z.ZodOptional<z.ZodNumber>;
    taxCode: z.ZodOptional<z.ZodString>;
    extendedDescription: z.ZodOptional<z.ZodString>;
    sequence: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    lineId: number;
    description?: string | undefined;
    sequence?: number | undefined;
    quantity?: number | undefined;
    price?: number | undefined;
    costPrice?: number | undefined;
    discountPercentage?: number | undefined;
    taxCode?: string | undefined;
    extendedDescription?: string | undefined;
}, {
    lineId: number;
    description?: string | undefined;
    sequence?: number | undefined;
    quantity?: number | undefined;
    price?: number | undefined;
    costPrice?: number | undefined;
    discountPercentage?: number | undefined;
    taxCode?: string | undefined;
    extendedDescription?: string | undefined;
}>;
export declare const deleteQuoteLineSchema: z.ZodObject<{
    lineId: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    lineId: number;
}, {
    lineId: number;
}>;
export declare const updateQuoteLineXtraSchema: z.ZodObject<{
    lineId: z.ZodNumber;
    fields: z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean, z.ZodNull]>>;
}, "strip", z.ZodTypeAny, {
    fields: Record<string, string | number | boolean | null>;
    lineId: number;
}, {
    fields: Record<string, string | number | boolean | null>;
    lineId: number;
}>;
export declare function addQuoteLine(args: z.infer<typeof addQuoteLineSchema>): Promise<string>;
export declare function updateQuoteLine(args: z.infer<typeof updateQuoteLineSchema>): Promise<string>;
export declare function deleteQuoteLine(args: z.infer<typeof deleteQuoteLineSchema>): Promise<string>;
export declare function updateQuoteLineXtra(input: z.input<typeof updateQuoteLineXtraSchema>): Promise<string>;
//# sourceMappingURL=quote-lines.d.ts.map