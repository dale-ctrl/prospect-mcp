/**
 * Versa Maintenance — DivisionXtra text-field writers and Division-level
 * document merge.
 *
 * The "Versa Maintenance" tab on the Division UI exposes two custom fields
 * backed by DivisionXtra Standard text slots on this tenant (verified live
 * by Dale on Wimbledon Park Primary School / DivisionId 30479):
 *
 *   - Quantity and Equipment Maintained → DivisionXtra.StandardTextField5
 *   - Total Maintenance Value           → DivisionXtra.StandardTextField6
 *
 * The "Create Versa Maintenance Contract" item in the Division three-dot
 * menu kicks off the same MergeData→Document→AttachExistingDocument→
 * SendMessage sequence the quote-level tools already implement, just bound
 * to /Divisions(id) instead of /Quotes(id). Both `MergeData` and
 * `SendMessage` are confirmed Division-bound actions in
 * reference/prospect-metadata.xml (lines 24049, 24057).
 *
 * The merge_division_document tool keeps the template code generic so it
 * can drive any future Division-level template — Versa is just the first.
 */
import { z } from "zod";
export declare const updateDivisionVersaMaintenanceSchema: z.ZodObject<{
    divisionId: z.ZodNumber;
    equipmentMaintained: z.ZodOptional<z.ZodString>;
    totalMaintenanceValue: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodString]>>;
}, "strip", z.ZodTypeAny, {
    divisionId: number;
    equipmentMaintained?: string | undefined;
    totalMaintenanceValue?: string | number | undefined;
}, {
    divisionId: number;
    equipmentMaintained?: string | undefined;
    totalMaintenanceValue?: string | number | undefined;
}>;
export declare const mergeDivisionDocumentSchema: z.ZodObject<{
    divisionId: z.ZodNumber;
    quoteTemplateCode: z.ZodString;
    emailTemplateCode: z.ZodOptional<z.ZodString>;
    emailTo: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, "many">]>>;
    emailSubject: z.ZodOptional<z.ZodString>;
    contactId: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    divisionId: number;
    quoteTemplateCode: string;
    contactId?: number | undefined;
    emailTemplateCode?: string | undefined;
    emailTo?: string | string[] | undefined;
    emailSubject?: string | undefined;
}, {
    divisionId: number;
    quoteTemplateCode: string;
    contactId?: number | undefined;
    emailTemplateCode?: string | undefined;
    emailTo?: string | string[] | undefined;
    emailSubject?: string | undefined;
}>;
/**
 * Format the totalMaintenanceValue argument to a string for storage.
 *
 * Numbers are emitted with exactly 2 decimal places, no currency symbol or
 * thousands separator. Plain numeric strings (e.g. "280", "280.5", "-12.345")
 * are also normalised to 2dp — this matters because some MCP clients
 * serialise tool arguments as JSON strings even when the schema accepts
 * numbers, which is what produced the live "280" (no decimals) regression in
 * round 6. Rich format strings ("£280.00 ex VAT", "$1,200.00") are preserved
 * so callers can hand-format when they want a non-default representation.
 */
export declare function formatMaintenanceValue(value: number | string): string;
export declare function updateDivisionVersaMaintenance(input: z.input<typeof updateDivisionVersaMaintenanceSchema>): Promise<string>;
export declare function mergeDivisionDocument(input: z.input<typeof mergeDivisionDocumentSchema>): Promise<string>;
//# sourceMappingURL=versa-maintenance.d.ts.map