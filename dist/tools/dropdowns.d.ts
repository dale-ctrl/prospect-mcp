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
export declare const DROPDOWN_FIELDS: Record<string, DropdownSource>;
export declare const listDropdownOptionsSchema: z.ZodObject<{
    field: z.ZodString;
    includeObsolete: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    field: string;
    includeObsolete: boolean;
}, {
    field: string;
    includeObsolete?: boolean | undefined;
}>;
interface DropdownOption {
    code: string;
    label: string;
}
export declare function __resetDropdownCache(): void;
export declare function fetchDropdownOptions(field: string, includeObsolete?: boolean): Promise<DropdownOption[]>;
export declare function listDropdownOptions(args: z.infer<typeof listDropdownOptionsSchema>): Promise<string>;
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
export declare function resolveDropdownValue(field: string, rawValue: string | number): Promise<string>;
export declare const deleteDivisionSchema: z.ZodObject<{
    divisionId: z.ZodNumber;
    confirmed: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    divisionId: number;
    confirmed: boolean;
}, {
    divisionId: number;
    confirmed: boolean;
}>;
export declare function deleteDivision(args: z.infer<typeof deleteDivisionSchema>): Promise<string>;
export {};
//# sourceMappingURL=dropdowns.d.ts.map