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

const cache = new Map<string, Promise<XtraSlot[]>>();

const ENTITY_ID_BY_SET: Record<string, string> = {
  QuoteXtras: "QuoteXtra",
  ContactXtras: "ContactXtra",
  DivisionXtras: "DivisionXtra",
  LeadXtras: "LeadXtra",
  CampaignXtras: "CampaignXtra",
  BookingXtras: "BookingXtra",
  ContractXtras: "ContractXtra",
  QuoteLineXtras: "QuoteLineXtra",
  ProductItemXtras: "ProductItemXtra",
};

/**
 * Hard-coded slot families. The Xtra slot count is fixed per family across
 * tenants — Text has 10, the rest have 5. Used as the always-available
 * fallback so writes are accepted even when EntityFields returns nothing.
 */
const SLOT_FAMILIES: Array<{ kind: string; column: string; count: number }> = [
  { kind: "Text", column: "text", count: 10 },
  { kind: "Memo", column: "memo", count: 5 },
  { kind: "Dropdown", column: "dropdown", count: 5 },
  { kind: "Date", column: "date", count: 5 },
  { kind: "Decimal", column: "decimal", count: 5 },
  { kind: "Flag", column: "flag", count: 5 },
];

const HARDCODED_SLOTS: XtraSlot[] = SLOT_FAMILIES.flatMap((f) =>
  Array.from({ length: f.count }, (_, i) => ({
    identifier: `Standard${f.kind}Field${i + 1}`,
    columnName: `x_365_custom_${f.column}_${i + 1}`,
  })),
);

const SLOT_IDENTIFIER_RE = /^Standard[A-Za-z]+Field\d+$/;
const COLUMN_RE = /^x_365_custom_([a-z]+)_(\d+)$/;

export function entityIdForXtraSet(entitySetOrId: string): string {
  return ENTITY_ID_BY_SET[entitySetOrId] ?? entitySetOrId;
}

/**
 * Convert a column name (e.g. `x_365_custom_memo_3`) to its OData property
 * identifier (e.g. `StandardMemoField3`). Returns null if it doesn't look
 * like a Standard slot column.
 */
function columnToIdentifier(column: string): string | null {
  const m = COLUMN_RE.exec(column);
  if (!m) return null;
  const typeMap: Record<string, string> = {
    text: "Text",
    memo: "Memo",
    dropdown: "Dropdown",
    date: "Date",
    decimal: "Decimal",
    flag: "Flag",
    boolean: "Boolean",
    searchtext: "SearchText",
  };
  const cap = typeMap[m[1]] ?? m[1].charAt(0).toUpperCase() + m[1].slice(1);
  return `Standard${cap}Field${m[2]}`;
}

/**
 * Best-effort: load `{identifier → friendly label}` from the Translations
 * table for the given EntityId. Used to enrich the slot map with the
 * Prospect-UI-visible labels (e.g. `StandardMemoField3 → "Colour (Extended)"`).
 *
 * Locale: `PROSPECT_LOCALE` env var, default `en-GB` — same default as the
 * `x-locale` header the client sends. Tenants with multi-locale setups can
 * override per machine.
 *
 * Returns `{}` on any failure — the caller never blocks on label availability.
 */
async function loadSlotLabels(
  client: ProspectClient,
  entityId: string,
): Promise<Record<string, string>> {
  try {
    const locale = (process.env.PROSPECT_LOCALE || "en-GB").trim();
    const sp = new URLSearchParams();
    // RowIdentity is `Entity.{EntityName}.{FieldName}:{Locale}` — anchor on
    // the full prefix so we don't pull labels for nested entities (e.g.
    // `Entity.QuoteLine.QuoteLineXtra` slipping in for `QuoteLine` queries).
    sp.set(
      "$filter",
      `startswith(RowIdentity,'Entity.${entityId}.Standard') and Locale eq '${locale}'`,
    );
    sp.set("$select", "RowIdentity,Value");
    sp.set("$top", "200");
    const result = await client.get<{ RowIdentity: string | null; Value: string | null }>(
      "Translations",
      sp.toString(),
    );
    const out: Record<string, string> = {};
    const prefix = `Entity.${entityId}.`;
    const suffix = `:${locale}`;
    for (const r of result.value) {
      if (!r.Value || !r.RowIdentity) continue;
      if (!r.RowIdentity.startsWith(prefix) || !r.RowIdentity.endsWith(suffix)) continue;
      const fieldName = r.RowIdentity.substring(
        prefix.length,
        r.RowIdentity.length - suffix.length,
      );
      if (SLOT_IDENTIFIER_RE.test(fieldName)) out[fieldName] = r.Value;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Convert a slot identifier (e.g. `StandardMemoField3`) to its raw column
 * name (e.g. `x_365_custom_memo_3`). Returns null if it doesn't match.
 */
function identifierToColumn(identifier: string): string | null {
  const m = /^Standard([A-Za-z]+)Field(\d+)$/.exec(identifier);
  if (!m) return null;
  return `x_365_custom_${m[1].toLowerCase()}_${m[2]}`;
}

export async function loadXtraSlots(
  client: ProspectClient,
  entitySetOrId: string,
): Promise<XtraSlot[]> {
  const entityId = entityIdForXtraSet(entitySetOrId);
  const cached = cache.get(entityId);
  if (cached) return cached;

  const promise = (async () => {
    // Fetch slots and labels in parallel — labels are best-effort so a failure
    // here can't block the slot list (and writes through it).
    const [slotRows, labels] = await Promise.all([
      (async () => {
        const sp = new URLSearchParams();
        sp.set("$filter", `EntityId eq '${entityId}'`);
        // FieldName is the OData property name on this tenant; ColumnName is the
        // SQL column. Identifier is a Boolean PK flag (was wrongly used as the
        // property name in v1.9-pre).
        sp.set("$select", "EntityId,FieldName,ColumnName");
        sp.set("$top", "200");
        try {
          const result = await client.get<{ FieldName: string | null; ColumnName: string | null }>(
            "EntityFields",
            sp.toString(),
          );
          return result.value;
        } catch {
          return [] as Array<{ FieldName: string | null; ColumnName: string | null }>;
        }
      })(),
      loadSlotLabels(client, entityId),
    ]);

    const slots: XtraSlot[] = [];
    for (const r of slotRows) {
      if (!r.FieldName || !r.ColumnName) continue;
      if (!SLOT_IDENTIFIER_RE.test(r.FieldName)) continue;
      slots.push({ identifier: r.FieldName, columnName: r.ColumnName });
    }

    // If EntityFields gave us nothing usable, fall back to the hard-coded
    // family so the writer still accepts identifiers and column names.
    const base = slots.length > 0 ? slots : HARDCODED_SLOTS.map((s) => ({ ...s }));
    for (const s of base) {
      const lbl = labels[s.identifier];
      if (lbl) s.fieldLabel = lbl;
    }
    return base;
  })();

  cache.set(entityId, promise);
  try {
    return await promise;
  } catch (err) {
    cache.delete(entityId);
    throw err;
  }
}

export function indexSlotsByIdentifier(slots: XtraSlot[]): Record<string, XtraSlot> {
  const out: Record<string, XtraSlot> = {};
  for (const s of slots) out[s.identifier] = s;
  return out;
}

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
export function resolveXtraFieldsToBody(
  slots: XtraSlot[],
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const byIdentifier = new Map<string, XtraSlot>();
  const byColumnLower = new Map<string, XtraSlot>();
  const byLabelLower = new Map<string, XtraSlot>();
  for (const s of slots) {
    byIdentifier.set(s.identifier, s);
    if (s.columnName) byColumnLower.set(s.columnName.toLowerCase(), s);
    if (s.fieldLabel) byLabelLower.set(s.fieldLabel.toLowerCase(), s);
  }

  const body: Record<string, unknown> = {};
  const unknown: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    let identifier: string | undefined;

    // 1. Friendly label match (only when slot list carries labels).
    const labelMatch = byLabelLower.get(key.toLowerCase());
    if (labelMatch) identifier = labelMatch.identifier;

    // 2. Slot identifier match — exact, case-sensitive (OData property name).
    if (!identifier && byIdentifier.has(key)) identifier = key;

    // 3. Column name match.
    if (!identifier) {
      const colMatch = byColumnLower.get(key.toLowerCase());
      if (colMatch) identifier = colMatch.identifier;
    }

    // Structural fallback — slot list might be empty if EntityFields blew up,
    // but a syntactically valid slot identifier or column name is still safe
    // to pass through.
    if (!identifier && SLOT_IDENTIFIER_RE.test(key)) {
      identifier = key;
    }
    if (!identifier) {
      const fromColumn = columnToIdentifier(key.toLowerCase());
      if (fromColumn) identifier = fromColumn;
    }

    if (identifier) {
      body[identifier] = value;
    } else {
      unknown.push(key);
    }
  }

  if (unknown.length > 0) {
    const sample = slots.length > 0
      ? slots
          .slice(0, 12)
          .map((s) =>
            s.fieldLabel
              ? `"${s.fieldLabel}" (${s.identifier})`
              : `${s.identifier} → ${s.columnName}`,
          )
          .join(", ") + (slots.length > 12 ? `, … (${slots.length - 12} more)` : "")
      : "(no slots loaded — pass an identifier like 'StandardTextField3' or a column like 'x_365_custom_text_3')";
    throw new Error(
      `Unknown Xtra field(s): ${unknown.map((u) => `"${u}"`).join(", ")}. ` +
        `Valid options: ${sample}.`,
    );
  }

  return body;
}

/**
 * Translate `identifier → columnName` for output formatting (so callers
 * can show e.g. `StandardMemoField3 (column: x_365_custom_memo_3)` even
 * when the slot didn't appear in EntityFields). Falls back to a structural
 * derivation when not in the slot list.
 */
export function columnNameForIdentifier(slots: XtraSlot[], identifier: string): string | null {
  for (const s of slots) {
    if (s.identifier === identifier) return s.columnName || null;
  }
  return identifierToColumn(identifier);
}

export function __resetXtraLabelCache(): void {
  cache.clear();
}
