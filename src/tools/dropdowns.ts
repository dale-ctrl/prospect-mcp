/**
 * Lookup-table tools for dropdown/FK options.
 *
 * Two layers of dropdowns are surfaced:
 *
 *  1. Custom dropdowns on DivisionXtra (StandardDropdownField1..5). Their option
 *     rows live in the `DropdownItems` entity, keyed by an FK Id of the form
 *     `Entity.DivisionXtra.StandardDropdownField{N}.<hash>`. Filter by
 *     `startswith(Id, 'Entity.DivisionXtra.StandardDropdownField{N}.')`.
 *
 *  2. Built-in Division FKs (StandardIndustryCode, DeliveryZoneCode, PriorityId,
 *     TurnoverId). Each has its own lookup entity set:
 *      - StandardIndustryCodes        — Code, Description, Obsolete
 *      - DeliveryZones                — Code, Description, Obsolete
 *      - DivisionPriorities           — PriorityId (int), Description, Obsolete
 *      - DivisionTurnovers            — Code, Description, Obsolete
 *
 * The connector exposes a friendly-alias map → (entity set, key field, slot
 * filter). `list_dropdown_options(field)` resolves the alias and returns
 * `[{ code, label }]` rows.
 *
 * The same map drives label→FK translation in createDivision/updateDivision,
 * so callers can pass either the human label ("M.A.T.") or the raw FK
 * ("Entity.DivisionXtra.StandardDropdownField2.04a2188e") interchangeably.
 */

import { z } from "zod";
import { getClient } from "../client.js";

// ─── Field-alias registry ────────────────────────────────────────────────────

interface DropdownSource {
  /** OData entity set to GET. */
  entitySet: string;
  /** The key field in the entity (whose value is what writers pass). */
  keyField: "Id" | "Code" | "PriorityId";
  /** Optional extra filter, used to narrow DropdownItems to one slot. */
  extraFilter?: string;
  /** True if the writer expects an integer (PriorityId) rather than a string. */
  numericKey?: boolean;
}

/**
 * Friendly-alias → DropdownSource map.
 *
 * The custom-dropdown entries point at DropdownItems with a startswith filter
 * that selects only items belonging to that Division slot. The standard-field
 * entries point at their dedicated lookup entity sets.
 */
export const DROPDOWN_FIELDS: Record<string, DropdownSource> = {
  // Custom dropdowns on DivisionXtra (slot N → StandardDropdownField{N})
  paperAccountManager: {
    entitySet: "DropdownItems",
    keyField: "Id",
    extraFilter: "startswith(Id, 'Entity.DivisionXtra.StandardDropdownField1.')",
  },
  customerType: {
    entitySet: "DropdownItems",
    keyField: "Id",
    extraFilter: "startswith(Id, 'Entity.DivisionXtra.StandardDropdownField2.')",
  },
  officeAllocated: {
    entitySet: "DropdownItems",
    keyField: "Id",
    extraFilter: "startswith(Id, 'Entity.DivisionXtra.StandardDropdownField3.')",
  },
  colouredPaperPriceList: {
    entitySet: "DropdownItems",
    keyField: "Id",
    extraFilter: "startswith(Id, 'Entity.DivisionXtra.StandardDropdownField4.')",
  },
  laminatingPouchesList: {
    entitySet: "DropdownItems",
    keyField: "Id",
    extraFilter: "startswith(Id, 'Entity.DivisionXtra.StandardDropdownField5.')",
  },
  // Numeric / canonical aliases for the slots — useful when scripting.
  customDropdown1: {
    entitySet: "DropdownItems",
    keyField: "Id",
    extraFilter: "startswith(Id, 'Entity.DivisionXtra.StandardDropdownField1.')",
  },
  customDropdown2: {
    entitySet: "DropdownItems",
    keyField: "Id",
    extraFilter: "startswith(Id, 'Entity.DivisionXtra.StandardDropdownField2.')",
  },
  customDropdown3: {
    entitySet: "DropdownItems",
    keyField: "Id",
    extraFilter: "startswith(Id, 'Entity.DivisionXtra.StandardDropdownField3.')",
  },
  customDropdown4: {
    entitySet: "DropdownItems",
    keyField: "Id",
    extraFilter: "startswith(Id, 'Entity.DivisionXtra.StandardDropdownField4.')",
  },
  customDropdown5: {
    entitySet: "DropdownItems",
    keyField: "Id",
    extraFilter: "startswith(Id, 'Entity.DivisionXtra.StandardDropdownField5.')",
  },
  // Built-in Division FKs
  standardIndustryCode: { entitySet: "StandardIndustryCodes", keyField: "Code" },
  deliveryZoneCode: { entitySet: "DeliveryZones", keyField: "Code" },
  priorityId: { entitySet: "DivisionPriorities", keyField: "PriorityId", numericKey: true },
  turnoverId: { entitySet: "DivisionTurnovers", keyField: "Code" },
  // SECTOR — Division.LimitedId. Round-4 inspect on Wave MAT 5516 confirmed
  // this is the column behind the UI "SECTOR" label (NOT StandardIndustryCode,
  // which holds SCHOOL STATUS on this tenant). Lookup entity is DivisionLimited
  // (entity set DivisionLimiteds), keyed on Code (6-char hex). E.g. EDUCATION = 'a9ef19'.
  sector: { entitySet: "DivisionLimiteds", keyField: "Code" },
  // Company-level FK. The "Group Type" field on the parent Company entity
  // (column type_id, e.g. 'CUS' for Customer) — used for the Categorisation
  // panel's "Company Group Type" header. CompanyType lookup has Code +
  // Description.
  companyGroupType: { entitySet: "CompanyTypes", keyField: "Code" },
};

const FIELD_ALIASES = Object.keys(DROPDOWN_FIELDS);

// ─── Schemas ─────────────────────────────────────────────────────────────────

export const listDropdownOptionsSchema = z.object({
  field: z.string().describe(
    `Which dropdown to list options for. One of: ${FIELD_ALIASES.join(", ")}. ` +
    "Returns active (non-obsolete) options only.",
  ),
  includeObsolete: z.boolean().optional().default(false).describe(
    "Include rows where Obsolete=1 (default false).",
  ),
});

// ─── Cache ────────────────────────────────────────────────────────────────────

interface DropdownOption {
  code: string;
  label: string;
}

/**
 * Per-field, per-process cache of dropdown options. Populated lazily on first
 * call. Lookup tables change rarely — rebuilding them on every translate-write
 * call would burn rate-limit budget. Tests reset this via `__resetDropdownCache`.
 */
const optionsCache = new Map<string, DropdownOption[]>();

export function __resetDropdownCache(): void {
  optionsCache.clear();
}

// ─── Handlers ────────────────────────────────────────────────────────────────

export async function fetchDropdownOptions(
  field: string,
  includeObsolete = false,
): Promise<DropdownOption[]> {
  const cacheKey = `${field}|${includeObsolete ? "all" : "active"}`;
  const cached = optionsCache.get(cacheKey);
  if (cached) return cached;

  const source = DROPDOWN_FIELDS[field];
  if (!source) {
    throw new Error(
      `Unknown dropdown field '${field}'. Valid options: ${FIELD_ALIASES.join(", ")}`,
    );
  }

  const filterClauses: string[] = [];
  if (source.extraFilter) filterClauses.push(source.extraFilter);
  if (!includeObsolete) filterClauses.push("Obsolete eq 0");

  const sp = new URLSearchParams();
  if (filterClauses.length > 0) sp.set("$filter", filterClauses.join(" and "));
  sp.set("$select", `${source.keyField},Description,Obsolete`);
  sp.set("$orderby", "Description");
  sp.set("$top", "500");

  const client = getClient();
  const result = await client.get<Record<string, unknown>>(source.entitySet, sp.toString());

  const options: DropdownOption[] = result.value.map((row) => ({
    code: String(row[source.keyField] ?? ""),
    label: String(row.Description ?? ""),
  }));

  optionsCache.set(cacheKey, options);
  return options;
}

export async function listDropdownOptions(
  args: z.infer<typeof listDropdownOptionsSchema>,
): Promise<string> {
  const options = await fetchDropdownOptions(args.field, args.includeObsolete);
  return JSON.stringify({ field: args.field, count: options.length, options });
}

/**
 * Resolve a caller-supplied value to its underlying FK code. The value may be:
 *
 *  - the FK code itself (e.g. 'Entity.DivisionXtra.StandardDropdownField2.04a2188e'
 *    or '318b5d') — returned unchanged
 *  - the human label as it appears in the UI (e.g. 'M.A.T.') — looked up and
 *    translated
 *
 * Match rules:
 *  - Exact match on `code` returns immediately (case-sensitive — FK strings are).
 *  - Exact match on `label` (case-insensitive) returns the corresponding code.
 *  - No match throws with the available labels listed.
 *
 * For numeric-key fields (priorityId), pass-through happens via String()/Number()
 * coercion at the caller; this function works on the canonical string form.
 */
export async function resolveDropdownValue(
  field: string,
  rawValue: string | number,
): Promise<string> {
  const value = String(rawValue);
  const options = await fetchDropdownOptions(field, /* include obsolete on writes */ true);

  // 1. Code match — caller already passed a canonical FK.
  const byCode = options.find((o) => o.code === value);
  if (byCode) return byCode.code;

  // 2. Label match (case-insensitive trim).
  const needle = value.trim().toLowerCase();
  const byLabel = options.find((o) => o.label.trim().toLowerCase() === needle);
  if (byLabel) return byLabel.code;

  const sample = options.slice(0, 12).map((o) => `'${o.label}'`).join(", ");
  throw new Error(
    `Could not resolve '${value}' for field '${field}'. ` +
    `Pass either the FK code or the exact UI label. ` +
    `Available labels (first ${Math.min(12, options.length)} of ${options.length}): ${sample}`,
  );
}

// ─── delete_division ─────────────────────────────────────────────────────────

export const deleteDivisionSchema = z.object({
  divisionId: z.number().int().describe("DivisionId to delete"),
  confirmed: z.boolean().describe(
    "Must be `true` to actually delete. This is a guardrail — without it the call returns an error.",
  ),
});

export async function deleteDivision(
  args: z.infer<typeof deleteDivisionSchema>,
): Promise<string> {
  if (args.confirmed !== true) {
    throw new Error(
      `delete_division is destructive. Pass confirmed=true to actually delete DivisionId ${args.divisionId}. ` +
      "The Division (and its linked DivisionXtra/contacts/quotes) will be removed.",
    );
  }
  const client = getClient();
  await client.delete("Divisions", args.divisionId);
  const deletedAt = new Date().toISOString();
  return JSON.stringify({ ok: true, divisionId: args.divisionId, deletedAt });
}
