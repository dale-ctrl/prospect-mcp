#!/usr/bin/env node
/**
 * Unit tests for create_division and update_division — specifically the
 * write path for the user-visible "Customer Type" dropdown, which lives on
 * DivisionXtra.StandardDropdownField2 (NOT the dead Division.CustomerType).
 *
 * Run with: npm run test:division-writes
 */
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.PROSPECT_PAT = process.env.PROSPECT_PAT || "test-token-for-mock";
process.env.PROSPECT_BASE_URL =
    process.env.PROSPECT_BASE_URL || "https://api-v1-westeurope.prospect365.com";
process.env.PROSPECT_PROFILE_ID = process.env.PROSPECT_PROFILE_ID || "test-profile-id";
const { createDivision, updateDivision } = await import("./tools/contacts.js");
const { __resetDropdownCache } = await import("./tools/dropdowns.js");
/**
 * The label→FK translator now hits /DropdownItems on every dropdown write.
 * Tests in this file use synthetic codes ("v1".."v5", "M.A.T.", "Special").
 * This stub returns each as both code (Id) and label (Description), so the
 * resolver's byCode path matches and passes the value through unchanged.
 */
function dropdownItemsStub(call) {
    if (!call.url.includes("/DropdownItems"))
        return null;
    const items = ["v1", "v2", "v3", "v4", "v5", "M.A.T.", "Special"].map((s) => ({
        Id: s,
        Description: s,
        Obsolete: 0,
    }));
    return { json: { value: items } };
}
function installFetchMock(handler) {
    const calls = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url, init) => {
        const u = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
        const rawBody = typeof init?.body === "string" ? init.body : undefined;
        let parsedBody;
        try {
            parsedBody = rawBody ? JSON.parse(rawBody) : undefined;
        }
        catch { /* not JSON */ }
        const call = { url: u, method: init?.method ?? "GET", body: parsedBody };
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
            __resetDropdownCache();
        },
    };
}
/** Wrap a test handler so DropdownItems requests go to the stub automatically. */
function withDropdowns(inner) {
    return (call) => {
        const stub = dropdownItemsStub(call);
        if (stub)
            return stub;
        return inner(call);
    };
}
// ─── update_division ─────────────────────────────────────────────────────────
test("update_division: customerType writes to DivisionXtras (not Divisions.CustomerType)", async () => {
    const mock = installFetchMock(withDropdowns((call) => {
        if (call.url.includes("/DivisionXtras(1231)") && call.method === "PATCH") {
            return { status: 204 };
        }
        return { json: { value: [{ DivisionId: 1231 }] } };
    }));
    try {
        const out = await updateDivision({ divisionId: 1231, customerType: "M.A.T." });
        // No PATCH to /Divisions(1231) — only the Xtra was changed.
        const divisionPatches = mock.calls.filter((c) => c.method === "PATCH" && /\/Divisions\(/.test(c.url));
        assert.equal(divisionPatches.length, 0, `must NOT PATCH Divisions when only customerType supplied: ${JSON.stringify(divisionPatches)}`);
        // Exactly one PATCH to /DivisionXtras(1231) with the dropdown.
        const xtraPatches = mock.calls.filter((c) => c.method === "PATCH" && c.url.includes("/DivisionXtras(1231)"));
        assert.equal(xtraPatches.length, 1, `expected 1 PATCH to DivisionXtras(1231), got ${xtraPatches.length}`);
        const body = xtraPatches[0].body;
        assert.equal(body.StandardDropdownField2, "M.A.T.", `body must set StandardDropdownField2='M.A.T.': ${JSON.stringify(body)}`);
        assert.ok(!("CustomerType" in body), `body must not contain dead CustomerType field: ${JSON.stringify(body)}`);
        assert.ok(out.includes("DivisionXtra.StandardDropdownField2"), `output should mention dropdown change: ${out}`);
    }
    finally {
        mock.restore();
    }
});
test("update_division: customDropdown1..5 each write to StandardDropdownField{N}", async () => {
    const mock = installFetchMock(withDropdowns(() => ({ status: 204 })));
    try {
        await updateDivision({
            divisionId: 1231,
            customDropdown1: "v1",
            customDropdown2: "v2",
            customDropdown3: "v3",
            customDropdown4: "v4",
            customDropdown5: "v5",
        });
        const xtraPatches = mock.calls.filter((c) => c.method === "PATCH" && c.url.includes("/DivisionXtras(1231)"));
        assert.equal(xtraPatches.length, 1);
        const body = xtraPatches[0].body;
        for (let i = 1; i <= 5; i++) {
            assert.equal(body[`StandardDropdownField${i}`], `v${i}`, `slot ${i} wrong: ${JSON.stringify(body)}`);
        }
    }
    finally {
        mock.restore();
    }
});
test("update_division: explicit customDropdown2 wins over customerType alias", async () => {
    const mock = installFetchMock(withDropdowns(() => ({ status: 204 })));
    try {
        await updateDivision({
            divisionId: 1231,
            customerType: "M.A.T.",
            customDropdown2: "Special",
        });
        const xtraPatches = mock.calls.filter((c) => c.url.includes("/DivisionXtras(1231)"));
        const body = xtraPatches[0].body;
        assert.equal(body.StandardDropdownField2, "Special", `customDropdown2 should win: ${JSON.stringify(body)}`);
    }
    finally {
        mock.restore();
    }
});
test("update_division: regular fields and customerType produce two PATCHes (Divisions + DivisionXtras)", async () => {
    const mock = installFetchMock(withDropdowns(() => ({ status: 204 })));
    try {
        await updateDivision({
            divisionId: 1231,
            longDescription: "Aspire Academy Trust",
            customerType: "M.A.T.",
        });
        const divPatch = mock.calls.find((c) => c.method === "PATCH" && c.url.includes("/Divisions(1231)"));
        const xtraPatch = mock.calls.find((c) => c.method === "PATCH" && c.url.includes("/DivisionXtras(1231)"));
        assert.ok(divPatch, "expected PATCH to Divisions(1231) for longDescription");
        assert.ok(xtraPatch, "expected PATCH to DivisionXtras(1231) for customerType");
        const divBody = divPatch.body;
        assert.equal(divBody.LongDescription, "Aspire Academy Trust");
        assert.ok(!("CustomerType" in divBody), `Divisions PATCH must not include CustomerType: ${JSON.stringify(divBody)}`);
        const xtraBody = xtraPatch.body;
        assert.equal(xtraBody.StandardDropdownField2, "M.A.T.");
    }
    finally {
        mock.restore();
    }
});
test("update_division: with no fields at all returns the no-op message", async () => {
    const mock = installFetchMock(withDropdowns(() => ({ status: 204 })));
    try {
        const out = await updateDivision({ divisionId: 1231 });
        assert.ok(out.toLowerCase().includes("no fields"), `expected no-op message, got: ${out}`);
        assert.equal(mock.calls.length, 0, "should make zero HTTP calls");
    }
    finally {
        mock.restore();
    }
});
test("update_division: falls back to POST /DivisionXtras when PATCH returns 404", async () => {
    const mock = installFetchMock(withDropdowns((call) => {
        if (call.method === "PATCH" && call.url.includes("/DivisionXtras(1231)")) {
            return { status: 404, json: { error: { message: "HTTP 404 Not Found" } } };
        }
        if (call.method === "POST" && call.url.endsWith("/DivisionXtras")) {
            return { status: 201, json: { DivisionId: 1231 } };
        }
        return { status: 204 };
    }));
    try {
        await updateDivision({ divisionId: 1231, customerType: "M.A.T." });
        const post = mock.calls.find((c) => c.method === "POST" && c.url.endsWith("/DivisionXtras"));
        assert.ok(post, "expected POST /DivisionXtras as fallback");
        const body = post.body;
        assert.equal(body.DivisionId, 1231);
        assert.equal(body.StandardDropdownField2, "M.A.T.");
    }
    finally {
        mock.restore();
    }
});
// ─── create_division ─────────────────────────────────────────────────────────
test("create_division: customerType triggers a follow-up PATCH to DivisionXtras (NOT in Divisions POST body)", async () => {
    const mock = installFetchMock(withDropdowns((call) => {
        if (call.method === "POST" && call.url.endsWith("/Companies")) {
            return { json: { CompanyId: 9001 } };
        }
        if (call.method === "POST" && call.url.endsWith("/Divisions")) {
            return { json: { DivisionId: 5555, AddressId: 7777, Name: "Test MAT 2026-05-05" } };
        }
        return { status: 204 };
    }));
    try {
        const out = await createDivision({
            name: "Test MAT 2026-05-05",
            customerType: "M.A.T.",
            postcode: "EX1 1AA",
        });
        // The Division POST body must NOT contain CustomerType (which would 400).
        const divPost = mock.calls.find((c) => c.method === "POST" && c.url.endsWith("/Divisions"));
        assert.ok(divPost);
        const divBody = divPost.body;
        assert.ok(!("CustomerType" in divBody), `Division POST body must not contain CustomerType: ${JSON.stringify(divBody)}`);
        assert.ok(!("StandardDropdownField2" in divBody), `Division POST body must not contain StandardDropdownField2: ${JSON.stringify(divBody)}`);
        // After Division created, DivisionXtras(5555) gets PATCHed.
        const xtraPatch = mock.calls.find((c) => c.method === "PATCH" && c.url.includes("/DivisionXtras(5555)"));
        assert.ok(xtraPatch, `expected PATCH to DivisionXtras(5555) after create: ${mock.calls.map((c) => `${c.method} ${c.url}`).join(", ")}`);
        const xtraBody = xtraPatch.body;
        assert.equal(xtraBody.StandardDropdownField2, "M.A.T.");
        // Address PATCH for postcode happens.
        const addrPatch = mock.calls.find((c) => c.method === "PATCH" && c.url.includes("/Addresses(7777)"));
        assert.ok(addrPatch, "expected Address PATCH for postcode");
        assert.ok(out.includes("DivisionId:** 5555"));
    }
    finally {
        mock.restore();
    }
});
test("create_division: skips the DivisionXtras call when no dropdown values are supplied", async () => {
    const mock = installFetchMock(withDropdowns((call) => {
        if (call.method === "POST" && call.url.endsWith("/Companies")) {
            return { json: { CompanyId: 9002 } };
        }
        if (call.method === "POST" && call.url.endsWith("/Divisions")) {
            return { json: { DivisionId: 5556, AddressId: 7778, Name: "Plain Co" } };
        }
        return { status: 204 };
    }));
    try {
        await createDivision({ name: "Plain Co" });
        const xtraCalls = mock.calls.filter((c) => c.url.includes("/DivisionXtras"));
        assert.equal(xtraCalls.length, 0, `should make zero DivisionXtras calls when no dropdowns set: ${JSON.stringify(xtraCalls)}`);
    }
    finally {
        mock.restore();
    }
});
test("create_division: explicitly POSTs a Company first (does not rely on auto-create)", async () => {
    const mock = installFetchMock(withDropdowns((call) => {
        if (call.method === "POST" && call.url.endsWith("/Companies")) {
            return { json: { CompanyId: 9003 } };
        }
        if (call.method === "POST" && call.url.endsWith("/Divisions")) {
            return { json: { DivisionId: 5557, AddressId: 7779 } };
        }
        return { status: 204 };
    }));
    try {
        await createDivision({ name: "Hierarchy Test" });
        const companyPost = mock.calls.find((c) => c.method === "POST" && c.url.endsWith("/Companies"));
        assert.ok(companyPost, "expected explicit POST /Companies");
        const cBody = companyPost.body;
        assert.equal(cBody.Name, "Hierarchy Test");
        assert.equal(cBody.TypeId, "CUS");
        // And the Division POST refers back to the new CompanyId.
        const divPost = mock.calls.find((c) => c.method === "POST" && c.url.endsWith("/Divisions"));
        const dBody = divPost.body;
        assert.equal(dBody.CompanyId, 9003, "Division POST must reference the just-created CompanyId");
    }
    finally {
        mock.restore();
    }
});
//# sourceMappingURL=test-division-writes.js.map