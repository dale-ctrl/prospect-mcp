/**
 * WCG Job-Title → Contact-Role auto-resolver.
 *
 * Owned rule table — first match wins. Patterns are case-insensitive
 * substring matches against `jobTitle` first; if none hit, retry against
 * `jobFunction`. If both inputs are empty / null, return Office/Admin
 * with `matchedRule: "default-empty"`.
 *
 * Rule order matters and was agreed with Dale. Notable behaviours:
 *
 *  - "Senco/class teacher" → SENCO (rule 1 fires before rule 10 catches
 *    "teacher").
 *  - "Head of Year 6" / "Head of Maths" → Senior Teacher (rule 3 catches
 *    "head of " before rule 2's "head" patterns get a chance — the rule 2
 *    keywords are anchored to the exact role name, not the bare word).
 *  - "Headteacher and SENCO" → SENCO. SENCO is the more specific
 *    designation; rule 1 sits at the top intentionally so this dual title
 *    doesn't get filed under Head/Principal.
 *
 * The matched-rule string is for diagnostics / wash-up reporting — it
 * pinpoints which keyword fired so a human can trace why a particular
 * mapping happened during a bulk load.
 *
 * Codes verified live against the WCG ContactRoles entity 2026-05-08.
 */
export interface ResolvedRole {
    code: string;
    label: string;
    matchedRule: string;
}
export interface RoleMapperInput {
    jobTitle?: string | null;
    jobFunction?: string | null;
}
/**
 * Resolve a job title (and optional function) to a Contact Role per the
 * WCG mapping rules. See module-level JSDoc for rule order and edge cases.
 *
 * Pure function — no I/O, safe to call from anywhere.
 */
export declare function resolveContactRole(input: RoleMapperInput): ResolvedRole;
/**
 * Map a caller-supplied roleCode (FK code OR UI label) to the canonical
 * FK code. Used by `update_contact` to accept either form.
 *
 * Returns the FK code on a successful match, or null if the input matches
 * neither a known FK code nor any role label/keyword. Resolution is
 * case-insensitive. Label match is a contains-test over the live role
 * descriptions plus the WCG-canonical labels in the mapper.
 *
 * NB this is a pure function — it doesn't hit the API. Callers that want
 * to validate against live ContactRoles should fetch them separately
 * (e.g. via getContactRoles) and pass the result in.
 */
export declare function resolveRoleCodeOrLabel(input: string, liveRoles: Array<{
    Code: string;
    Description: string | null;
}>): {
    code: string;
    label: string;
} | null;
export declare const ROLE_RULES_FOR_DIAGNOSTICS: {
    order: number;
    patterns: string[];
    code: string;
    label: string;
}[];
export declare const DEFAULT_ROLE_FOR_DIAGNOSTICS: {
    code: string;
    label: string;
};
//# sourceMappingURL=role-mapper.d.ts.map