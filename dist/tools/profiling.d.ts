/**
 * MCP tool handlers for profiling data — RFM analysis, Xtra/custom fields,
 * and contact profiling/recall data.
 */
import { z } from "zod";
export declare const getDivisionRfmSchema: z.ZodObject<{
    divisionId: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    divisionId: number;
}, {
    divisionId: number;
}>;
export declare const getXtraFieldsSchema: z.ZodObject<{
    entityType: z.ZodEnum<["QuoteXtras", "ContactXtras", "DivisionXtras", "LeadXtras", "CampaignXtras", "BookingXtras", "ContractXtras", "QuoteLineXtras", "ProductItemXtras"]>;
    parentId: z.ZodUnion<[z.ZodNumber, z.ZodString]>;
}, "strip", z.ZodTypeAny, {
    entityType: "QuoteLineXtras" | "QuoteXtras" | "ContactXtras" | "DivisionXtras" | "LeadXtras" | "CampaignXtras" | "BookingXtras" | "ContractXtras" | "ProductItemXtras";
    parentId: string | number;
}, {
    entityType: "QuoteLineXtras" | "QuoteXtras" | "ContactXtras" | "DivisionXtras" | "LeadXtras" | "CampaignXtras" | "BookingXtras" | "ContractXtras" | "ProductItemXtras";
    parentId: string | number;
}>;
export declare const getContactProfilingSchema: z.ZodObject<{
    contactId: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    contactId: number;
}, {
    contactId: number;
}>;
export declare function getDivisionRfm(args: z.infer<typeof getDivisionRfmSchema>): Promise<string>;
export declare function getXtraFields(args: z.infer<typeof getXtraFieldsSchema>): Promise<string>;
export declare function getContactProfiling(args: z.infer<typeof getContactProfilingSchema>): Promise<string>;
//# sourceMappingURL=profiling.d.ts.map