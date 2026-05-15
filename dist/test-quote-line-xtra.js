#!/usr/bin/env node
/**
 * Unit tests for QuoteLineXtra read + write tooling:
 *   - get_xtra_fields(entityType="QuoteLineXtras") lists slots even when no values stored
 *   - update_quote_line_xtra accepts label, identifier, AND raw column name
 *   - update_quote_line_xtra works even when EntityFields returns nothing (hardcoded fallback)
 *   - update_quote_line_xtra upserts via PATCH-then-POST when row missing
 *   - update_quote_line_xtra never touches /QuoteLines (price-recalc guard)
 *
 * Run with: npm run test:quote-line-xtra
 */
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.PROSPECT_PAT = process.env.PROSPECT_PAT || "test-token-for-mock";
process.env.PROSPECT_BASE_URL =
    process.env.PROSPECT_BASE_URL || "https://api-v1-westeurope.prospect365.com";
process.env.PROSPECT_PROFILE_ID = process.env.PROSPECT_PROFILE_ID || "test-profile-id";
const { getXtraFields } = await import("./tools/profiling.js");
const { updateQuoteLineXtra } = await import("./tools/quote-lines.js");
const { __resetXtraLabelCache, resolveXtraFieldsToBody } = await import("./lib/xtra-labels.js");
function installFetchMock(handler) {
    const calls = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url, init) => {
        const u = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
        const queryStr = u.includes("?") ? u.slice(u.indexOf("?") + 1) : "";
        const rawBody = typeof init?.body === "string" ? init.body : undefined;
        let parsedBody;
        try {
            parsedBody = rawBody ? JSON.parse(rawBody) : undefined;
        }
        catch {
            /* not JSON */
        }
        const call = {
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
    });
    return {
        calls,
        restore: () => {
            globalThis.fetch = originalFetch;
            __resetXtraLabelCache();
        },
    };
}
/**
 * Realistic EntityFields response for QuoteLineXtra: FieldName IS the OData
 * identifier on this tenant (no separate friendly label column). This shape
 * is what the live live tenant returned, NOT what v1.9-pre assumed.
 */
const QUOTE_LINE_XTRA_ENTITY_FIELDS = {
    json: {
        value: [
            { EntityId: "QuoteLineXtra", FieldName: "StandardTextField3", ColumnName: "x_365_custom_text_3" },
            { EntityId: "QuoteLineXtra", FieldName: "StandardMemoField3", ColumnName: "x_365_custom_memo_3" },
            { EntityId: "QuoteLineXtra", FieldName: "StandardDecimalField1", ColumnName: "x_365_custom_decimal_1" },
            // Junk row that should be filtered out — non-Standard property name.
            { EntityId: "QuoteLineXtra", FieldName: "QuoteLineId", ColumnName: "lineid" },
        ],
    },
};
// ─── Pure resolver tests ──────────────────────────────────────────────────
test("resolveXtraFieldsToBody: accepts identifier", () => {
    const slots = [{ identifier: "StandardMemoField3", columnName: "x_365_custom_memo_3" }];
    const body = resolveXtraFieldsToBody(slots, { StandardMemoField3: "Red" });
    assert.deepEqual(body, { StandardMemoField3: "Red" });
});
test("resolveXtraFieldsToBody: accepts raw column name and translates to identifier", () => {
    const slots = [{ identifier: "StandardMemoField3", columnName: "x_365_custom_memo_3" }];
    const body = resolveXtraFieldsToBody(slots, { x_365_custom_memo_3: "Red" });
    assert.deepEqual(body, { StandardMemoField3: "Red" });
});
test("resolveXtraFieldsToBody: accepts friendly label when slot carries one", () => {
    const slots = [
        { identifier: "StandardMemoField3", columnName: "x_365_custom_memo_3", fieldLabel: "Colour (Extended)" },
    ];
    const body = resolveXtraFieldsToBody(slots, { "Colour (Extended)": "Beech tops, black frame" });
    assert.deepEqual(body, { StandardMemoField3: "Beech tops, black frame" });
});
test("resolveXtraFieldsToBody: friendly label match is case-insensitive", () => {
    const slots = [
        { identifier: "StandardMemoField3", columnName: "x_365_custom_memo_3", fieldLabel: "Colour (Extended)" },
    ];
    const body = resolveXtraFieldsToBody(slots, { "colour (extended)": "Red" });
    assert.deepEqual(body, { StandardMemoField3: "Red" });
});
test("resolveXtraFieldsToBody: hardcoded slot identifier accepted even when slot list empty", () => {
    const body = resolveXtraFieldsToBody([], { StandardMemoField3: "Red" });
    assert.deepEqual(body, { StandardMemoField3: "Red" });
});
test("resolveXtraFieldsToBody: hardcoded raw column accepted even when slot list empty", () => {
    const body = resolveXtraFieldsToBody([], { x_365_custom_memo_3: "Red" });
    assert.deepEqual(body, { StandardMemoField3: "Red" });
});
test("resolveXtraFieldsToBody: rejects garbage key with helpful list of valid options", () => {
    const slots = [
        { identifier: "StandardMemoField3", columnName: "x_365_custom_memo_3", fieldLabel: "Colour (Extended)" },
    ];
    assert.throws(() => resolveXtraFieldsToBody(slots, { Bogus: "x" }), /Unknown Xtra field.*Bogus.*Colour \(Extended\).*StandardMemoField3/s);
});
test("resolveXtraFieldsToBody: rejects garbage key with structural-fallback hint when slot list empty", () => {
    assert.throws(() => resolveXtraFieldsToBody([], { Bogus: "x" }), /Unknown Xtra field.*Bogus.*StandardTextField3.*x_365_custom_text_3/s);
});
test("resolveXtraFieldsToBody: passes null through to clear a slot", () => {
    const body = resolveXtraFieldsToBody([], { StandardTextField1: null });
    assert.deepEqual(body, { StandardTextField1: null });
});
// ─── get_xtra_fields(entityType="QuoteLineXtras") ─────────────────────────
test("get_xtra_fields(QuoteLineXtras) merges friendly labels from Translations table", async () => {
    // Round-3 fix: Translations carries the UI labels keyed by
    // `Entity.{EntityName}.{FieldName}:{Locale}`. The slot map should surface
    // them, and the writer should accept them as input.
    const mock = installFetchMock((call) => {
        if (call.url.includes("/Info()"))
            return { json: { ProfileId: "p" } };
        if (call.url.includes("/EntityFields"))
            return QUOTE_LINE_XTRA_ENTITY_FIELDS;
        if (call.url.includes("/Translations")) {
            return {
                json: {
                    value: [
                        { RowIdentity: "Entity.QuoteLineXtra.StandardMemoField3:en-GB", Value: "Colour (Extended)" },
                        { RowIdentity: "Entity.QuoteLineXtra.StandardTextField3:en-GB", Value: "Supplier" },
                        // Junk row that should NOT match — wrong locale slipped in by the server.
                        { RowIdentity: "Entity.QuoteLineXtra.StandardMemoField3:de-DE", Value: "Farbe" },
                    ],
                },
            };
        }
        if (call.url.includes("/QuoteLineXtras")) {
            return {
                json: {
                    value: [
                        { QuoteLineId: 59185, StandardMemoField3: "Beech tops, black frame" },
                    ],
                },
            };
        }
        return { json: { value: [] } };
    });
    try {
        const out = await getXtraFields({ entityType: "QuoteLineXtras", parentId: 59185 });
        // Slot map shows the friendly label inline.
        assert.match(out, /StandardMemoField3.*Colour \(Extended\)/);
        assert.match(out, /StandardTextField3.*Supplier/);
        // Stored value section also picks up the friendly label.
        assert.match(out, /Memo 3.*Colour \(Extended\).*Beech tops, black frame/);
        // Translations call must filter to en-GB and only Standard slot fields.
        const trCall = mock.calls.find((c) => c.url.includes("/Translations"));
        assert.ok(trCall, "should query /Translations");
        const filter = trCall.query.get("$filter") ?? "";
        assert.match(filter, /startswith\(RowIdentity,'Entity\.QuoteLineXtra\.Standard'\)/);
        assert.match(filter, /Locale eq 'en-GB'/);
    }
    finally {
        mock.restore();
    }
});
test("update_quote_line_xtra: friendly label form (e.g. 'Colour (Extended)') resolves to identifier", async () => {
    // The user-visible win — pass the same string they see in the UI and have
    // it land on the right OData property.
    const mock = installFetchMock((call) => {
        if (call.url.includes("/Info()"))
            return { json: { ProfileId: "p" } };
        if (call.url.includes("/EntityFields"))
            return QUOTE_LINE_XTRA_ENTITY_FIELDS;
        if (call.url.includes("/Translations")) {
            return {
                json: {
                    value: [
                        { RowIdentity: "Entity.QuoteLineXtra.StandardMemoField3:en-GB", Value: "Colour (Extended)" },
                    ],
                },
            };
        }
        if (call.url.includes("/QuoteLineXtras(59185)") && call.method === "PATCH")
            return { status: 204 };
        if (call.url.includes("/QuoteLineXtras") && call.method === "GET") {
            return { json: { value: [{ QuoteLineId: 59185 }] } };
        }
        return { json: { value: [] } };
    });
    try {
        await updateQuoteLineXtra({
            lineId: 59185,
            fields: { "Colour (Extended)": "Beech tops, black frame" },
        });
        const patch = mock.calls.find((c) => c.method === "PATCH" && c.url.includes("/QuoteLineXtras(59185)"));
        assert.ok(patch, "expected PATCH /QuoteLineXtras(59185)");
        assert.deepEqual(patch.body, { StandardMemoField3: "Beech tops, black frame" });
    }
    finally {
        mock.restore();
    }
});
test("get_xtra_fields(QuoteLineXtras) lists configured slots even when no values are stored", async () => {
    const mock = installFetchMock((call) => {
        if (call.url.includes("/Info()"))
            return { json: { ProfileId: "p" } };
        if (call.url.includes("/EntityFields"))
            return QUOTE_LINE_XTRA_ENTITY_FIELDS;
        if (call.url.includes("/QuoteLineXtras")) {
            return {
                json: {
                    value: [
                        // Row exists but every slot is null — used to render "(no custom fields set)".
                        { QuoteLineId: 59185, StandardTextField3: null, StandardMemoField3: null },
                    ],
                },
            };
        }
        return { json: { value: [] } };
    });
    try {
        const out = await getXtraFields({ entityType: "QuoteLineXtras", parentId: 59185 });
        // Must distinguish slot configuration from value storage now.
        assert.match(out, /## Configured slots \(3\)/);
        assert.match(out, /StandardMemoField3.*x_365_custom_memo_3/);
        assert.match(out, /## Stored values/);
        assert.match(out, /no values stored/);
    }
    finally {
        mock.restore();
    }
});
test("get_xtra_fields(QuoteLineXtras) shows stored values when slots are populated", async () => {
    const mock = installFetchMock((call) => {
        if (call.url.includes("/Info()"))
            return { json: { ProfileId: "p" } };
        if (call.url.includes("/EntityFields"))
            return QUOTE_LINE_XTRA_ENTITY_FIELDS;
        if (call.url.includes("/QuoteLineXtras")) {
            return {
                json: {
                    value: [
                        {
                            QuoteLineId: 59185,
                            StandardMemoField3: "Beech tops, black frame",
                            StandardDecimalField1: 6,
                        },
                    ],
                },
            };
        }
        return { json: { value: [] } };
    });
    try {
        const out = await getXtraFields({ entityType: "QuoteLineXtras", parentId: 59185 });
        assert.match(out, /Memo 3.*Beech tops, black frame/);
        assert.match(out, /Decimal 1.*6/);
    }
    finally {
        mock.restore();
    }
});
test("get_xtra_fields(QuoteLineXtras) handles 'no Xtra row exists yet' separately from 'no slots'", async () => {
    const mock = installFetchMock((call) => {
        if (call.url.includes("/Info()"))
            return { json: { ProfileId: "p" } };
        if (call.url.includes("/EntityFields"))
            return QUOTE_LINE_XTRA_ENTITY_FIELDS;
        if (call.url.includes("/QuoteLineXtras"))
            return { json: { value: [] } };
        return { json: { value: [] } };
    });
    try {
        const out = await getXtraFields({ entityType: "QuoteLineXtras", parentId: 99999 });
        assert.match(out, /## Configured slots \(3\)/);
        assert.match(out, /no Xtra row exists yet for QuoteLineId=99999/);
    }
    finally {
        mock.restore();
    }
});
// ─── update_quote_line_xtra ───────────────────────────────────────────────
test("update_quote_line_xtra: identifier form lands as StandardMemoField3 in PATCH body", async () => {
    const mock = installFetchMock((call) => {
        if (call.url.includes("/Info()"))
            return { json: { ProfileId: "p" } };
        if (call.url.includes("/EntityFields"))
            return QUOTE_LINE_XTRA_ENTITY_FIELDS;
        if (call.url.includes("/QuoteLineXtras(59185)") && call.method === "PATCH")
            return { status: 204 };
        if (call.url.includes("/QuoteLineXtras") && call.method === "GET") {
            return { json: { value: [{ QuoteLineId: 59185, StandardMemoField3: "Beech tops, black frame" }] } };
        }
        return { json: { value: [] } };
    });
    try {
        const out = await updateQuoteLineXtra({
            lineId: 59185,
            fields: { StandardMemoField3: "Beech tops, black frame" },
        });
        assert.match(out, /QuoteLineXtra 59185 updated.*StandardMemoField3/);
        const patch = mock.calls.find((c) => c.method === "PATCH" && c.url.includes("/QuoteLineXtras(59185)"));
        assert.ok(patch);
        assert.deepEqual(patch.body, { StandardMemoField3: "Beech tops, black frame" });
    }
    finally {
        mock.restore();
    }
});
test("update_quote_line_xtra: raw column form translates to identifier in PATCH body", async () => {
    const mock = installFetchMock((call) => {
        if (call.url.includes("/Info()"))
            return { json: { ProfileId: "p" } };
        if (call.url.includes("/EntityFields"))
            return QUOTE_LINE_XTRA_ENTITY_FIELDS;
        if (call.url.includes("/QuoteLineXtras(59185)") && call.method === "PATCH")
            return { status: 204 };
        if (call.url.includes("/QuoteLineXtras") && call.method === "GET") {
            return { json: { value: [{ QuoteLineId: 59185, StandardMemoField3: "Red" }] } };
        }
        return { json: { value: [] } };
    });
    try {
        const out = await updateQuoteLineXtra({
            lineId: 59185,
            fields: { x_365_custom_memo_3: "Red" },
        });
        assert.match(out, /QuoteLineXtra 59185 updated.*StandardMemoField3/);
        const patch = mock.calls.find((c) => c.method === "PATCH" && c.url.includes("/QuoteLineXtras(59185)"));
        assert.ok(patch);
        assert.deepEqual(patch.body, { StandardMemoField3: "Red" });
    }
    finally {
        mock.restore();
    }
});
test("update_quote_line_xtra: works when EntityFields returns nothing (hardcoded slot fallback)", async () => {
    const mock = installFetchMock((call) => {
        if (call.url.includes("/Info()"))
            return { json: { ProfileId: "p" } };
        if (call.url.includes("/EntityFields"))
            return { json: { value: [] } };
        if (call.url.includes("/QuoteLineXtras(59185)") && call.method === "PATCH")
            return { status: 204 };
        if (call.url.includes("/QuoteLineXtras") && call.method === "GET") {
            return { json: { value: [{ QuoteLineId: 59185, StandardMemoField3: "Red" }] } };
        }
        return { json: { value: [] } };
    });
    try {
        const out = await updateQuoteLineXtra({
            lineId: 59185,
            fields: { StandardMemoField3: "Red" },
        });
        assert.match(out, /QuoteLineXtra 59185 updated/);
    }
    finally {
        mock.restore();
    }
});
test("update_quote_line_xtra: never PATCHes /QuoteLines (price-recalc guard)", async () => {
    const mock = installFetchMock((call) => {
        if (call.url.includes("/Info()"))
            return { json: { ProfileId: "p" } };
        if (call.url.includes("/EntityFields"))
            return QUOTE_LINE_XTRA_ENTITY_FIELDS;
        if (call.url.includes("/QuoteLineXtras(59185)") && call.method === "PATCH")
            return { status: 204 };
        if (call.url.includes("/QuoteLineXtras") && call.method === "GET") {
            return { json: { value: [{ QuoteLineId: 59185, StandardMemoField3: "Red" }] } };
        }
        return { json: { value: [] } };
    });
    try {
        await updateQuoteLineXtra({ lineId: 59185, fields: { StandardMemoField3: "Red" } });
        const quoteLineCall = mock.calls.find((c) => /\/QuoteLines(\(|\?|$)/.test(c.url) && !c.url.includes("/QuoteLineXtras"));
        assert.equal(quoteLineCall, undefined);
    }
    finally {
        mock.restore();
    }
});
test("update_quote_line_xtra: upserts via POST when PATCH 404s (row doesn't exist yet)", async () => {
    let patchAttempts = 0;
    const mock = installFetchMock((call) => {
        if (call.url.includes("/Info()"))
            return { json: { ProfileId: "p" } };
        if (call.url.includes("/EntityFields"))
            return QUOTE_LINE_XTRA_ENTITY_FIELDS;
        if (call.url.includes("/QuoteLineXtras(59185)") && call.method === "PATCH") {
            patchAttempts++;
            return { status: 404, json: { error: { message: "Not found" } } };
        }
        if (call.url.includes("/QuoteLineXtras") && call.method === "POST") {
            return { status: 201, json: { QuoteLineId: 59185, StandardMemoField3: "Red" } };
        }
        if (call.url.includes("/QuoteLineXtras") && call.method === "GET") {
            return { json: { value: [{ QuoteLineId: 59185, StandardMemoField3: "Red" }] } };
        }
        return { json: { value: [] } };
    });
    try {
        const out = await updateQuoteLineXtra({
            lineId: 59185,
            fields: { StandardMemoField3: "Red" },
        });
        assert.match(out, /QuoteLineXtra 59185 updated/);
        assert.equal(patchAttempts, 1);
        const post = mock.calls.find((c) => c.method === "POST" && c.url.includes("/QuoteLineXtras"));
        assert.ok(post);
        assert.deepEqual(post.body, { QuoteLineId: 59185, StandardMemoField3: "Red" });
    }
    finally {
        mock.restore();
    }
});
test("update_quote_line_xtra: rejects garbage key with valid-options hint", async () => {
    const mock = installFetchMock((call) => {
        if (call.url.includes("/Info()"))
            return { json: { ProfileId: "p" } };
        if (call.url.includes("/EntityFields"))
            return QUOTE_LINE_XTRA_ENTITY_FIELDS;
        return { json: { value: [] } };
    });
    try {
        await assert.rejects(() => updateQuoteLineXtra({ lineId: 59185, fields: { Bogus: "x" } }), /Unknown Xtra field.*Bogus/);
    }
    finally {
        mock.restore();
    }
});
//# sourceMappingURL=test-quote-line-xtra.js.map