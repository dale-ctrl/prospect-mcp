#!/usr/bin/env node
/**
 * Round-6 unit tests: update_division_versa_maintenance + merge_division_document.
 * All run against a mocked global fetch — same pattern as test-messaging.ts.
 *
 * Run with: npm run test:versa
 */
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.PROSPECT_PAT = process.env.PROSPECT_PAT || "test-token-for-mock";
process.env.PROSPECT_BASE_URL =
    process.env.PROSPECT_BASE_URL || "https://api-v1-westeurope.prospect365.com";
process.env.PROSPECT_PROFILE_ID = process.env.PROSPECT_PROFILE_ID || "test-profile-id";
process.env.PROSPECT_USER_ID = process.env.PROSPECT_USER_ID || "DL";
const { updateDivisionVersaMaintenance, mergeDivisionDocument, formatMaintenanceValue } = await import("./tools/versa-maintenance.js");
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
        return new Response(resp.json !== undefined ? JSON.stringify(resp.json) : null, {
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
// ─── formatMaintenanceValue ─────────────────────────────────────────────────
test("formatMaintenanceValue: number 280 → '280.00' (2dp)", () => {
    assert.equal(formatMaintenanceValue(280), "280.00");
});
test("formatMaintenanceValue: number 280.5 → '280.50' (2dp)", () => {
    assert.equal(formatMaintenanceValue(280.5), "280.50");
});
test("formatMaintenanceValue: number 280.999 → '281.00' (rounds)", () => {
    assert.equal(formatMaintenanceValue(280.999), "281.00");
});
test("formatMaintenanceValue: string passes through unchanged", () => {
    assert.equal(formatMaintenanceValue("£280.00 ex VAT"), "£280.00 ex VAT");
});
test("formatMaintenanceValue: rejects non-finite numbers", () => {
    assert.throws(() => formatMaintenanceValue(Number.NaN), /finite/);
    assert.throws(() => formatMaintenanceValue(Number.POSITIVE_INFINITY), /finite/);
});
// ─── update_division_versa_maintenance — happy path ──────────────────────────
test("update_division_versa_maintenance: PATCHes both StandardTextField5/6 with formatted values", async () => {
    const mock = installFetchMock((call) => {
        if (call.method === "PATCH" && call.url.includes("/DivisionXtras(33579)"))
            return { status: 204 };
        if (call.method === "GET" && call.url.includes("/DivisionXtras")) {
            return {
                json: {
                    value: [
                        {
                            DivisionId: 33579,
                            StandardTextField5: "7x Mobile Tables",
                            StandardTextField6: "280.00",
                        },
                    ],
                },
            };
        }
        return { status: 204 };
    });
    try {
        const out = await updateDivisionVersaMaintenance({
            divisionId: 33579,
            equipmentMaintained: "7x Mobile Tables",
            totalMaintenanceValue: 280,
        });
        const parsed = JSON.parse(out);
        assert.equal(parsed.ok, true);
        const patch = mock.calls.find((c) => c.method === "PATCH" && c.url.includes("/DivisionXtras(33579)"));
        assert.ok(patch, "expected PATCH /DivisionXtras(33579)");
        const body = patch.body;
        assert.equal(body.StandardTextField5, "7x Mobile Tables");
        assert.equal(body.StandardTextField6, "280.00", `numeric 280 must format to '280.00': ${JSON.stringify(body)}`);
        assert.deepEqual(parsed.fieldsUpdated.sort(), ["StandardTextField5", "StandardTextField6"]);
        assert.equal(parsed.row.StandardTextField6, "280.00");
    }
    finally {
        mock.restore();
    }
});
test("update_division_versa_maintenance: only equipmentMaintained → only StandardTextField5 in body", async () => {
    const mock = installFetchMock((call) => {
        if (call.method === "PATCH")
            return { status: 204 };
        return { json: { value: [{ DivisionId: 33579 }] } };
    });
    try {
        await updateDivisionVersaMaintenance({
            divisionId: 33579,
            equipmentMaintained: "9 x Versa Benchmark Tables",
        });
        const patch = mock.calls.find((c) => c.method === "PATCH");
        const body = patch.body;
        assert.equal(body.StandardTextField5, "9 x Versa Benchmark Tables");
        assert.ok(!("StandardTextField6" in body), `StandardTextField6 must not appear when totalMaintenanceValue omitted: ${JSON.stringify(body)}`);
    }
    finally {
        mock.restore();
    }
});
test("update_division_versa_maintenance: string totalMaintenanceValue passes through unchanged", async () => {
    const mock = installFetchMock((call) => {
        if (call.method === "PATCH")
            return { status: 204 };
        return { json: { value: [{ DivisionId: 33579 }] } };
    });
    try {
        await updateDivisionVersaMaintenance({
            divisionId: 33579,
            totalMaintenanceValue: "£280.00 ex VAT",
        });
        const patch = mock.calls.find((c) => c.method === "PATCH");
        const body = patch.body;
        assert.equal(body.StandardTextField6, "£280.00 ex VAT");
    }
    finally {
        mock.restore();
    }
});
test("update_division_versa_maintenance: 404 PATCH → POST /DivisionXtras with DivisionId (upsert path)", async () => {
    const mock = installFetchMock((call) => {
        if (call.method === "PATCH" && call.url.includes("/DivisionXtras(33579)")) {
            return { status: 404, json: { error: { message: "HTTP 404 Not Found" } } };
        }
        if (call.method === "POST" && call.url.endsWith("/DivisionXtras")) {
            return { status: 201, json: { DivisionId: 33579, StandardTextField5: "x", StandardTextField6: "10.00" } };
        }
        if (call.method === "GET" && call.url.includes("/DivisionXtras")) {
            return { json: { value: [{ DivisionId: 33579, StandardTextField5: "x", StandardTextField6: "10.00" }] } };
        }
        return { status: 204 };
    });
    try {
        await updateDivisionVersaMaintenance({
            divisionId: 33579,
            equipmentMaintained: "x",
            totalMaintenanceValue: 10,
        });
        const post = mock.calls.find((c) => c.method === "POST" && c.url.endsWith("/DivisionXtras"));
        assert.ok(post, "expected POST /DivisionXtras as upsert fallback");
        const body = post.body;
        assert.equal(body.DivisionId, 33579, "POST body must include DivisionId for upsert");
        assert.equal(body.StandardTextField5, "x");
        assert.equal(body.StandardTextField6, "10.00");
    }
    finally {
        mock.restore();
    }
});
test("update_division_versa_maintenance: with no fields returns ok:false without HTTP calls", async () => {
    const mock = installFetchMock(() => ({ status: 204 }));
    try {
        const out = await updateDivisionVersaMaintenance({ divisionId: 33579 });
        const parsed = JSON.parse(out);
        assert.equal(parsed.ok, false);
        assert.match(parsed.message ?? "", /No Versa fields supplied/);
        assert.equal(mock.calls.length, 0, "should not hit the API");
    }
    finally {
        mock.restore();
    }
});
// ─── merge_division_document ────────────────────────────────────────────────
const MERGE_RESPONSE_SUBJECT = (subj, body) => ({
    json: {
        "@odata.context": "$metadata#ProspectSoft.OData.Extensibility.Common.MergeResponse",
        value: [
            { Name: "Subject", Value: subj },
            { Name: "Body", Value: body },
        ],
    },
});
const MERGE_RESPONSE_SIG = {
    json: {
        "@odata.context": "$metadata#ProspectSoft.OData.Extensibility.Common.MergeResponse",
        value: [{ Name: "Signature", Value: "<br>-- Dale" }],
    },
};
const MERGE_RESPONSE_NAME = (name) => ({
    json: {
        "@odata.context": "$metadata#ProspectSoft.OData.Extensibility.Common.MergeResponse",
        value: [{ Name: "DocumentName", Value: name }],
    },
});
/**
 * Shared mock for merge_division_document plumbing — covers safety-gate user
 * lookup, email-template subject prefetch, the three Division MergeData
 * calls, Document creation, AttachExistingDocument, and SendMessage. Tests
 * compose this with their own per-test overrides.
 */
function installMergeDivisionMock(opts) {
    const divisionId = opts.divisionId;
    let mergeCallNo = 0;
    return installFetchMock((call) => {
        // Safety-gate API user lookup
        if (call.url.includes("/Users") && call.url.includes("UserCode")) {
            return { json: { value: [{ UserCode: "DL", EmailAddress: "dale@westcountrygroup.com" }] } };
        }
        // Auto-resolve contact lookup (only used when caller omits contactId).
        // URLSearchParams encodes spaces as '+', so match either form.
        if (call.method === "GET" && call.url.includes("/Contacts") && new RegExp(`DivisionId(\\+|%20)eq(\\+|%20)${divisionId}`).test(call.url)) {
            return { json: { value: opts.contactsForAutoResolve ?? [{ ContactId: 66240 }] } };
        }
        // HiddenContactId read (withDivisionMergeContact pre-step)
        if (call.method === "GET" && call.url.includes(`/Divisions(${divisionId})`) && call.url.includes("HiddenContactId")) {
            return { json: { value: [{ DivisionId: divisionId, HiddenContactId: opts.hiddenContactIdInitial ?? null }] } };
        }
        // HiddenContactId set/restore PATCH on Division
        if (call.method === "PATCH" && new RegExp(`/Divisions\\(${divisionId}\\)$`).test(call.url)) {
            return { status: 204 };
        }
        // Email-template subject prefetch
        if (call.url.includes("/DocumentTemplates")) {
            return { json: { value: [{ Subject: "Versa Maintenance Contract — DivisionId {DivisionId}" }] } };
        }
        // 3 MergeData calls bound to Division
        if (call.method === "POST" && new RegExp(`/Divisions\\(${divisionId}\\)/MergeData\\(\\)$`).test(call.url)) {
            mergeCallNo += 1;
            if (mergeCallNo === 1)
                return MERGE_RESPONSE_SUBJECT(`Versa Maintenance Contract — DivisionId ${divisionId}`, "Body content");
            if (mergeCallNo === 2)
                return MERGE_RESPONSE_SIG;
            return MERGE_RESPONSE_NAME(`Division Document ${divisionId}`);
        }
        if (call.method === "POST" && call.url.endsWith("/Documents")) {
            return { json: { DocumentId: opts.documentId ?? 9999, StatusFlag: "D" } };
        }
        if (call.method === "POST" && call.url.endsWith("/DocumentAttachments/AttachExistingDocument")) {
            return { json: { Id: "att-uuid", SuccessFlag: true, Attachments: [{ Name: `Division Document ${divisionId}.pdf`, Size: 12345 }] } };
        }
        if (call.method === "POST" && new RegExp(`/Divisions\\(${divisionId}\\)/SendMessage\\(\\)$`).test(call.url)) {
            return { json: { value: opts.sendMessageReturn ?? 8888 } };
        }
        return { status: 204 };
    });
}
test("merge_division_document: drives /Divisions(id)/MergeData + /Divisions(id)/SendMessage with DivisionId on the Document body", async () => {
    const mock = installMergeDivisionMock({ divisionId: 33579 });
    try {
        const out = await mergeDivisionDocument({
            divisionId: 33579,
            quoteTemplateCode: "23caad",
            contactId: 66240,
            emailTo: "dale@westcountrygroup.com",
        });
        const parsed = JSON.parse(out);
        assert.equal(parsed.ok, true);
        assert.equal(parsed.attachmentDocumentId, 9999);
        assert.equal(parsed.sentMessageDocumentId, 8888);
        assert.equal(parsed.to, "dale@westcountrygroup.com");
        assert.equal(parsed.attachmentFilename, "Division Document 33579.pdf");
        // Critical: Documents POST must use DivisionId, NOT QuoteId.
        const docPost = mock.calls.find((c) => c.method === "POST" && c.url.endsWith("/Documents"));
        assert.ok(docPost, "expected POST /Documents");
        const docBody = docPost.body;
        assert.equal(docBody.DivisionId, 33579, `Document body must use DivisionId not QuoteId: ${JSON.stringify(docBody)}`);
        assert.ok(!("QuoteId" in docBody), "Document body must not include QuoteId for division merges");
        assert.equal(docBody.DocumentTypeCode, "23caad", "PDF template code must be the Versa contract code");
        // MergeData and SendMessage must both be Division-bound, not Quote-bound.
        const mergeCalls = mock.calls.filter((c) => /\/Divisions\(33579\)\/MergeData\(\)$/.test(c.url));
        assert.equal(mergeCalls.length, 3, `expected 3 MergeData calls on Divisions, got ${mergeCalls.length}`);
        const sendCalls = mock.calls.filter((c) => /\/Divisions\(33579\)\/SendMessage\(\)$/.test(c.url));
        assert.equal(sendCalls.length, 1);
        const sendBody = sendCalls[0].body;
        assert.equal(sendBody.ToAddress, "dale@westcountrygroup.com", "ToAddress must be the API-user safety-gate address");
        assert.equal(sendBody.AttachmentId, "att-uuid");
        assert.deepEqual(sendBody.NewDocumentIds, [9999]);
    }
    finally {
        mock.restore();
    }
});
test("merge_division_document: SAFETY GATE — caller-supplied emailTo is logged but overridden", async () => {
    const errLogs = [];
    const origErr = console.error;
    console.error = (msg) => errLogs.push(msg);
    const mock = installMergeDivisionMock({ divisionId: 33579, sendMessageReturn: 42, documentId: 1 });
    try {
        const out = await mergeDivisionDocument({
            divisionId: 33579,
            quoteTemplateCode: "23caad",
            contactId: 66240,
            emailTo: "customer@external.example",
        });
        const parsed = JSON.parse(out);
        assert.equal(parsed.to, "dale@westcountrygroup.com", "must override caller-supplied recipient");
        assert.match(parsed.safetyBanner, /caller-supplied emailTo was ignored/);
        // The console.error log proves the override was visible to operators.
        assert.ok(errLogs.some((l) => /recipient overridden/.test(l) && /customer@external\.example/.test(l)), `expected override log, got: ${errLogs.join(" | ")}`);
        // SendMessage body must address the API user, not the caller's email.
        const sendCall = mock.calls.find((c) => /\/SendMessage\(\)$/.test(c.url));
        const sendBody = sendCall.body;
        assert.equal(sendBody.ToAddress, "dale@westcountrygroup.com");
        assert.notEqual(sendBody.ToAddress, "customer@external.example");
    }
    finally {
        console.error = origErr;
        mock.restore();
    }
});
test("merge_division_document: rejects when SendMessage returns value:0 (helps catch wrong-host config)", async () => {
    const mock = installMergeDivisionMock({ divisionId: 33579, sendMessageReturn: 0, documentId: 1 });
    try {
        await assert.rejects(() => mergeDivisionDocument({ divisionId: 33579, quoteTemplateCode: "23caad", contactId: 66240 }), /SendMessage returned value:0/);
    }
    finally {
        mock.restore();
    }
});
// ─── get_division_details enrichment ─────────────────────────────────────────
test("get_division_details: surfaces Versa Maintenance fields when StandardTextField5/6 populated", async () => {
    const { getDivisionDetails } = await import("./tools/extended.js");
    const mock = installFetchMock((call) => {
        if (call.url.includes("/Divisions(30479)")) {
            return {
                json: {
                    value: [
                        {
                            DivisionId: 30479,
                            Name: "Wimbledon Park Primary School",
                            SalesLedgerId: "WIM001",
                            TerritoryCode: "WGAREA",
                            Address: { AddressId: 5, Postcode: "SW19" },
                            AccountManagerUser: { UserCode: "AR", UserName: "Adam Rowley" },
                            DivisionXtra: {
                                DivisionId: 30479,
                                StandardTextField5: "9 x Versa Benchmark Tables",
                                StandardTextField6: "378.00",
                            },
                        },
                    ],
                },
            };
        }
        if (call.url.includes("/Contacts"))
            return { json: { value: [] } };
        return { json: { value: [] } };
    });
    try {
        const out = await getDivisionDetails({ divisionId: 30479 });
        assert.match(out, /## Versa Maintenance/);
        assert.match(out, /Equipment Maintained.*9 x Versa Benchmark Tables/);
        assert.match(out, /Total Maintenance Value.*378\.00/);
    }
    finally {
        mock.restore();
    }
});
test("get_division_details: omits Versa Maintenance section when fields are empty", async () => {
    const { getDivisionDetails } = await import("./tools/extended.js");
    const mock = installFetchMock((call) => {
        if (call.url.includes("/Divisions(2069)")) {
            return {
                json: {
                    value: [
                        {
                            DivisionId: 2069,
                            Name: "Crofty Education Trust",
                            DivisionXtra: { DivisionId: 2069, StandardTextField1: "other-data" },
                        },
                    ],
                },
            };
        }
        if (call.url.includes("/Contacts"))
            return { json: { value: [] } };
        return { json: { value: [] } };
    });
    try {
        const out = await getDivisionDetails({ divisionId: 2069 });
        assert.ok(!/## Versa Maintenance/.test(out), `Versa section should be omitted when empty: ${out}`);
    }
    finally {
        mock.restore();
    }
});
// ─── Round-7 fixes ───────────────────────────────────────────────────────────
// Issue 1: live regression — numeric strings must format to 2dp.
test("formatMaintenanceValue: numeric STRING '280' → '280.00' (live regression repro)", () => {
    assert.equal(formatMaintenanceValue("280"), "280.00");
});
test("formatMaintenanceValue: numeric string '280.5' → '280.50'", () => {
    assert.equal(formatMaintenanceValue("280.5"), "280.50");
});
test("formatMaintenanceValue: numeric string with leading whitespace '  280 ' → '280.00'", () => {
    assert.equal(formatMaintenanceValue("  280 "), "280.00");
});
test("formatMaintenanceValue: rich format strings still pass through unchanged", () => {
    assert.equal(formatMaintenanceValue("£280.00 ex VAT"), "£280.00 ex VAT");
    assert.equal(formatMaintenanceValue("$1,200.00"), "$1,200.00");
    assert.equal(formatMaintenanceValue("280 plus VAT"), "280 plus VAT");
});
test("update_division_versa_maintenance: numeric string '280' arriving via JSON-RPC formats to '280.00' on the wire", async () => {
    const mock = installFetchMock((call) => {
        if (call.method === "PATCH")
            return { status: 204 };
        return { json: { value: [{ DivisionId: 33579, StandardTextField6: "280.00" }] } };
    });
    try {
        // Bypass the zod schema's union narrowing so we exercise the code path that
        // actually tripped on Westcountry's live tenant in round 6 (where the model
        // emitted "280" as a string and zod accepted it via the string branch).
        await updateDivisionVersaMaintenance({
            divisionId: 33579,
            totalMaintenanceValue: "280",
        });
        const patch = mock.calls.find((c) => c.method === "PATCH");
        const body = patch.body;
        assert.equal(body.StandardTextField6, "280.00", `live regression: '280' (string) must format to '280.00': ${JSON.stringify(body)}`);
    }
    finally {
        mock.restore();
    }
});
// Issue 2: Division.HiddenContactId set/restore + auto-resolve.
test("merge_division_document: with explicit contactId, PATCHes Division.HiddenContactId before merge and restores after", async () => {
    const mock = installMergeDivisionMock({ divisionId: 33579, hiddenContactIdInitial: null });
    try {
        await mergeDivisionDocument({
            divisionId: 33579,
            quoteTemplateCode: "23caad",
            contactId: 66240,
        });
        // Two PATCHes against /Divisions(33579): one set, one restore.
        const divisionPatches = mock.calls.filter((c) => c.method === "PATCH" && /\/Divisions\(33579\)$/.test(c.url));
        assert.equal(divisionPatches.length, 2, `expected 2 Division PATCHes (set+restore), got ${divisionPatches.length}: ${JSON.stringify(divisionPatches.map((p) => p.body))}`);
        const setBody = divisionPatches[0].body;
        assert.equal(setBody.HiddenContactId, 66240, `first PATCH must set HiddenContactId: ${JSON.stringify(setBody)}`);
        const restoreBody = divisionPatches[1].body;
        assert.equal(restoreBody.HiddenContactId, null, `second PATCH must restore HiddenContactId to original (null): ${JSON.stringify(restoreBody)}`);
        // The set PATCH must happen BEFORE the first MergeData call.
        const setIdx = mock.calls.indexOf(divisionPatches[0]);
        const firstMergeIdx = mock.calls.findIndex((c) => /\/MergeData\(\)$/.test(c.url));
        assert.ok(firstMergeIdx > setIdx, "HiddenContactId PATCH must precede the first MergeData call");
        // The restore PATCH must happen AFTER SendMessage.
        const restoreIdx = mock.calls.indexOf(divisionPatches[1]);
        const sendIdx = mock.calls.findIndex((c) => /\/SendMessage\(\)$/.test(c.url));
        assert.ok(restoreIdx > sendIdx, "HiddenContactId restore must happen after SendMessage");
    }
    finally {
        mock.restore();
    }
});
test("merge_division_document: restores the ORIGINAL HiddenContactId, not null, when one was already set", async () => {
    const mock = installMergeDivisionMock({ divisionId: 33579, hiddenContactIdInitial: 11111 });
    try {
        await mergeDivisionDocument({ divisionId: 33579, quoteTemplateCode: "23caad", contactId: 66240 });
        const divisionPatches = mock.calls.filter((c) => c.method === "PATCH" && /\/Divisions\(33579\)$/.test(c.url));
        assert.equal(divisionPatches.length, 2);
        assert.equal(divisionPatches[1].body.HiddenContactId, 11111, "must restore the pre-existing HiddenContactId, not null");
    }
    finally {
        mock.restore();
    }
});
test("merge_division_document: restores HiddenContactId even if MergeData throws", async () => {
    let mergeCalls = 0;
    const mock = installFetchMock((call) => {
        if (call.url.includes("/Users") && call.url.includes("UserCode")) {
            return { json: { value: [{ UserCode: "DL", EmailAddress: "dale@westcountrygroup.com" }] } };
        }
        if (call.method === "GET" && call.url.includes("/Divisions(33579)") && call.url.includes("HiddenContactId")) {
            return { json: { value: [{ DivisionId: 33579, HiddenContactId: null }] } };
        }
        if (call.method === "PATCH" && /\/Divisions\(33579\)$/.test(call.url))
            return { status: 204 };
        if (call.url.includes("/DocumentTemplates"))
            return { json: { value: [{ Subject: "X" }] } };
        if (call.method === "POST" && /\/MergeData\(\)$/.test(call.url)) {
            mergeCalls += 1;
            // Throw on first MergeData call, simulating ContactNotSet from a misconfigured tenant.
            return { status: 500, json: { error: { message: "ContactNotSet" } } };
        }
        return { status: 204 };
    });
    try {
        await assert.rejects(() => mergeDivisionDocument({ divisionId: 33579, quoteTemplateCode: "23caad", contactId: 66240 }), /ContactNotSet|HTTP 500/);
        // Even though merge failed, the restore must have fired.
        const divisionPatches = mock.calls.filter((c) => c.method === "PATCH" && /\/Divisions\(33579\)$/.test(c.url));
        assert.equal(divisionPatches.length, 2, "expected 2 Division PATCHes (set + restore-in-finally)");
        assert.equal(divisionPatches[1].body.HiddenContactId, null, "restore must fire even on failure");
        // We tried at least one MergeData (the one that threw).
        assert.ok(mergeCalls >= 1);
    }
    finally {
        mock.restore();
    }
});
test("merge_division_document: omitted contactId auto-resolves when Division has exactly 1 active contact", async () => {
    const mock = installMergeDivisionMock({
        divisionId: 33579,
        contactsForAutoResolve: [{ ContactId: 99999, Forename: "Solo", Surname: "Contact" }],
    });
    try {
        const out = await mergeDivisionDocument({ divisionId: 33579, quoteTemplateCode: "23caad" });
        const parsed = JSON.parse(out);
        assert.equal(parsed.contactId, 99999);
        assert.equal(parsed.contactIdResolvedFrom, "single-active-contact-on-division");
        // The auto-resolved id must drive the HiddenContactId PATCH.
        const setPatch = mock.calls.find((c) => c.method === "PATCH" && /\/Divisions\(33579\)$/.test(c.url));
        assert.equal(setPatch.body.HiddenContactId, 99999);
    }
    finally {
        mock.restore();
    }
});
test("merge_division_document: omitted contactId errors clearly when Division has 0 active contacts", async () => {
    const mock = installFetchMock((call) => {
        if (call.url.includes("/Users") && call.url.includes("UserCode")) {
            return { json: { value: [{ UserCode: "DL", EmailAddress: "dale@westcountrygroup.com" }] } };
        }
        if (call.method === "GET" && call.url.includes("/Contacts")) {
            return { json: { value: [] } };
        }
        return { status: 204 };
    });
    try {
        await assert.rejects(() => mergeDivisionDocument({ divisionId: 33579, quoteTemplateCode: "23caad" }), /no active contacts.*Pass contactId explicitly/);
        // Must NOT have touched HiddenContactId — fail-fast.
        const divisionPatches = mock.calls.filter((c) => c.method === "PATCH" && /\/Divisions\(33579\)$/.test(c.url));
        assert.equal(divisionPatches.length, 0, "must not touch Division state when contact resolution fails");
    }
    finally {
        mock.restore();
    }
});
test("merge_division_document: omitted contactId errors clearly when Division has multiple active contacts", async () => {
    const mock = installFetchMock((call) => {
        if (call.url.includes("/Users") && call.url.includes("UserCode")) {
            return { json: { value: [{ UserCode: "DL", EmailAddress: "dale@westcountrygroup.com" }] } };
        }
        if (call.method === "GET" && call.url.includes("/Contacts")) {
            return {
                json: {
                    value: [
                        { ContactId: 11111, Forename: "Anna", Surname: "Adams" },
                        { ContactId: 22222, Forename: "Ben", Surname: "Bates" },
                    ],
                },
            };
        }
        return { status: 204 };
    });
    try {
        await assert.rejects(() => mergeDivisionDocument({ divisionId: 33579, quoteTemplateCode: "23caad" }), /multiple active contacts.*11111.*22222/s);
    }
    finally {
        mock.restore();
    }
});
//# sourceMappingURL=test-versa.js.map