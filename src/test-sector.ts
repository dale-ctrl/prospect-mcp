#!/usr/bin/env node

/**
 * Round-5 unit tests: sector param, corrected description labels, inspect
 * hint refresh. All against mocked global fetch.
 *
 * Run with: npm run test:sector
 */

import { test } from "node:test";
import assert from "node:assert/strict";

process.env.PROSPECT_PAT = process.env.PROSPECT_PAT || "test-token-for-mock";
process.env.PROSPECT_BASE_URL =
  process.env.PROSPECT_BASE_URL || "https://api-v1-westeurope.prospect365.com";
process.env.PROSPECT_PROFILE_ID = process.env.PROSPECT_PROFILE_ID || "test-profile-id";

const { createDivision, updateDivision, updateDivisionSchema, createDivisionSchema } = await import(
  "./tools/contacts.js"
);
const { listDropdownOptions, __resetDropdownCache, DROPDOWN_FIELDS } = await import(
  "./tools/dropdowns.js"
);
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

const SECTOR_OPTIONS = [
  { Code: "a9ef19", Description: "EDUCATION", Obsolete: 0 },
  { Code: "55b1e1", Description: "COMMERCIAL", Obsolete: 0 },
  { Code: "ab12cd", Description: "NHS", Obsolete: 0 },
];
const TERRITORY_OPTIONS = [
  { TerritoryId: "WGAREA137e6eff02e14d98942fe6b8baf5af77", Description: "WG AREA", Obsolete: 0 },
];
const SCHOOL_STATUS_OPTIONS = [
  { Code: "318b5d", Description: "ACADEMY", Obsolete: 0 },
  { Code: "ff77aa", Description: "FREE SCHOOL", Obsolete: 0 },
];

// ─── Acceptance criterion 1 — list_dropdown_options('sector') ────────────────

test("DROPDOWN_FIELDS registry contains 'sector' pointing at DivisionLimiteds(Code)", () => {
  const src = DROPDOWN_FIELDS.sector;
  assert.ok(src, "sector must be registered");
  assert.equal(src.entitySet, "DivisionLimiteds");
  assert.equal(src.keyField, "Code");
});

test("list_dropdown_options(field='sector') queries DivisionLimiteds and returns EDUCATION", async () => {
  const mock = installFetchMock((call) => {
    if (call.url.includes("/DivisionLimiteds")) return { json: { value: SECTOR_OPTIONS } };
    return { json: { value: [] } };
  });
  try {
    const json = await listDropdownOptions({ field: "sector", includeObsolete: false });
    const parsed = JSON.parse(json) as {
      field: string;
      count: number;
      options: Array<{ code: string; label: string }>;
    };
    assert.equal(parsed.field, "sector");
    const edu = parsed.options.find((o) => o.label === "EDUCATION");
    assert.ok(edu, `expected EDUCATION row: ${JSON.stringify(parsed.options)}`);
    assert.equal(edu.code, "a9ef19");
    const url = mock.calls[0].url;
    assert.ok(url.includes("/DivisionLimiteds"), `expected /DivisionLimiteds URL: ${url}`);
    const select = mock.calls[0].query.get("$select") ?? "";
    assert.ok(select.includes("Code"));
    assert.ok(select.includes("Description"));
  } finally {
    mock.restore();
  }
});

// ─── Acceptance criterion 2 — update_division(sector='EDUCATION') ────────────

test("update_division(sector='EDUCATION'): label translates to LimitedId='a9ef19'", async () => {
  const mock = installFetchMock((call) => {
    if (call.url.includes("/DivisionLimiteds")) return { json: { value: SECTOR_OPTIONS } };
    if (call.method === "PATCH" && call.url.includes("/Divisions(2069)")) return { status: 204 };
    return { status: 204 };
  });
  try {
    await updateDivision({ divisionId: 2069, sector: "EDUCATION" });
    const patch = mock.calls.find(
      (c) => c.method === "PATCH" && c.url.includes("/Divisions(2069)"),
    );
    assert.ok(patch, "expected PATCH to /Divisions(2069)");
    const body = patch.body as Record<string, unknown>;
    assert.equal(body.LimitedId, "a9ef19", `body must set LimitedId='a9ef19': ${JSON.stringify(body)}`);
    // Must NOT touch StandardIndustryCode just because the old/incorrect description said SECTOR.
    assert.ok(
      !("StandardIndustryCode" in body),
      `sector must not write to StandardIndustryCode: ${JSON.stringify(body)}`,
    );
  } finally {
    mock.restore();
  }
});

test("update_division(sector='a9ef19'): FK form passes through unchanged", async () => {
  const mock = installFetchMock((call) => {
    if (call.url.includes("/DivisionLimiteds")) return { json: { value: SECTOR_OPTIONS } };
    return { status: 204 };
  });
  try {
    await updateDivision({ divisionId: 2069, sector: "a9ef19" });
    const patch = mock.calls.find((c) => c.method === "PATCH" && c.url.includes("/Divisions(2069)"));
    const body = patch!.body as Record<string, unknown>;
    assert.equal(body.LimitedId, "a9ef19");
  } finally {
    mock.restore();
  }
});

test("create_division: sector + standardIndustryCode together write LimitedId AND StandardIndustryCode (independent fields)", async () => {
  const mock = installFetchMock((call) => {
    if (call.url.includes("/DivisionLimiteds")) return { json: { value: SECTOR_OPTIONS } };
    if (call.url.includes("/StandardIndustryCodes")) {
      return { json: { value: SCHOOL_STATUS_OPTIONS } };
    }
    if (call.method === "POST" && call.url.endsWith("/Companies")) {
      return { json: { CompanyId: 9001 } };
    }
    if (call.method === "POST" && call.url.endsWith("/Divisions")) {
      return { json: { DivisionId: 5555, AddressId: 7777 } };
    }
    return { status: 204 };
  });
  try {
    await createDivision({
      name: "Test MAT 5",
      sector: "EDUCATION",
      standardIndustryCode: "ACADEMY",
    });
    const divPost = mock.calls.find((c) => c.method === "POST" && c.url.endsWith("/Divisions"));
    const body = divPost!.body as Record<string, unknown>;
    assert.equal(body.LimitedId, "a9ef19", `SECTOR (LimitedId) missing: ${JSON.stringify(body)}`);
    assert.equal(
      body.StandardIndustryCode,
      "318b5d",
      `SCHOOL STATUS (StandardIndustryCode) missing: ${JSON.stringify(body)}`,
    );
  } finally {
    mock.restore();
  }
});

// ─── Acceptance criteria 3 + 4 — label-to-FK regression for renamed fields ────

test("update_division(territoryCode='...'): keeps writing to Division.TerritoryCode (path unchanged from round 1)", async () => {
  const mock = installFetchMock(() => ({ status: 204 }));
  try {
    await updateDivision({
      divisionId: 2069,
      territoryCode: "WGAREA137e6eff02e14d98942fe6b8baf5af77",
    });
    const patch = mock.calls.find((c) => c.method === "PATCH" && c.url.includes("/Divisions(2069)"));
    assert.ok(patch);
    const body = patch.body as Record<string, unknown>;
    assert.equal(
      body.TerritoryCode,
      "WGAREA137e6eff02e14d98942fe6b8baf5af77",
      `TerritoryCode must round-trip: ${JSON.stringify(body)}`,
    );
  } finally {
    mock.restore();
  }
});

test("update_division(standardIndustryCode='ACADEMY'): label translates to '318b5d' even though the description says SCHOOL STATUS now", async () => {
  const mock = installFetchMock((call) => {
    if (call.url.includes("/StandardIndustryCodes")) {
      return { json: { value: SCHOOL_STATUS_OPTIONS } };
    }
    return { status: 204 };
  });
  try {
    await updateDivision({ divisionId: 2069, standardIndustryCode: "ACADEMY" });
    const patch = mock.calls.find((c) => c.method === "PATCH" && c.url.includes("/Divisions(2069)"));
    const body = patch!.body as Record<string, unknown>;
    assert.equal(body.StandardIndustryCode, "318b5d");
    // sector and StandardIndustryCode are independent; only StandardIndustryCode should be written here.
    assert.ok(!("LimitedId" in body), `must not touch LimitedId: ${JSON.stringify(body)}`);
  } finally {
    mock.restore();
  }
});

// ─── Acceptance criterion 6 — schema descriptions reflect correct UI labels ───

test("schema descriptions: territoryCode reads 'AREA LOCATION', standardIndustryCode reads 'SCHOOL STATUS'", () => {
  const update = updateDivisionSchema.shape;
  const create = createDivisionSchema.shape;
  for (const shape of [update, create]) {
    const territoryDesc = shape.territoryCode._def.description ?? "";
    assert.ok(
      /AREA LOCATION/i.test(territoryDesc),
      `territoryCode description should mention 'AREA LOCATION', got: ${territoryDesc}`,
    );
    const sicDesc = shape.standardIndustryCode._def.description ?? "";
    assert.ok(
      /SCHOOL STATUS/i.test(sicDesc),
      `standardIndustryCode description should mention 'SCHOOL STATUS', got: ${sicDesc}`,
    );
    assert.ok(
      !/^SECTOR/i.test(sicDesc),
      `standardIndustryCode description should no longer start with 'SECTOR': ${sicDesc}`,
    );
    const sectorDesc = shape.sector._def.description ?? "";
    assert.ok(
      /SECTOR/i.test(sectorDesc) && /LimitedId/.test(sectorDesc),
      `sector description should mention SECTOR + LimitedId: ${sectorDesc}`,
    );
  }
});

// ─── Acceptance criterion 7 — inspect hint refreshed ─────────────────────────

test("inspect_division_categorisation_panel: hint mentions correct backing fields and Interiors AM caveat", async () => {
  const mock = installFetchMock((call) => {
    if (call.url.includes("/Divisions(5516)")) {
      return {
        json: {
          value: [
            {
              DivisionId: 5516,
              Name: "Wave",
              CompanyId: 1737,
              TerritoryCode: "WGAREA137e6eff02e14d98942fe6b8baf5af77",
              LimitedId: "a9ef19",
              StandardIndustryCode: "318b5d",
              DivisionXtra: { DivisionId: 5516 },
            },
          ],
        },
      };
    }
    if (call.url.includes("/Companies(1737)")) {
      return { json: { value: [{ CompanyId: 1737, Name: "Wave" }] } };
    }
    return { json: { value: [] } };
  });
  try {
    const out = await inspectDivisionCategorisationPanel({ divisionId: 5516 });
    const parsed = JSON.parse(out) as { hint: string; division: Record<string, unknown> };
    assert.ok(parsed.hint.includes("AREA LOCATION"), `hint must mention AREA LOCATION: ${parsed.hint}`);
    assert.ok(parsed.hint.includes("Division.TerritoryCode"));
    assert.ok(parsed.hint.includes("Division.LimitedId"), `hint must mention LimitedId for SECTOR: ${parsed.hint}`);
    assert.ok(
      parsed.hint.includes("Division.StandardIndustryCode"),
      `hint must mention StandardIndustryCode for SCHOOL STATUS: ${parsed.hint}`,
    );
    assert.ok(
      parsed.hint.includes("Interiors Account Manager"),
      `hint must explain Interiors AM is not in OData surface: ${parsed.hint}`,
    );
    // No longer says "look on divisionXtra/companyXtra for AREA LOCATION" — that was the wrong hint.
    assert.ok(
      !/divisionXtra' or 'companyXtra' whose values match the AREA LOCATION/.test(parsed.hint),
      `old misleading hint must be gone: ${parsed.hint}`,
    );
  } finally {
    mock.restore();
  }
});

// ─── Regression — URL encoding still holds for new sector lookup ─────────────

test("regression: list_dropdown_options('sector') survives URLSearchParams encoding", async () => {
  const mock = installFetchMock(() => ({ json: { value: SECTOR_OPTIONS } }));
  try {
    await listDropdownOptions({ field: "sector", includeObsolete: false });
    const url = mock.calls[0].url;
    assert.equal(url.split("?").length, 2, `URL must have exactly one ?: ${url}`);
    const parsed = new URL(url);
    assert.ok(parsed.pathname.endsWith("/DivisionLimiteds"));
    const filter = parsed.searchParams.get("$filter") ?? "";
    assert.ok(filter.includes("Obsolete eq 0"), `default-active filter missing: ${filter}`);
  } finally {
    mock.restore();
  }
});
