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
import { getClient } from "../client.js";
import { loadXtraSlots, resolveXtraFieldsToBody } from "../lib/xtra-labels.js";
export const updateDivisionXtraSchema = z.object({
    divisionId: z.number().int().positive().describe("DivisionId whose DivisionXtra row to update (matches DivisionXtra.DivisionId)."),
    fields: z
        .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
        .describe("Custom-field values keyed by ANY of: (1) friendly label when configured " +
        "(e.g. 'Full Delivery Address'), (2) slot identifier 'StandardTextField1..10', " +
        "'StandardMemoField1..5', 'StandardDropdownField1..5', 'StandardDateField1..5', " +
        "'StandardDecimalField1..5', 'StandardFlagField1..5', or (3) raw column name " +
        "'x_365_custom_<type>_<n>' (text/memo/dropdown/date/decimal/flag). Pass null to " +
        "clear a slot. Use get_xtra_fields(entityType='DivisionXtras', parentId=<divisionId>) " +
        "to see all slots and their labels."),
});
/**
 * PATCH the DivisionXtra row for a Division; if the row doesn't exist
 * (HTTP 404), POST a new one keyed by DivisionId. Same contract as
 * upsertDivisionXtra in tools/versa-maintenance.ts — keep the two in sync.
 */
async function upsertDivisionXtra(divisionId, body) {
    const client = getClient();
    try {
        await client.patch("DivisionXtras", divisionId, body);
    }
    catch (err) {
        const msg = err.message || "";
        if (/HTTP 404/.test(msg)) {
            await client.post("DivisionXtras", {
                DivisionId: divisionId,
                ...body,
            });
        }
        else {
            throw err;
        }
    }
    const sp = new URLSearchParams();
    sp.set("$filter", `DivisionId eq ${divisionId}`);
    sp.set("$top", "1");
    const result = await client.get("DivisionXtras", sp.toString());
    return result.value[0] ?? { DivisionId: divisionId, ...body };
}
export async function updateDivisionXtra(input) {
    const args = updateDivisionXtraSchema.parse(input);
    const client = getClient();
    if (!args.fields || Object.keys(args.fields).length === 0) {
        return `No fields provided to update on DivisionXtra ${args.divisionId}.`;
    }
    // Translate {label | identifier | columnName -> value} into {identifier -> value}.
    // Resolver accepts all three forms and falls back to the structural slot
    // pattern even if EntityFields returns nothing.
    const slots = await loadXtraSlots(client, "DivisionXtras").catch(() => []);
    const body = resolveXtraFieldsToBody(slots, args.fields);
    const row = await upsertDivisionXtra(args.divisionId, body);
    return JSON.stringify({
        ok: true,
        divisionId: args.divisionId,
        fieldsUpdated: Object.keys(body),
        row,
    });
}
//# sourceMappingURL=division-xtra.js.map