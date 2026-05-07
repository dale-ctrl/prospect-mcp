#!/usr/bin/env node

/**
 * Unit tests for round-4 additions: accountManager param, Company tools,
 * companyGroupType dropdown, inspect_division_categorisation_panel.
 *
 * Run with: npm run test:companies
 */

import { test } from "node:test";
import assert from "node:assert/strict";

process.env.PROSPECT_PAT = process.env.PROSPECT_PAT || "test-token-for-mock";
process.env.PROSPECT_BASE_URL =
  process.env.PROSPECT_BASE_URL || "https://api-v1-westeurope.prospect365.com";
process.env.PROSPECT_PROFILE_ID = process.env.PROSPECT_PROFILE_ID || "test-profile-id";

const { createDivision, updateDivision } = await import("./tools/contacts.js");
const { getCompany, updateCompany, listCompanies } = await import("./tools/companies.js");
const { listDropdownOptions, __resetDropdownCache } = await import("./tools/dropdowns.js");
const { inspectDivisionCategorisationPanel } = await import("./tools/inspect.js");

interface MockCall {
  url: string;
  method: string;
  body?: unknown;
  query: URLSearchParams;
}

function installFetchMock(handler: (call: MockCall) => { status?: number; json?: unknown }) {
  const calls: MockCall[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    const queryStr = u.includes("?") ? u.slice(u.indexOf("?") + 1) : "";
    const rawBody = typeof init?.body === "string" ? init.body : undefined;
    let parsedBody: unknown;
    try {
      parsedBody = rawBody ? JSON.parse(rawBody) : undefined;
    } catch { /* not JSON */ }
    const call: MockCall = {
      url: u,
      method: init?.method ?? "GET",
      body: parsedBody,
      query: new URLSearchParams(queryStr),
    };
    calls.push(call);
    const resp = handler(call);
    return new Response(resp.json !== undefined ? JSON.stringify(resp.json) : null, {
      status: resp.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = originalFetch;
      __resetDropdownCache();
    },
  };
}

const COMPANY_TYPES = [
  { Code: "CUS", Description: "Customer", Obsolete: 0 },
  { Code: "PRO", Description: "Prospect", Obsolete: 0 },
  { Code: "SUP", Description: "Supplier", Obsolete: 0 },
];

// ─── #1 — accountManager parameter ───────────────────────────────────────────

test("update_division: accountManager writes to Division.AccountManager", async () => {
  const mock = installFetchMock((call) => {
    if (call.method === "PATCH" && call.url.includes("/Divisions(2069)")) return { status: 204 };
    return { status: 204 };
  });
  try {
    await updateDivision({ divisionId: 2069, accountManager: "ML1" });
    const patch = mock.calls.find(
      (c) => c.method === "PATCH" && c.url.includes("/Divisions(2069)"),
    );
    assert.ok(patch, "expected PATCH to /Divisions(2069)");
    const body = patch.body as Record<string, unknown>;
    assert.equal(body.AccountManager, "ML1", `body must include AccountManager: ${JSON.stringify(body)}`);
  } finally {
    mock.restore();
  }
});

test("create_division: accountManager goes onto Divisions POST body alongside other fields", async () => {
  const mock = installFetchMock((call) => {
    if (call.method === "POST" && call.url.endsWith("/Companies")) {
      return { json: { CompanyId: 9001 } };
    }
    if (call.method === "POST" && call.url.endsWith("/Divisions")) {
      return { json: { DivisionId: 5555, AddressId: 7777 } };
    }
    return { status: 204 };
  });
  try {
    await createDivision({ name: "Test MAT 4", accountManager: "ML1", territoryCode: "WGAREA" });
    const divPost = mock.calls.find((c) => c.method === "POST" && c.url.endsWith("/Divisions"));
    const body = divPost!.body as Record<string, unknown>;
    assert.equal(body.AccountManager, "ML1", `AccountManager missing: ${JSON.stringify(body)}`);
    assert.equal(body.TerritoryCode, "WGAREA");
  } finally {
    mock.restore();
  }
});

// ─── #3 — companyGroupType dropdown wired through CompanyTypes ───────────────

test("list_dropdown_options(field='companyGroupType') queries CompanyTypes entity set", async () => {
  const mock = installFetchMock((call) => {
    if (call.url.includes("/CompanyTypes")) {
      return { json: { value: COMPANY_TYPES } };
    }
    return { json: { value: [] } };
  });
  try {
    const json = await listDropdownOptions({ field: "companyGroupType", includeObsolete: false });
    const parsed = JSON.parse(json) as { options: Array<{ code: string; label: string }> };
    const cus = parsed.options.find((o) => o.code === "CUS");
    assert.ok(cus, `expected CUS row: ${JSON.stringify(parsed.options)}`);
    assert.equal(cus.label, "Customer");
    const url = mock.calls[0].url;
    assert.ok(url.includes("/CompanyTypes"), `expected /CompanyTypes URL: ${url}`);
  } finally {
    mock.restore();
  }
});

// ─── #3 — Company tools ─────────────────────────────────────────────────────

test("get_company: fetches /Companies(id) with $expand=Type", async () => {
  const mock = installFetchMock((call) => {
    if (call.url.includes("/Companies(29864)")) {
      return {
        json: {
          value: [
            {
              CompanyId: 29864,
              Name: "Pilot Test Co",
              TypeId: "CUS",
              Type: { Code: "CUS", Description: "Customer" },
            },
          ],
        },
      };
    }
    return { json: { value: [] } };
  });
  try {
    const out = await getCompany({ companyId: 29864 });
    const parsed = JSON.parse(out);
    assert.equal(parsed.CompanyId, 29864);
    assert.equal(parsed.Name, "Pilot Test Co");
    assert.equal(parsed.Type.Description, "Customer");
    const expand = mock.calls[0].query.get("$expand") ?? "";
    assert.ok(expand.includes("Type"), `expected Type $expand: ${expand}`);
  } finally {
    mock.restore();
  }
});

test("update_company: companyGroupType label translates to TypeId via CompanyTypes", async () => {
  const mock = installFetchMock((call) => {
    if (call.url.includes("/CompanyTypes")) return { json: { value: COMPANY_TYPES } };
    if (call.method === "PATCH" && call.url.includes("/Companies(29864)")) return { status: 204 };
    return { status: 204 };
  });
  try {
    await updateCompany({ companyId: 29864, companyGroupType: "Customer" });
    const patch = mock.calls.find(
      (c) => c.method === "PATCH" && c.url.includes("/Companies(29864)"),
    );
    assert.ok(patch);
    const body = patch.body as Record<string, unknown>;
    assert.equal(body.TypeId, "CUS", `label 'Customer' must translate to FK 'CUS': ${JSON.stringify(body)}`);
  } finally {
    mock.restore();
  }
});

test("update_company: FK-form companyGroupType passes through unchanged", async () => {
  const mock = installFetchMock((call) => {
    if (call.url.includes("/CompanyTypes")) return { json: { value: COMPANY_TYPES } };
    return { status: 204 };
  });
  try {
    await updateCompany({ companyId: 29864, companyGroupType: "CUS" });
    const patch = mock.calls.find((c) => c.method === "PATCH" && c.url.includes("/Companies(29864)"));
    const body = patch!.body as Record<string, unknown>;
    assert.equal(body.TypeId, "CUS");
  } finally {
    mock.restore();
  }
});

test("update_company: source is free-text, NOT routed through dropdown resolver", async () => {
  const mock = installFetchMock((call) => {
    if (call.method === "PATCH" && call.url.includes("/Companies(29864)")) return { status: 204 };
    return { json: { value: COMPANY_TYPES } };
  });
  try {
    await updateCompany({ companyId: 29864, source: "Hand-picked from GIAS" });
    const dropdownCalls = mock.calls.filter((c) =>
      c.url.includes("/CompanyTypes") || c.url.includes("/DropdownItems"),
    );
    assert.equal(dropdownCalls.length, 0, "source must not trigger dropdown lookups");
    const patch = mock.calls.find((c) => c.method === "PATCH" && c.url.includes("/Companies(29864)"));
    const body = patch!.body as Record<string, unknown>;
    assert.equal(body.Source, "Hand-picked from GIAS");
  } finally {
    mock.restore();
  }
});

test("list_companies: filters by companyGroupType via FK translation", async () => {
  const mock = installFetchMock((call) => {
    if (call.url.includes("/CompanyTypes")) return { json: { value: COMPANY_TYPES } };
    if (call.url.includes("/Companies")) {
      return {
        json: {
          value: [{ CompanyId: 1, Name: "ACo", TypeId: "CUS" }],
          "@odata.count": 1,
        },
      };
    }
    return { json: { value: [] } };
  });
  try {
    const json = await listCompanies({ filters: { companyGroupType: "Customer" }, pageSize: 500 });
    const parsed = JSON.parse(json) as { totalCount: number; records: unknown[] };
    assert.equal(parsed.totalCount, 1);
    const companiesCall = mock.calls.find(
      (c) => c.url.includes("/Companies") && !c.url.includes("/CompanyTypes"),
    );
    const filter = companiesCall!.query.get("$filter") ?? "";
    assert.ok(filter.includes("TypeId eq 'CUS'"), `filter must use FK code: ${filter}`);
  } finally {
    mock.restore();
  }
});

// ─── inspect_division_categorisation_panel ──────────────────────────────────

test("inspect_division_categorisation_panel: returns flat dump of Division, DivisionXtra, Company, CompanyXtra with empties stripped", async () => {
  const mock = installFetchMock((call) => {
    if (call.url.includes("/Divisions(5516)")) {
      return {
        json: {
          value: [
            {
              DivisionId: 5516,
              Name: "Wave Multi Academy Trust",
              Source: null,
              CompanyId: 12345,
              DivisionXtra: {
                DivisionId: 5516,
                StandardTextField1: "Wave",
                StandardTextField9: "wave-tag",
                StandardTextField10: "",
                StandardSearchTextField1: null,
                StandardDropdownField2: "Entity.DivisionXtra.StandardDropdownField2.04a2188e",
              },
            },
          ],
        },
      };
    }
    if (call.url.includes("/Companies(12345)")) {
      return {
        json: {
          value: [
            {
              CompanyId: 12345,
              Name: "Wave Multi Academy Trust",
              TypeId: "CUS",
              Source: null,
              CompanyXtra: { CompanyId: 12345, StandardTextField1: "company-text-1" },
            },
          ],
        },
      };
    }
    return { json: { value: [] } };
  });
  try {
    const out = await inspectDivisionCategorisationPanel({ divisionId: 5516 });
    const parsed = JSON.parse(out) as {
      divisionId: number;
      hint: string;
      division: Record<string, unknown>;
      divisionXtra: Record<string, unknown>;
      company: Record<string, unknown>;
      companyXtra: Record<string, unknown>;
    };
    assert.equal(parsed.divisionId, 5516);
    assert.equal(parsed.division.Name, "Wave Multi Academy Trust");
    assert.ok(!("Source" in parsed.division), "null Source should be stripped");
    assert.ok(!("DivisionXtra" in parsed.division), "DivisionXtra should be moved to top-level section");
    assert.equal(parsed.divisionXtra.StandardTextField1, "Wave");
    assert.ok(!("StandardTextField10" in parsed.divisionXtra), "empty string should be stripped");
    assert.ok(
      !("StandardSearchTextField1" in parsed.divisionXtra),
      "null SearchTextField should be stripped",
    );
    assert.equal(parsed.divisionXtra.StandardDropdownField2, "Entity.DivisionXtra.StandardDropdownField2.04a2188e");
    assert.equal(parsed.company.TypeId, "CUS");
    assert.equal(parsed.companyXtra.StandardTextField1, "company-text-1");
    assert.ok(parsed.hint.includes("AREA LOCATION"), `hint should mention target labels: ${parsed.hint}`);
  } finally {
    mock.restore();
  }
});

test("inspect_division_categorisation_panel: degrades gracefully when Company fetch fails", async () => {
  const mock = installFetchMock((call) => {
    if (call.url.includes("/Divisions(5516)")) {
      return {
        json: {
          value: [{ DivisionId: 5516, Name: "Wave", CompanyId: 12345, DivisionXtra: { DivisionId: 5516 } }],
        },
      };
    }
    if (call.url.includes("/Companies(12345)")) {
      return { status: 500, json: { error: { message: "boom" } } };
    }
    return { json: { value: [] } };
  });
  try {
    const out = await inspectDivisionCategorisationPanel({ divisionId: 5516 });
    const parsed = JSON.parse(out) as { company: Record<string, unknown> | null };
    assert.equal(parsed.company, null, "Company fetch failure must not break the inspect call");
  } finally {
    mock.restore();
  }
});

// ─── Regression: round-1 URL encoding still holds for new tools ─────────────

test("regression: list_companies(filters.name='A & B Ltd') round-trips '&' through $filter", async () => {
  const mock = installFetchMock(() => ({ json: { value: [], "@odata.count": 0 } }));
  try {
    await listCompanies({ filters: { name: "A & B Ltd" }, pageSize: 500 });
    const url = mock.calls[0].url;
    assert.ok(url.includes("%26"), `'&' must be percent-encoded in raw URL: ${url}`);
    const filter = mock.calls[0].query.get("$filter") ?? "";
    assert.ok(
      filter.includes("contains(Name,'A & B Ltd')"),
      `'&' must round-trip inside the filter literal: ${filter}`,
    );
  } finally {
    mock.restore();
  }
});
