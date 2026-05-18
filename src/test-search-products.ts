#!/usr/bin/env node

/**
 * Unit tests for the extended search_products filter construction
 * (multi-field OR, case-insensitive, optional searchFields scoping).
 *
 * Run with: npm run test:search-products
 */

import { test } from "node:test";
import assert from "node:assert/strict";

process.env.PROSPECT_PAT = process.env.PROSPECT_PAT || "test-token-for-mock";
process.env.PROSPECT_BASE_URL =
  process.env.PROSPECT_BASE_URL || "https://api-v1-westeurope.prospect365.com";
process.env.PROSPECT_PROFILE_ID = process.env.PROSPECT_PROFILE_ID || "test-profile-id";

const { buildProductSearchFilter, PRODUCT_SEARCH_FIELDS, searchProducts } =
  await import("./tools/lookups.js");

interface MockCall {
  url: string;
  method: string;
  query: URLSearchParams;
}

function installFetchMock(handler: (call: MockCall) => { status?: number; json?: unknown }) {
  const calls: MockCall[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    const queryStr = u.includes("?") ? u.slice(u.indexOf("?") + 1) : "";
    const call: MockCall = {
      url: u,
      method: init?.method ?? "GET",
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
    restore: () => { globalThis.fetch = originalFetch; },
  };
}

// ─── Filter construction ──────────────────────────────────────────────────

test("buildProductSearchFilter: default fields OR all 10 columns with case-insensitive contains", () => {
  const filter = buildProductSearchFilter({ searchTerm: "DBD-140-80-N", top: 10 });
  // Lower-cased term embedded — tolower on both sides for case-insensitive match.
  for (const field of PRODUCT_SEARCH_FIELDS) {
    assert.match(filter, new RegExp(`contains\\(tolower\\(${field}\\),'dbd-140-80-n'\\)`));
  }
  assert.match(filter, /Obsolete ne 1/);
});

test("buildProductSearchFilter: respects searchFields subset", () => {
  const filter = buildProductSearchFilter({
    searchTerm: "DNA140",
    searchFields: ["ManufacturerReference"],
    top: 10,
  });
  assert.match(filter, /contains\(tolower\(ManufacturerReference\),'dna140'\)/);
  // Other fields should NOT appear.
  assert.doesNotMatch(filter, /contains\(tolower\(Description\)/);
  assert.doesNotMatch(filter, /contains\(tolower\(ProductItemId\)/);
});

test("buildProductSearchFilter: lower-cases the term but escapes single quotes", () => {
  const filter = buildProductSearchFilter({ searchTerm: "O'Connell's", top: 10 });
  // OData escapes single quotes by doubling. Lowercase first then escape.
  assert.match(filter, /'o''connell''s'/);
});

test("buildProductSearchFilter: appends sales-nominal range when supplied", () => {
  const filter = buildProductSearchFilter({
    searchTerm: "paper",
    salesAnalysisMin: 1000,
    salesAnalysisMax: 1195,
    top: 10,
  });
  assert.match(filter, /SalesAnalysis ge '10-1-1000-000'/);
  assert.match(filter, /SalesAnalysis le '10-1-1195-999'/);
});

// ─── End-to-end via mocked fetch ──────────────────────────────────────────

test("search_products: lights up Mfr Ref and Manufacturer in row output when present", async () => {
  const mock = installFetchMock((call) => {
    if (call.url.includes("/Info()")) return { json: { ProfileId: "p" } };
    if (call.url.includes("/ProductItems")) {
      return {
        json: {
          value: [
            {
              ProductItemId: "NC27062401",
              Description: "Nova Bench Desk 1400x800",
              DecimalSellingPrice: 199,
              DecimalCostPrice: 110,
              DecimalQuantityAvailable: 0,
              CategoryId: "DESKS",
              UnitDescription: "EACH",
              SalesAnalysis: "10-1-1500-000",
              Manufacturer: "Arrow Group Global Ltd.",
              ManufacturerReference: "DNA140",
              AlternateReference1: "DBD-140-80-N",
              Barcode: null,
            },
          ],
        },
      };
    }
    return { json: { value: [] } };
  });
  try {
    const out = await searchProducts({ searchTerm: "DNA140", top: 10 });
    assert.match(out, /\*\*NC27062401\*\* — Nova Bench Desk 1400x800/);
    assert.match(out, /Manufacturer: Arrow Group Global Ltd\./);
    assert.match(out, /Mfr Ref: DNA140/);
    assert.match(out, /Alt1: DBD-140-80-N/);
    // No Barcode line when barcode is null and no other mfr bits omit it
    // (Barcode lives on the same mfrBits line as Manufacturer; null skips).
    assert.doesNotMatch(out, /Barcode: null/);

    const productsCall = mock.calls.find((c) => c.url.includes("/ProductItems"));
    assert.ok(productsCall, "should call /ProductItems");
    const filter = productsCall!.query.get("$filter") ?? "";
    // All 10 default search fields must appear in the OR.
    for (const field of PRODUCT_SEARCH_FIELDS) {
      assert.ok(filter.includes(`contains(tolower(${field}),'dna140')`),
        `filter must include ${field}: ${filter}`);
    }
    // $select must include the new fields so the renderer has data to show.
    const select = productsCall!.query.get("$select") ?? "";
    assert.match(select, /Manufacturer,ManufacturerReference/);
    assert.match(select, /AlternateReference1,AlternateReference2,AlternateReference3,AlternateReference4/);
    assert.match(select, /Barcode/);
  } finally {
    mock.restore();
  }
});

test("search_products: omits supplier line entirely when product has no mfr/refs/barcode", async () => {
  const mock = installFetchMock((call) => {
    if (call.url.includes("/Info()")) return { json: { ProfileId: "p" } };
    if (call.url.includes("/ProductItems")) {
      return {
        json: {
          value: [
            {
              ProductItemId: "XX1",
              Description: "Plain item",
              DecimalSellingPrice: 1,
              DecimalCostPrice: 0.5,
              DecimalQuantityAvailable: 100,
              CategoryId: "X",
              UnitDescription: "EACH",
              SalesAnalysis: null,
              Manufacturer: null,
              ManufacturerReference: null,
              Barcode: null,
              AlternateReference1: null,
              AlternateReference2: null,
              AlternateReference3: null,
              AlternateReference4: null,
            },
          ],
        },
      };
    }
    return { json: { value: [] } };
  });
  try {
    const out = await searchProducts({ searchTerm: "XX1", top: 10 });
    assert.match(out, /\*\*XX1\*\* — Plain item/);
    assert.doesNotMatch(out, /Manufacturer:/);
    assert.doesNotMatch(out, /Mfr Ref:/);
    assert.doesNotMatch(out, /Alt[1-4]:/);
  } finally {
    mock.restore();
  }
});

test("search_products: searchFields scoping reaches the OData filter unchanged", async () => {
  const mock = installFetchMock((call) => {
    if (call.url.includes("/Info()")) return { json: { ProfileId: "p" } };
    if (call.url.includes("/ProductItems")) return { json: { value: [] } };
    return { json: { value: [] } };
  });
  try {
    await searchProducts({
      searchTerm: "DBD-140-80-N",
      searchFields: ["ManufacturerReference"],
      top: 10,
    });
    const filter = mock.calls.find((c) => c.url.includes("/ProductItems"))!.query.get("$filter") ?? "";
    assert.match(filter, /contains\(tolower\(ManufacturerReference\),'dbd-140-80-n'\)/);
    assert.doesNotMatch(filter, /contains\(tolower\(Description\)/);
  } finally {
    mock.restore();
  }
});
