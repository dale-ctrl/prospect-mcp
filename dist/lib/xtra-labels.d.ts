/**
 * Custom-field (Xtra) slot lookup.
 *
 * The tenant exposes per-entity custom-field metadata via the
 * `EntityFields` table. For Xtra entities (QuoteXtra, DivisionXtra,
 * QuoteLineXtra, …) each Standard slot has:
 *
 *   - `FieldName`   = OData property name to read/write
 *                     (e.g. `StandardMemoField3`)
 *   - `ColumnName`  = underlying SQL storage column
 *                     (e.g. `x_365_custom_memo_3`)
 *
 * Earlier rounds wrongly treated the boolean `Identifier` flag (which marks
 * primary-key fields) as the OData property name, which is why the lookup
 * collapsed to zero rows. `FieldName` is the right column.
 *
 * Friendly labels (e.g. "Colour (Extended)") DO live in OData — in the
 * `Translations` table, keyed by `RowIdentity = "Entity.{EntityName}.{FieldName}:{locale}"`.
 * Round 3 wires these in. Locale is taken from `PROSPECT_LOCALE` (default
 * `en-GB`). When a slot has no translation row, `fieldLabel` stays
 * undefined and the slot is still usable by identifier or column name.
 *
 * The resolver accepts three input forms so writes succeed even if
 * EntityFields can't be queried at request time:
 *   1. Friendly label   (when known)
 *   2. Slot identifier  (`StandardTextField3`, `StandardMemoField5`, …)
 *   3. Raw column name  (`x_365_custom_text_3`, …)
 */
import type { ProspectClient } from "../client.js";
export interface XtraSlot {
    identifier: string;
    columnName: string;
    fieldLabel?: string;
}
export declare function entityIdForXtraSet(entitySetOrId: string): string;
export declare function loadXtraSlots(client: ProspectClient, entitySetOrId: string): Promise<XtraSlot[]>;
export declare function indexSlotsByIdentifier(slots: XtraSlot[]): Record<string, XtraSlot>;
/**
 * Resolve `{labelOrIdentifierOrColumn → value}` input into
 * `{identifier → value}` suitable for an OData PATCH body.
 *
 * Accepts three forms in this order:
 *   1. Friendly label from the slot list (case-insensitive)
 *   2. Slot identifier `StandardXxxFieldN` (case-sensitive — this is OData)
 *   3. Raw column name `x_365_custom_xxx_N` (case-insensitive)
 *
 * If the slot list itself is empty (EntityFields query failed completely),
 * the resolver still accepts forms 2 and 3 by structural pattern alone.
 *
 * Throws only when a key matches none of the three forms — surfaces the
 * available slots so the caller can self-correct.
 */
export declare function resolveXtraFieldsToBody(slots: XtraSlot[], fields: Record<string, unknown>): Record<string, unknown>;
/**
 * Translate `identifier → columnName` for output formatting (so callers
 * can show e.g. `StandardMemoField3 (column: x_365_custom_memo_3)` even
 * when the slot didn't appear in EntityFields). Falls back to a structural
 * derivation when not in the slot list.
 */
export declare function columnNameForIdentifier(slots: XtraSlot[], identifier: string): string | null;
export declare function __resetXtraLabelCache(): void;
//# sourceMappingURL=xtra-labels.d.ts.map