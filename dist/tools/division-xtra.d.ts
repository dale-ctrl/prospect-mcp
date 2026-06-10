/**
 * Division custom-field (DivisionXtra) writer.
 *
 * Generic counterpart to update_quote_line_xtra (tools/quote-lines.ts) but
 * bound to /DivisionXtras. Writes ANY DivisionXtra Standard slot — memo,
 * text, dropdown, date, decimal, flag — keyed by friendly label, slot
 * identifier, or raw column name, via the shared resolver in
 * lib/xtra-labels.ts.
 *
 * Motivating case: "Full Delivery Address" on the Division Delivery Address
 * tab is DivisionXtra.StandardMemoField3 (x_365_custom_memo_3). Before this
 * tool the only DivisionXtra writers were update_division (dropdowns only)
 * and update_division_versa_maintenance (TextField5/6), so memo/text slots
 * could only be set via the UI.
 *
 * The upsert contract mirrors upsertDivisionXtra in tools/versa-maintenance.ts
 * — PATCH, and on HTTP 404 POST a new row keyed by DivisionId. Inlined here
 * rather than exported to keep modules decoupled; keep the two in sync.
 */
import { z } from "zod";
export declare const updateDivisionXtraSchema: z.ZodObject<{
    divisionId: z.ZodNumber;
    fields: z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean, z.ZodNull]>>;
}, "strip", z.ZodTypeAny, {
    fields: Record<string, string | number | boolean | null>;
    divisionId: number;
}, {
    fields: Record<string, string | number | boolean | null>;
    divisionId: number;
}>;
export declare function updateDivisionXtra(input: z.input<typeof updateDivisionXtraSchema>): Promise<string>;
//# sourceMappingURL=division-xtra.d.ts.map