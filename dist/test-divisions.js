#!/usr/bin/env node
/**
 * Unit tests for search_divisions, list_divisions, and get_xtra_fields with
 * mocked global fetch.
 *
 * Run with: npm run test:divisions
 *
 * These tests do NOT hit the real Prospect API.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.PROSPECT_PAT = process.env.PROSPECT_PAT || "test-token-for-mock";
process.env.PROSPECT_BASE_URL =
    process.env.PROSPECT_BASE_URL || "https://api-v1-westeurope.prospect365.com";
process.env.PROSPECT_PROFILE_ID = process.env.PROSPECT_PROFILE_ID || "test-profile-id";
const { searchDivisions, listDivisions } = await import("./tools/lookups.js");
const { getXtraFields } = await import("./tools/profiling.js");
function installFetchMock(handler) {
    const calls = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url, init) => {
        const u = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
        const queryStr = u.includes("?") ? u.slice(u.indexOf("?") + 1) : "";
        const call = {
            url: u,
            method: init?.method ?? "GET",
            query: new URLSearchParams(queryStr),
        };
        calls.push(call);
        const resp = handler(call);
        return new Response(resp.json !== undefined ? JSON.stringify(resp.json) : (resp.text ?? null), {
            status: resp.status ?? 200,
            headers: { "content-type": "application/json" },
        });
    });
    return {
        calls,
        restore: () => {
            globalThis.fetch = originalFetch;
        },
    };
}
function divRow(id, overrides = {}) {
    return {
        DivisionId: id,
        Name: `Division ${id}`,
        SalesLedgerId: `ACC${id}`,
        Relationship: "Customer",
        TerritoryCode: "WGAREA",
        AccountManager: "DL",
        RecordLink: null,
        Address: { AddressLine1: "1 Road", AddressLine2: null, AddressLine3: null, Postcode: "PE10 1AA" },
        DivisionXtra: {
            StandardDropdownField1: "PaperAM",
            StandardDropdownField2: "M.A.T.",
            StandardDropdownField3: "Office1",
            StandardDropdownField4: "PriceListA",
            StandardDropdownField5: "PouchListA",
        },
        Website: null,
        AlternateReference: null,
        MainAddressId: null,
        LastUpdated: "2026-01-01T00:00:00Z",
        ...overrides,
    };
}
// ─── Backward compat ─────────────────────────────────────────────────────────
test("search_divisions: searchTerm-only path still works (backward compat)", async () => {
    const mock = installFetchMock(() => ({
        json: { value: [divRow(1), divRow(2)], "@odata.count": 2 },
    }));
    try {
        const text = await searchDivisions({ searchTerm: "trust", top: 10 });
        assert.equal(mock.calls.length, 1);
        const filter = mock.calls[0].query.get("$filter") ?? "";
        assert.ok(filter.includes("contains(Name,'trust')"), `filter missing name contains: ${filter}`);
        assert.ok(filter.includes("contains(SalesLedgerId,'trust')"), `filter missing salesledger contains: ${filter}`);
        assert.ok(filter.includes("StatusFlag ne 'D'"), `filter missing StatusFlag clause: ${filter}`);
        assert.ok(text.includes("Division 1"));
        assert.ok(text.includes("Division 2"));
    }
    finally {
        mock.restore();
    }
});
// ─── BUG FIX #1 — customerType maps to DivisionXtra/StandardDropdownField2 ───
test("search_divisions: customerType filter targets DivisionXtra/StandardDropdownField2 (NOT Division.CustomerType)", async () => {
    const mock = installFetchMock(() => ({ json: { value: [divRow(1)], "@odata.count": 1 } }));
    try {
        await searchDivisions({
            searchTerm: "trust",
            top: 10,
            filters: { customerType: "M.A.T." },
        });
        const filter = mock.calls[0].query.get("$filter") ?? "";
        assert.ok(filter.includes("DivisionXtra/StandardDropdownField2 eq 'M.A.T.'"), `expected DivisionXtra/StandardDropdownField2 clause, got: ${filter}`);
        // The dead Division.CustomerType field must NOT be queried.
        assert.ok(!/[^/]CustomerType eq/.test(filter), `must not target dead Division.CustomerType field: ${filter}`);
        // $expand must include DivisionXtra so the dropdown can be flattened.
        const expand = mock.calls[0].query.get("$expand") ?? "";
        assert.ok(expand.includes("DivisionXtra"), `expected DivisionXtra $expand: ${expand}`);
        assert.ok(expand.includes("StandardDropdownField2"), `expected DivisionXtra select to include StandardDropdownField2: ${expand}`);
    }
    finally {
        mock.restore();
    }
});
test("list_divisions: customerType filter targets DivisionXtra/StandardDropdownField2", async () => {
    const mock = installFetchMock(() => ({ json: { value: [divRow(1)], "@odata.count": 1 } }));
    try {
        await listDivisions({ filters: { customerType: "M.A.T." }, pageSize: 500 });
        const filter = mock.calls[0].query.get("$filter") ?? "";
        assert.ok(filter.includes("DivisionXtra/StandardDropdownField2 eq 'M.A.T.'"), `expected DivisionXtra clause, got: ${filter}`);
    }
    finally {
        mock.restore();
    }
});
test("list_divisions: customDropdown1..5 each map to DivisionXtra/StandardDropdownField{N}", async () => {
    const mock = installFetchMock(() => ({ json: { value: [], "@odata.count": 0 } }));
    try {
        await listDivisions({
            filters: {
                customDropdown1: "v1",
                customDropdown2: "v2",
                customDropdown3: "v3",
                customDropdown4: "v4",
                customDropdown5: "v5",
            },
            pageSize: 500,
        });
        const filter = mock.calls[0].query.get("$filter") ?? "";
        for (let i = 1; i <= 5; i++) {
            assert.ok(filter.includes(`DivisionXtra/StandardDropdownField${i} eq 'v${i}'`), `slot ${i} missing or wrong: ${filter}`);
        }
    }
    finally {
        mock.restore();
    }
});
// ─── BUG FIX #3 — URL encoding of special characters ─────────────────────────
test("search_divisions: '&' in searchTerm is percent-encoded (not treated as query delimiter)", async () => {
    const mock = installFetchMock(() => ({ json: { value: [divRow(1316)], "@odata.count": 1 } }));
    try {
        await searchDivisions({ searchTerm: "Bath & Wells Multi Academy", top: 10 });
        assert.equal(mock.calls.length, 1);
        const rawUrl = mock.calls[0].url;
        // The raw URL must NOT contain a literal " & " inside the $filter — that
        // would be parsed as a separator. Either it's percent-encoded (%26) or
        // wrapped inside another encoded form.
        const queryStr = rawUrl.slice(rawUrl.indexOf("?") + 1);
        // An unencoded "&" *inside* the filter literal would split the param;
        // detect that by checking whether $filter decodes back to the full term.
        const filter = mock.calls[0].query.get("$filter") ?? "";
        assert.ok(filter.includes("contains(Name,'Bath & Wells Multi Academy')"), `expected '&' to round-trip inside filter literal, got: ${filter}`);
        // And verify the raw query contains a percent-encoded ampersand somewhere
        // (proof the encoder didn't pass it through naked).
        assert.ok(queryStr.includes("%26"), `raw query must contain %26: ${queryStr}`);
    }
    finally {
        mock.restore();
    }
});
test("search_divisions: '+', '?', '#' in searchTerm round-trip correctly through filter", async () => {
    const mock = installFetchMock(() => ({ json: { value: [], "@odata.count": 0 } }));
    try {
        const tricky = "A+B?C#D=E";
        await searchDivisions({ searchTerm: tricky, top: 10 });
        const filter = mock.calls[0].query.get("$filter") ?? "";
        assert.ok(filter.includes(`contains(Name,'${tricky}')`), `expected raw round-trip, got: ${filter}`);
    }
    finally {
        mock.restore();
    }
});
// ─── territory + postcode + escaping (existing coverage) ─────────────────────
test("search_divisions: territoryCode is case-insensitive via tolower()", async () => {
    const mock = installFetchMock(() => ({ json: { value: [], "@odata.count": 0 } }));
    try {
        await searchDivisions({
            searchTerm: "x",
            top: 10,
            filters: { territoryCode: "WGArea" },
        });
        const filter = mock.calls[0].query.get("$filter") ?? "";
        assert.ok(filter.includes("tolower(TerritoryCode) eq 'wgarea'"), `expected lowercase tolower clause, got: ${filter}`);
    }
    finally {
        mock.restore();
    }
});
test("search_divisions: postcode filter uses startswith on Address/Postcode", async () => {
    const mock = installFetchMock(() => ({ json: { value: [], "@odata.count": 0 } }));
    try {
        await searchDivisions({
            searchTerm: "x",
            top: 10,
            filters: { postcode: "PE10" },
        });
        const filter = mock.calls[0].query.get("$filter") ?? "";
        assert.ok(filter.includes("startswith(Address/Postcode, 'PE10')"), `expected startswith on Address/Postcode, got: ${filter}`);
    }
    finally {
        mock.restore();
    }
});
test("search_divisions: escapes single quotes in searchTerm and filter values", async () => {
    const mock = installFetchMock(() => ({ json: { value: [], "@odata.count": 0 } }));
    try {
        await searchDivisions({
            searchTerm: "O'Hara",
            top: 10,
            filters: { customerType: "L'Oreal" },
        });
        const filter = mock.calls[0].query.get("$filter") ?? "";
        assert.ok(filter.includes("contains(Name,'O''Hara')"), `expected escaped name: ${filter}`);
        assert.ok(filter.includes("DivisionXtra/StandardDropdownField2 eq 'L''Oreal'"), `expected escaped customerType (via dropdown2): ${filter}`);
    }
    finally {
        mock.restore();
    }
});
// ─── list_divisions auto-paginates ───────────────────────────────────────────
test("list_divisions: auto-paginates past the 500-row server cap and reports totalCount", async () => {
    const TOTAL = 1335;
    const mock = installFetchMock((call) => {
        const top = parseInt(call.query.get("$top") ?? "500", 10);
        const skip = parseInt(call.query.get("$skip") ?? "0", 10);
        const remaining = Math.max(0, TOTAL - skip);
        const pageLen = Math.min(top, remaining, 500);
        const value = Array.from({ length: pageLen }, (_, i) => divRow(skip + i + 1));
        const body = { value };
        if (skip === 0)
            body["@odata.count"] = TOTAL;
        return { json: body };
    });
    try {
        const json = await listDivisions({ filters: { customerType: "M.A.T." }, pageSize: 500 });
        const parsed = JSON.parse(json);
        assert.equal(parsed.totalCount, TOTAL);
        assert.equal(parsed.returnedCount, TOTAL);
        assert.equal(parsed.truncated, false);
        assert.equal(parsed.records.length, TOTAL);
        assert.equal(mock.calls.length, 3, `expected 3 pages, got ${mock.calls.length}`);
        assert.ok((mock.calls[0].query.get("$count") ?? "") === "true", "first call should include $count=true");
        assert.equal(mock.calls[1].query.get("$count"), null);
        for (const c of mock.calls) {
            const f = c.query.get("$filter") ?? "";
            assert.ok(f.includes("DivisionXtra/StandardDropdownField2 eq 'M.A.T.'"), `customerType filter missing on page: ${f}`);
        }
    }
    finally {
        mock.restore();
    }
});
test("list_divisions: combines customerType (→ dropdown2) and territoryCode filters via AND", async () => {
    const mock = installFetchMock(() => ({
        json: { value: [divRow(1), divRow(2), divRow(3)], "@odata.count": 3 },
    }));
    try {
        const json = await listDivisions({
            filters: { customerType: "M.A.T.", territoryCode: "WGAREA" },
            pageSize: 500,
        });
        const parsed = JSON.parse(json);
        assert.equal(parsed.totalCount, 3);
        assert.equal(parsed.returnedCount, 3);
        const filter = mock.calls[0].query.get("$filter") ?? "";
        assert.ok(filter.includes("DivisionXtra/StandardDropdownField2 eq 'M.A.T.'"), `customerType missing: ${filter}`);
        assert.ok(filter.includes("tolower(TerritoryCode) eq 'wgarea'"), `territoryCode missing or wrong shape: ${filter}`);
        assert.ok(filter.includes("StatusFlag ne 'D'"), `StatusFlag missing: ${filter}`);
    }
    finally {
        mock.restore();
    }
});
test("list_divisions: explicit skip returns a single page without auto-pagination", async () => {
    const mock = installFetchMock((call) => {
        const skip = parseInt(call.query.get("$skip") ?? "0", 10);
        return { json: { value: [divRow(skip + 1), divRow(skip + 2)], "@odata.count": 5000 } };
    });
    try {
        const json = await listDivisions({
            filters: { customerType: "M.A.T." },
            pageSize: 100,
            skip: 200,
        });
        const parsed = JSON.parse(json);
        assert.equal(mock.calls.length, 1, "should be exactly one fetch in skip mode");
        assert.equal(parsed.skip, 200);
        assert.equal(parsed.pageSize, 100);
        assert.equal(parsed.returnedCount, 2);
        assert.equal(parsed.totalCount, 5000);
        assert.equal(parsed.truncated, true);
        assert.equal(parsed.records[0].DivisionId, 201);
        assert.equal(mock.calls[0].query.get("$skip"), "200");
        assert.equal(mock.calls[0].query.get("$top"), "100");
    }
    finally {
        mock.restore();
    }
});
// ─── BUG FIX #1 (output side) — customDropdown1..5 in default fields ─────────
test("list_divisions: default fields include customDropdown1..5 flattened from DivisionXtra", async () => {
    const mock = installFetchMock(() => ({
        json: {
            value: [
                {
                    DivisionId: 1316,
                    Name: "Bath & Wells Multi Academy Trust",
                    Address: { Postcode: "BA1 1AA" },
                    DivisionXtra: {
                        StandardDropdownField1: "PaperAM-Val",
                        StandardDropdownField2: "M.A.T.",
                        StandardDropdownField3: "Office-Val",
                        StandardDropdownField4: "PriceList-Val",
                        StandardDropdownField5: "PouchList-Val",
                    },
                },
            ],
            "@odata.count": 1,
        },
    }));
    try {
        const json = await listDivisions({ filters: { customerType: "M.A.T." }, pageSize: 500 });
        const parsed = JSON.parse(json);
        const r = parsed.records[0];
        assert.equal(r.DivisionId, 1316);
        assert.equal(r.Name, "Bath & Wells Multi Academy Trust");
        assert.equal(r.Postcode, "BA1 1AA");
        assert.equal(r.customDropdown1, "PaperAM-Val");
        assert.equal(r.customDropdown2, "M.A.T.");
        assert.equal(r.customDropdown3, "Office-Val");
        assert.equal(r.customDropdown4, "PriceList-Val");
        assert.equal(r.customDropdown5, "PouchList-Val");
        // CustomerType is not in defaults any more (it was always null on this tenant).
        assert.ok(!("CustomerType" in r), `CustomerType should not be in default output: ${JSON.stringify(r)}`);
        // $select must not contain the synthetic keys.
        const select = mock.calls[0].query.get("$select") ?? "";
        for (const synth of ["Postcode", "customDropdown1", "customDropdown2", "customDropdown3", "customDropdown4", "customDropdown5"]) {
            assert.ok(!select.split(",").includes(synth), `synthetic '${synth}' must not appear in $select: ${select}`);
        }
        // $expand must include both Address and DivisionXtra.
        const expand = mock.calls[0].query.get("$expand") ?? "";
        assert.ok(expand.includes("Address"), `expected Address $expand: ${expand}`);
        assert.ok(expand.includes("DivisionXtra"), `expected DivisionXtra $expand: ${expand}`);
    }
    finally {
        mock.restore();
    }
});
test("list_divisions: ceiling at 5000 sets truncated=true when totalCount exceeds it", async () => {
    const mock = installFetchMock((call) => {
        const top = parseInt(call.query.get("$top") ?? "500", 10);
        const skip = parseInt(call.query.get("$skip") ?? "0", 10);
        const value = Array.from({ length: Math.min(top, 500) }, (_, i) => divRow(skip + i + 1));
        const body = { value };
        if (skip === 0)
            body["@odata.count"] = 8000;
        return { json: body };
    });
    try {
        const json = await listDivisions({ filters: {}, pageSize: 500 });
        const parsed = JSON.parse(json);
        assert.equal(parsed.totalCount, 8000);
        assert.equal(parsed.returnedCount, 5000);
        assert.equal(parsed.truncated, true);
        assert.equal(mock.calls.length, 10);
    }
    finally {
        mock.restore();
    }
});
// ─── BUG FIX #2 — get_xtra_fields drops hardcoded $select ────────────────────
test("get_xtra_fields: does NOT send $select (lets API return whatever fields exist)", async () => {
    const mock = installFetchMock(() => ({
        json: {
            value: [
                {
                    DivisionId: 1316,
                    StandardTextField1: "Trust",
                    StandardDecimalField3: 42.5,
                    StandardFlagField1: true,
                    StandardDropdownField2: "M.A.T.",
                    StandardMemoField1: "Notes about Bath & Wells",
                    StandardDateField1: "2026-01-15T00:00:00Z",
                },
            ],
        },
    }));
    try {
        const out = await getXtraFields({ entityType: "DivisionXtras", parentId: 1316 });
        // No $select means the connector does not request fields that 400 the API.
        assert.equal(mock.calls[0].query.get("$select"), null, `get_xtra_fields must not pin a $select clause that includes nonexistent fields like StandardBooleanField`);
        // The filter still uses the parent-key.
        assert.equal(mock.calls[0].query.get("$filter"), "DivisionId eq 1316");
        // Output formatter must surface Flag, Dropdown, Memo (the shapes that
        // actually exist on DivisionXtra) plus Text/Decimal/Date.
        assert.ok(out.includes("Text 1:"), `expected Text 1 in output: ${out}`);
        assert.ok(out.includes("Decimal 3:"), `expected Decimal 3 in output: ${out}`);
        assert.ok(out.includes("Flag 1:"), `expected Flag 1 in output: ${out}`);
        assert.ok(out.includes("Dropdown 2:"), `expected Dropdown 2 in output: ${out}`);
        assert.ok(out.includes("Memo 1:"), `expected Memo 1 in output: ${out}`);
        assert.ok(out.includes("Date 1:"), `expected Date 1 in output: ${out}`);
        assert.ok(out.includes("M.A.T."), `expected dropdown value in output: ${out}`);
    }
    finally {
        mock.restore();
    }
});
test("get_xtra_fields: returns 'no custom fields set' when row exists but is empty", async () => {
    const mock = installFetchMock(() => ({
        json: { value: [{ DivisionId: 99 }] },
    }));
    try {
        const out = await getXtraFields({ entityType: "DivisionXtras", parentId: 99 });
        assert.ok(out.includes("(no custom fields set)"), `expected empty marker, got: ${out}`);
    }
    finally {
        mock.restore();
    }
});
//# sourceMappingURL=test-divisions.js.map