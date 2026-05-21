#!/usr/bin/env node
/**
 * Unit tests for the v1.16.0 QuoteLines write-path fix.
 *
 * The WCG Prospect tenant zeroes `DecimalDiscountPercentage` on POST and
 * returns HTTP 500 for PATCH on any `Decimal*` computed field. The fix:
 *
 *   - addQuoteLine: keep `DecimalPrice` / `DecimalCostPrice` in POST body,
 *     drop `DecimalDiscountPercentage`, follow up with a PATCH on raw
 *     `Discount` Int32 (×100) when a non-zero discount was supplied.
 *   - updateQuoteLine: switch all three price/cost/discount writes to the
 *     raw Int backing fields `Price` / `CostPrice` / `Discount` (×100).
 *
 * Empirically confirmed against quote 15521 on 2026-05-21.
 *
 * Run with: npm run test:quote-line-discount
 */
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.PROSPECT_PAT = process.env.PROSPECT_PAT || "test-token-for-mock";
process.env.PROSPECT_BASE_URL =
    process.env.PROSPECT_BASE_URL || "https://api-v1-westeurope.prospect365.com";
process.env.PROSPECT_PROFILE_ID = process.env.PROSPECT_PROFILE_ID || "test-profile-id";
const { addQuoteLine, updateQuoteLine } = await import("./tools/quote-lines.js");
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
        },
    };
}
// ─── addQuoteLine — POST body shape ────────────────────────────
test("addQuoteLine: does NOT send DecimalDiscountPercentage on POST", async () => {
    // Server zeroes it regardless; we don't want callers reading the wrapper
    // source to think the field is honoured.
    const mock = installFetchMock((call) => {
        if (call.url.includes("/Info()"))
            return { json: { ProfileId: "p" } };
        if (call.url.includes("/QuoteLines") && call.method === "POST") {
            return {
                status: 201,
                json: {
                    LineId: 99999,
                    QuoteId: 15521,
                    Description: "test",
                    DecimalPrice: 100,
                    DecimalDiscountPercentage: 0,
                    DecimalQuantity: 1,
                },
            };
        }
        return { json: { value: [] } };
    });
    try {
        await addQuoteLine({
            quoteId: 15521,
            description: "test",
            price: 100,
            discountPercentage: 5,
            quantity: 1,
        });
        const post = mock.calls.find((c) => c.method === "POST" && c.url.endsWith("/QuoteLines"));
        assert.ok(post, "expected POST /QuoteLines");
        assert.equal("DecimalDiscountPercentage" in (post.body ?? {}), false, "POST body must not include DecimalDiscountPercentage");
        // But DecimalPrice IS still expected (POST honours it)
        assert.equal(post.body.DecimalPrice, 100);
    }
    finally {
        mock.restore();
    }
});
test("addQuoteLine: follows POST with PATCH {Discount: pct*100} when discountPercentage > 0", async () => {
    const mock = installFetchMock((call) => {
        if (call.url.includes("/Info()"))
            return { json: { ProfileId: "p" } };
        if (call.url.includes("/QuoteLines") && call.method === "POST") {
            return {
                status: 201,
                json: {
                    LineId: 12345,
                    QuoteId: 15521,
                    Description: "test",
                    DecimalPrice: 100,
                    DecimalQuantity: 1,
                },
            };
        }
        if (call.url.includes("/QuoteLines(12345)") && call.method === "PATCH") {
            return { status: 204 };
        }
        return { json: { value: [] } };
    });
    try {
        await addQuoteLine({
            quoteId: 15521,
            description: "test",
            price: 100,
            discountPercentage: 5,
            quantity: 1,
        });
        const patch = mock.calls.find((c) => c.method === "PATCH" && c.url.includes("/QuoteLines(12345)"));
        assert.ok(patch, "expected PATCH /QuoteLines(12345)");
        assert.deepEqual(patch.body, { Discount: 500 }, "PATCH must use raw Discount Int = pct × 100");
    }
    finally {
        mock.restore();
    }
});
test("addQuoteLine: omits the discount PATCH when discountPercentage is 0 or undefined", async () => {
    for (const pct of [undefined, 0]) {
        const mock = installFetchMock((call) => {
            if (call.url.includes("/Info()"))
                return { json: { ProfileId: "p" } };
            if (call.url.includes("/QuoteLines") && call.method === "POST") {
                return { status: 201, json: { LineId: 1, QuoteId: 15521, Description: "x", DecimalPrice: 100 } };
            }
            return { json: { value: [] } };
        });
        try {
            await addQuoteLine({
                quoteId: 15521,
                description: "x",
                price: 100,
                discountPercentage: pct,
                quantity: 1,
            });
            const patch = mock.calls.find((c) => c.method === "PATCH" && c.url.includes("/QuoteLines("));
            assert.equal(patch, undefined, `expected NO PATCH when discountPercentage=${pct}`);
        }
        finally {
            mock.restore();
        }
    }
});
test("addQuoteLine: discount PATCH rounds half-percent values correctly", async () => {
    // 5.555% × 100 = 555.5 → 556 (Math.round half-up)
    const mock = installFetchMock((call) => {
        if (call.url.includes("/Info()"))
            return { json: { ProfileId: "p" } };
        if (call.url.includes("/QuoteLines") && call.method === "POST") {
            return { status: 201, json: { LineId: 77, QuoteId: 15521, Description: "x" } };
        }
        if (call.url.includes("/QuoteLines(77)") && call.method === "PATCH")
            return { status: 204 };
        return { json: { value: [] } };
    });
    try {
        await addQuoteLine({
            quoteId: 15521,
            description: "x",
            price: 100,
            discountPercentage: 5.555,
            quantity: 1,
        });
        const patch = mock.calls.find((c) => c.method === "PATCH" && c.url.includes("/QuoteLines(77)"));
        assert.deepEqual(patch.body, { Discount: 556 });
    }
    finally {
        mock.restore();
    }
});
test("addQuoteLine: response displays the user-supplied discountPercentage, not the stale created.DecimalDiscountPercentage", async () => {
    // After the POST the server returned discount=0 (the bug). After our PATCH
    // it's 5. The `created` object in memory is still 0 — but the response
    // text should report what the user actually got (5%).
    const mock = installFetchMock((call) => {
        if (call.url.includes("/Info()"))
            return { json: { ProfileId: "p" } };
        if (call.url.includes("/QuoteLines") && call.method === "POST") {
            return { status: 201, json: { LineId: 88, QuoteId: 15521, Description: "x", DecimalPrice: 100, DecimalDiscountPercentage: 0 } };
        }
        if (call.url.includes("/QuoteLines(88)") && call.method === "PATCH")
            return { status: 204 };
        return { json: { value: [] } };
    });
    try {
        const out = await addQuoteLine({
            quoteId: 15521,
            description: "x",
            price: 100,
            discountPercentage: 5,
            quantity: 1,
        });
        assert.match(out, /Discount.*5\.0%/);
    }
    finally {
        mock.restore();
    }
});
// ─── updateQuoteLine — raw integer fields ──────────────────────
test("updateQuoteLine: uses raw `Price` Int (pounds × 100), not `DecimalPrice`", async () => {
    const mock = installFetchMock((call) => {
        if (call.url.includes("/Info()"))
            return { json: { ProfileId: "p" } };
        if (call.url.includes("/QuoteLines(42)") && call.method === "PATCH")
            return { status: 204 };
        return { json: { value: [] } };
    });
    try {
        await updateQuoteLine({ lineId: 42, price: 250.99 });
        const patch = mock.calls.find((c) => c.method === "PATCH" && c.url.includes("/QuoteLines(42)"));
        assert.ok(patch);
        assert.deepEqual(patch.body, { Price: 25099 });
        assert.equal("DecimalPrice" in (patch.body ?? {}), false);
    }
    finally {
        mock.restore();
    }
});
test("updateQuoteLine: uses raw `Discount` Int (pct × 100), not `DecimalDiscountPercentage`", async () => {
    const mock = installFetchMock((call) => {
        if (call.url.includes("/Info()"))
            return { json: { ProfileId: "p" } };
        if (call.url.includes("/QuoteLines(42)") && call.method === "PATCH")
            return { status: 204 };
        return { json: { value: [] } };
    });
    try {
        await updateQuoteLine({ lineId: 42, discountPercentage: 5 });
        const patch = mock.calls.find((c) => c.method === "PATCH" && c.url.includes("/QuoteLines(42)"));
        assert.ok(patch);
        assert.deepEqual(patch.body, { Discount: 500 });
        assert.equal("DecimalDiscountPercentage" in (patch.body ?? {}), false);
    }
    finally {
        mock.restore();
    }
});
test("updateQuoteLine: uses raw `CostPrice` Int (pounds × 100), not `DecimalCostPrice`", async () => {
    const mock = installFetchMock((call) => {
        if (call.url.includes("/Info()"))
            return { json: { ProfileId: "p" } };
        if (call.url.includes("/QuoteLines(42)") && call.method === "PATCH")
            return { status: 204 };
        return { json: { value: [] } };
    });
    try {
        await updateQuoteLine({ lineId: 42, costPrice: 50.5 });
        const patch = mock.calls.find((c) => c.method === "PATCH" && c.url.includes("/QuoteLines(42)"));
        assert.deepEqual(patch.body, { CostPrice: 5050 });
        assert.equal("DecimalCostPrice" in (patch.body ?? {}), false);
    }
    finally {
        mock.restore();
    }
});
test("updateQuoteLine: combined price + cost + discount PATCH uses all three raw fields in one body", async () => {
    const mock = installFetchMock((call) => {
        if (call.url.includes("/Info()"))
            return { json: { ProfileId: "p" } };
        if (call.url.includes("/QuoteLines(42)") && call.method === "PATCH")
            return { status: 204 };
        return { json: { value: [] } };
    });
    try {
        await updateQuoteLine({
            lineId: 42,
            price: 250.99,
            costPrice: 50.5,
            discountPercentage: 5,
        });
        const patch = mock.calls.find((c) => c.method === "PATCH" && c.url.includes("/QuoteLines(42)"));
        assert.deepEqual(patch.body, { Price: 25099, CostPrice: 5050, Discount: 500 });
    }
    finally {
        mock.restore();
    }
});
test("updateQuoteLine: leaves description / quantity write paths unchanged", async () => {
    const mock = installFetchMock((call) => {
        if (call.url.includes("/Info()"))
            return { json: { ProfileId: "p" } };
        if (call.url.includes("/QuoteLines(42)") && call.method === "PATCH")
            return { status: 204 };
        return { json: { value: [] } };
    });
    try {
        await updateQuoteLine({ lineId: 42, description: "Updated", quantity: 5 });
        const patch = mock.calls.find((c) => c.method === "PATCH" && c.url.includes("/QuoteLines(42)"));
        assert.deepEqual(patch.body, {
            Description: "Updated",
            Quantity: 5000,
            QuantityDecimals: 3,
        });
    }
    finally {
        mock.restore();
    }
});
test("updateQuoteLine: rounds half-penny prices correctly via Math.round", async () => {
    // £100.005 × 100 = 10000.5 → 10001 (half-up)
    const mock = installFetchMock((call) => {
        if (call.url.includes("/Info()"))
            return { json: { ProfileId: "p" } };
        if (call.url.includes("/QuoteLines(42)") && call.method === "PATCH")
            return { status: 204 };
        return { json: { value: [] } };
    });
    try {
        await updateQuoteLine({ lineId: 42, price: 100.005 });
        const patch = mock.calls.find((c) => c.method === "PATCH" && c.url.includes("/QuoteLines(42)"));
        assert.deepEqual(patch.body, { Price: 10001 });
    }
    finally {
        mock.restore();
    }
});
//# sourceMappingURL=test-quote-line-discount.js.map