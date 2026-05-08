/**
 * Unit tests for the Job Title → Contact Role auto-resolver.
 *
 * Run: npm run test:role-mapper
 *
 * No I/O. Pure function tests against the WCG-agreed fixture set in
 * spec v1.5.0.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveContactRole } from "./lib/role-mapper.js";

interface Fixture {
  input: { jobTitle?: string | null; jobFunction?: string | null };
  expectedCode: string;
  expectedLabel: string;
  note?: string;
}

const FIXTURES: Fixture[] = [
  { input: { jobTitle: "Senco/class teacher" }, expectedCode: "b730fd", expectedLabel: "SENCO", note: "Rule 1 wins over rule 10 by virtue of order" },
  { input: { jobTitle: "SENCO" }, expectedCode: "b730fd", expectedLabel: "SENCO" },
  { input: { jobTitle: "Headteacher" }, expectedCode: "f3724d", expectedLabel: "Head / Principal / SMT" },
  { input: { jobTitle: "Executive Principal" }, expectedCode: "f3724d", expectedLabel: "Head / Principal / SMT" },
  { input: { jobTitle: "Deputy Head" }, expectedCode: "0c3a19", expectedLabel: "Senior Teacher / Head of Dept / Asst Head" },
  { input: { jobTitle: "Head of Maths" }, expectedCode: "0c3a19", expectedLabel: "Senior Teacher / Head of Dept / Asst Head", note: "head of <subject> is rule 3, not rule 2" },
  { input: { jobTitle: "Director of Finance & Operations" }, expectedCode: "cf80c3", expectedLabel: "Bursar / Finance / SBM" },
  { input: { jobTitle: "School Business Manager" }, expectedCode: "cf80c3", expectedLabel: "Bursar / Finance / SBM" },
  { input: { jobTitle: "Procurement Manager" }, expectedCode: "b69b53", expectedLabel: "Procurement / Buyer" },
  { input: { jobTitle: "COO" }, expectedCode: "ed0317", expectedLabel: "Trust / C-Suite" },
  { input: { jobTitle: "CEO" }, expectedCode: "ed0317", expectedLabel: "Trust / C-Suite" },
  { input: { jobTitle: "Operations Manager" }, expectedCode: "b92845", expectedLabel: "Operations" },
  { input: { jobTitle: "Programme Manager" }, expectedCode: "271c0d", expectedLabel: "Office / Admin", note: "Default — no specific rule matches" },
  { input: { jobTitle: "Class Teacher" }, expectedCode: "1f9a30", expectedLabel: "Teacher" },
  { input: { jobTitle: "Architect" }, expectedCode: "0a7e90", expectedLabel: "Influencer" },
  { input: { jobTitle: null }, expectedCode: "271c0d", expectedLabel: "Office / Admin", note: "null → default-empty" },
  { input: {}, expectedCode: "271c0d", expectedLabel: "Office / Admin", note: "missing → default-empty" },
];

for (const f of FIXTURES) {
  const desc = `resolveContactRole(${JSON.stringify(f.input)}) → ${f.expectedCode} ${f.expectedLabel}${f.note ? ` [${f.note}]` : ""}`;
  test(desc, () => {
    const got = resolveContactRole(f.input);
    assert.equal(got.code, f.expectedCode, `code: expected ${f.expectedCode}, got ${got.code} (matchedRule=${got.matchedRule})`);
    assert.equal(got.label, f.expectedLabel, `label: expected ${f.expectedLabel}, got ${got.label}`);
  });
}

// Extra coverage: jobFunction fallback when jobTitle doesn't match.
test("falls back to jobFunction when jobTitle has no match", () => {
  const got = resolveContactRole({ jobTitle: "Programme Manager", jobFunction: "Procurement" });
  assert.equal(got.code, "b69b53", "should pick Procurement from jobFunction");
  assert.match(got.matchedRule, /jobFunction/, "matchedRule should mention jobFunction");
});

test("jobTitle wins over jobFunction when both match", () => {
  const got = resolveContactRole({ jobTitle: "Bursar", jobFunction: "Architect" });
  assert.equal(got.code, "cf80c3", "jobTitle (Bursar) should win");
  assert.match(got.matchedRule, /jobTitle/, "matchedRule should mention jobTitle, not jobFunction");
});

test("'Headteacher and SENCO' → SENCO (rule 1 priority over rule 2)", () => {
  const got = resolveContactRole({ jobTitle: "Headteacher and SENCO" });
  assert.equal(got.code, "b730fd", "SENCO should win over Headteacher because rule 1 sits at the top");
});

test("'Head of School' → Head / Principal (not Senior Teacher)", () => {
  const got = resolveContactRole({ jobTitle: "Head of School" });
  assert.equal(got.code, "f3724d", "rule 2's locked phrase should beat rule 3's generic 'head of '");
});
