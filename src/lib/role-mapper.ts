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

interface RoleRule {
  /** Rule number for diagnostics. */
  order: number;
  /** Lowercase substring(s) we look for in jobTitle/jobFunction. */
  patterns: string[];
  code: string;
  label: string;
}

const RULES: RoleRule[] = [
  {
    order: 1,
    patterns: ["senco"],
    code: "b730fd",
    label: "SENCO",
  },
  {
    order: 2,
    // Rule 3 ("head of <thing>") is checked BEFORE rule 2, so the bare
    // "head" keywords below only fire on actual titular roles.
    patterns: [
      "headteacher",
      "head teacher",
      "head of school",
      "headmaster",
      "headmistress",
      "executive principal",
      "principal",
    ],
    code: "f3724d",
    label: "Head / Principal / SMT",
  },
  {
    order: 3,
    patterns: [
      "deputy head",
      "assistant head",
      "asst head",
      // "head of <anything>" — implemented as the substring "head of "
      // (with trailing space) so it doesn't false-match "head of school"
      // (which is rule 2). Rule 2 is checked first below specifically for
      // its locked phrases; this rule is for everything else "head of …".
      "head of ",
    ],
    code: "0c3a19",
    label: "Senior Teacher / Head of Dept / Asst Head",
  },
  {
    order: 4,
    patterns: [
      "bursar",
      "school business manager",
      "sbm",
      "cfo",
      "director of finance",
      "finance manager",
      "finance & operations",
      "finance and operations",
    ],
    code: "cf80c3",
    label: "Bursar / Finance / SBM",
  },
  {
    order: 5,
    patterns: [
      "coo",
      "chief operating",
      "ceo",
      "chief executive",
      "trust director",
      "trust executive",
      "director of trust",
      // also catch "trust director of <x>" / "director of [trust …]"
    ],
    code: "ed0317",
    label: "Trust / C-Suite",
  },
  {
    order: 6,
    patterns: ["procurement", "buyer", "purchasing"],
    code: "b69b53",
    label: "Procurement / Buyer",
  },
  {
    order: 7,
    patterns: ["facilities", "estates", "premises", "building manager"],
    code: "5b2b83",
    label: "Estates / Facilities",
  },
  {
    order: 8,
    patterns: ["operations manager", "operations director"],
    code: "b92845",
    label: "Operations",
  },
  {
    order: 9,
    patterns: ["architect", "surveyor", "contractor", "consultant"],
    code: "0a7e90",
    label: "Influencer",
  },
  {
    order: 10,
    patterns: ["teacher"],
    code: "1f9a30",
    label: "Teacher",
  },
];

const DEFAULT: { code: string; label: string } = {
  code: "271c0d",
  label: "Office / Admin",
};

// Rule 2 has the rule-3 problem inverted: we need to make sure "head of
// school" is captured by rule 2 BEFORE rule 3's generic "head of " catch-all
// claims it. Rather than re-ordering the rules (which would change the
// numbering Dale signed off on), we detect rule-2 phrases first within the
// per-string match function below.
const RULE_2 = RULES.find((r) => r.order === 2)!;
const RULE_3 = RULES.find((r) => r.order === 3)!;

function matchAgainst(haystack: string): { rule: RoleRule; matched: string } | null {
  const lc = haystack.toLowerCase();

  // Rule 1 first.
  const r1 = RULES[0];
  for (const p of r1.patterns) {
    if (lc.includes(p)) return { rule: r1, matched: p };
  }

  // Rule 2 phrases must be checked before rule 3's generic "head of "
  // because "head of school" should map to Head/Principal, not Senior Teacher.
  for (const p of RULE_2.patterns) {
    if (lc.includes(p)) return { rule: RULE_2, matched: p };
  }

  // Now rule 3 (which includes the generic "head of " catch).
  for (const p of RULE_3.patterns) {
    if (lc.includes(p)) return { rule: RULE_3, matched: p };
  }

  // Remaining rules in numeric order (rule 4 onwards).
  for (const r of RULES) {
    if (r.order <= 3) continue;
    for (const p of r.patterns) {
      if (lc.includes(p)) return { rule: r, matched: p };
    }
  }

  return null;
}

/**
 * Resolve a job title (and optional function) to a Contact Role per the
 * WCG mapping rules. See module-level JSDoc for rule order and edge cases.
 *
 * Pure function — no I/O, safe to call from anywhere.
 */
export function resolveContactRole(input: RoleMapperInput): ResolvedRole {
  const jt = (input.jobTitle ?? "").trim();
  const jf = (input.jobFunction ?? "").trim();

  if (jt === "" && jf === "") {
    return {
      code: DEFAULT.code,
      label: DEFAULT.label,
      matchedRule: "default-empty",
    };
  }

  // Try jobTitle first.
  if (jt !== "") {
    const m = matchAgainst(jt);
    if (m) {
      return {
        code: m.rule.code,
        label: m.rule.label,
        matchedRule: `rule-${m.rule.order}-jobTitle:"${m.matched}"`,
      };
    }
  }

  // Then jobFunction.
  if (jf !== "") {
    const m = matchAgainst(jf);
    if (m) {
      return {
        code: m.rule.code,
        label: m.rule.label,
        matchedRule: `rule-${m.rule.order}-jobFunction:"${m.matched}"`,
      };
    }
  }

  return {
    code: DEFAULT.code,
    label: DEFAULT.label,
    matchedRule: "default-no-match",
  };
}

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
export function resolveRoleCodeOrLabel(
  input: string,
  liveRoles: Array<{ Code: string; Description: string | null }>,
): { code: string; label: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // 1. FK-code match, case-insensitive.
  const byCode = liveRoles.find((r) => r.Code.toLowerCase() === trimmed.toLowerCase());
  if (byCode) {
    return { code: byCode.Code, label: byCode.Description || byCode.Code };
  }

  // 2. Live description contains-match.
  const lc = trimmed.toLowerCase();
  const byDesc = liveRoles.find((r) =>
    (r.Description || "").toLowerCase().includes(lc),
  );
  if (byDesc) {
    return { code: byDesc.Code, label: byDesc.Description || byDesc.Code };
  }

  // 3. Match against canonical label list in RULES.
  const byCanonical = [...RULES, { order: 99, patterns: [], code: DEFAULT.code, label: DEFAULT.label }]
    .find((r) => r.label.toLowerCase().includes(lc));
  if (byCanonical) {
    const liveMatch = liveRoles.find((r) => r.Code === byCanonical.code);
    return { code: byCanonical.code, label: liveMatch?.Description || byCanonical.label };
  }

  return null;
}

// Exported for diagnostic / introspection use (e.g. by the
// resolve_contact_role tool to render the rule table to callers).
export const ROLE_RULES_FOR_DIAGNOSTICS = RULES.map((r) => ({
  order: r.order,
  patterns: [...r.patterns],
  code: r.code,
  label: r.label,
}));
export const DEFAULT_ROLE_FOR_DIAGNOSTICS = { ...DEFAULT };
