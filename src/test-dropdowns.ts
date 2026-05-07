#!/usr/bin/env node

/**
 * Unit tests for list_dropdown_options, label→FK translation in
 * create/update_division, the four standard Division FK fields, and
 * delete_division. All run against a mocked global fetch.
 *
 * Run with: npm run test:dropdowns
 */

import { test } from "node:test";
import assert from "node:assert/strict";

process.env.PROSPECT_PAT = process.env.PROSPECT_PAT || "test-token-for-mock";
process.env.PROSPECT_BASE_URL =
  process.env.PROSPECT_BASE_URL || "https://api-v1-westeurope.prospect365.com";
process.env.PROSPECT_PROFILE_ID = process.env.PROSPECT_PROFILE_ID || "test-profile-id";

const { listDropdownOptions, deleteDivision, __resetDropdownCache } = await import(
  "./tools/dropdowns.js"
);
const { createDivision, updateDivision } = await import("./tools/contacts.js");

interface MockCall {
  url: string;
  method: string;
  body?: unknown;
  query: URLSearchParams;
}

function installFetchMock(
  handler: (call: MockCall) => { status?: number; json?: unknown; text?: string },
) {
  const calls: MockCall[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    const queryStr = u.includes("?") ? u.slice(u.indexOf("?") + 1) : "";
    const rawBody = typeof init?.body === "string" ? init.body : undefined;
    let parsedBody: unknown;
    try {
      parsedBody = rawBody ? JSON.parse(rawBody) : undefined;
    } catch {/* not JSON */}
    const call: MockCall = {
      url: u,
      method: init?.method ?? "GET",
      body: parsedBody,
      query: new URLSearchParams(queryStr),
    };
    calls.push(call);
    const resp = handler(call);
    return new Response(
      resp.json !== undefined ? JSON.stringify(resp.json) : (resp.text ?? null),
      {
        status: resp.status ?? 200,
        headers: { "content-type": "application/json" },
      },
    );
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = originalFetch;
      __resetDropdownCache();
    },
  };
}

const MAT_FK = "Entity.DivisionXtra.StandardDropdownField2.04a2188e";
const PROSPECT_FK = "Entity.DivisionXtra.StandardDropdownField2.099aa777";

function dropdownItemsResponse() {
  return {
    json: {
      value: [
        { Id: MAT_FK, Description: "M.A.T.", Obsolete: 0 },
        { Id: PROSPECT_FK, Description: "Prospect", Obsolete: 0 },
        { Id: "Entity.DivisionXtra.StandardDropdownField2.deadbeef", Description: "Obsolete tag", Obsolete: 1 },
      ],
    },
  };
}

// ─── Acceptance criterion 1 — list_dropdown_options ──────────────────────────

test("list_dropdown_options(field='customerType') returns options with FK code + label", async () => {
  const mock = installFetchMock((call) => {
    if (call.url.includes("/DropdownItems")) return dropdownItemsResponse();
    return { json: { value: [] } };
  });
  try {
    const json = await listDropdownOptions({ field: "customerType", includeObsolete: false });
    const parsed = JSON.parse(json) as {
      field: string;
      count: number;
      options: Array<{ code: string; label: string }>;
    };
    assert.equal(parsed.field, "customerType");
    const mat = parsed.options.find((o) => o.label === "M.A.T.");
    assert.ok(mat, `expected M.A.T. row in options: ${JSON.stringify(parsed.options)}`);
    assert.equal(mat.code, MAT_FK, "M.A.T. code must be the canonical FK");
    // The filter must scope to slot 2 only, not all dropdown items.
    const filter = mock.calls[0].query.get("$filter") ?? "";
    assert.ok(
      filter.includes("startswith(Id, 'Entity.DivisionXtra.StandardDropdownField2.')"),
      `filter must be slot-2 scoped: ${filter}`,
    );
    assert.ok(filter.includes("Obsolete eq 0"), `should exclude obsolete by default: ${filter}`);
  } finally {
    mock.restore();
  }
});

test("list_dropdown_options('standardIndustryCode') queries StandardIndustryCodes entity set with Code/Description", async () => {
  const mock = installFetchMock((call) => {
    if (call.url.includes("/StandardIndustryCodes")) {
      return {
        json: {
          value: [
            { Code: "318b5d", Description: "Multi-Academy Trust", Obsolete: 0 },
            { Code: "abc123", Description: "Primary School", Obsolete: 0 },
          ],
        },
      };
    }
    return { json: { value: [] } };
  });
  try {
    const json = await listDropdownOptions({ field: "standardIndustryCode", includeObsolete: false });
    const parsed = JSON.parse(json) as { options: Array<{ code: string; label: string }> };
    const mat = parsed.options.find((o) => o.code === "318b5d");
    assert.ok(mat, "expected 318b5d row");
    assert.equal(mat.label, "Multi-Academy Trust");
    const select = mock.calls[0].query.get("$select") ?? "";
    assert.ok(select.includes("Code"));
    assert.ok(select.includes("Description"));
    // No slot-startswith filter for standard fields.
    const filter = mock.calls[0].query.get("$filter") ?? "";
    assert.ok(!filter.includes("startswith(Id"), `should not have DropdownItems filter: ${filter}`);
  } finally {
    mock.restore();
  }
});

test("list_dropdown_options rejects unknown field with helpful error", async () => {
  const mock = installFetchMock(() => ({ json: { value: [] } }));
  try {
    await assert.rejects(
      () => listDropdownOptions({ field: "bogusField", includeObsolete: false }),
      /Unknown dropdown field 'bogusField'/,
    );
  } finally {
    mock.restore();
  }
});

// ─── Acceptance criterion 2 — label translation in update_division ───────────

test("update_division(customerType='M.A.T.') translates label to FK before PATCH", async () => {
  const mock = installFetchMock((call) => {
    if (call.url.includes("/DropdownItems")) return dropdownItemsResponse();
    if (call.method === "PATCH" && call.url.includes("/DivisionXtras(1231)")) {
      return { status: 204 };
    }
    return { status: 204 };
  });
  try {
    await updateDivision({ divisionId: 1231, customerType: "M.A.T." });
    const xtraPatch = mock.calls.find(
      (c) => c.method === "PATCH" && c.url.includes("/DivisionXtras(1231)"),
    );
    assert.ok(xtraPatch, "expected PATCH to DivisionXtras(1231)");
    const body = xtraPatch.body as Record<string, unknown>;
    assert.equal(
      body.StandardDropdownField2,
      MAT_FK,
      `body must contain the FK, not the raw label: ${JSON.stringify(body)}`,
    );
  } finally {
    mock.restore();
  }
});

test("update_division(customerType='<FK>') passes the FK through unchanged", async () => {
  const mock = installFetchMock((call) => {
    if (call.url.includes("/DropdownItems")) return dropdownItemsResponse();
    return { status: 204 };
  });
  try {
    await updateDivision({ divisionId: 1231, customerType: MAT_FK });
    const xtraPatch = mock.calls.find(
      (c) => c.method === "PATCH" && c.url.includes("/DivisionXtras(1231)"),
    );
    const body = xtraPatch!.body as Record<string, unknown>;
    assert.equal(body.StandardDropdownField2, MAT_FK, "FK should round-trip unchanged");
  } finally {
    mock.restore();
  }
});

test("update_division(customerType='Bogus Label') throws with available labels listed", async () => {
  const mock = installFetchMock((call) => {
    if (call.url.includes("/DropdownItems")) return dropdownItemsResponse();
    return { status: 204 };
  });
  try {
    await assert.rejects(
      () => updateDivision({ divisionId: 1231, customerType: "Bogus Label" }),
      /Could not resolve 'Bogus Label'.*M\.A\.T\./s,
    );
  } finally {
    mock.restore();
  }
});

test("dropdown cache: second update_division for same field reuses cached lookup", async () => {
  const mock = installFetchMock((call) => {
    if (call.url.includes("/DropdownItems")) return dropdownItemsResponse();
    return { status: 204 };
  });
  try {
    await updateDivision({ divisionId: 1231, customerType: "M.A.T." });
    await updateDivision({ divisionId: 1232, customerType: "Prospect" });
    const dropdownCalls = mock.calls.filter((c) => c.url.includes("/DropdownItems"));
    assert.equal(dropdownCalls.length, 1, `expected 1 cached fetch, got ${dropdownCalls.length}`);
  } finally {
    mock.restore();
  }
});

// ─── Acceptance criterion 3 — standard fields on create_division ─────────────

test("create_division: standardIndustryCode + deliveryZoneCode + priorityId all land in Divisions POST body", async () => {
  const mock = installFetchMock((call) => {
    if (call.url.includes("/StandardIndustryCodes")) {
      return { json: { value: [{ Code: "318b5d", Description: "MAT", Obsolete: 0 }] } };
    }
    if (call.url.includes("/DeliveryZones")) {
      return { json: { value: [{ Code: "5ceeb6", Description: "Cornwall", Obsolete: 0 }] } };
    }
    if (call.url.includes("/DivisionPriorities")) {
      return { json: { value: [{ PriorityId: 1, Description: "Tier 1", Obsolete: 0 }] } };
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
      name: "Test 2026",
      standardIndustryCode: "318b5d",
      deliveryZoneCode: "5ceeb6",
      priorityId: 1,
      pupilNumbers: 446,
    });
    const divPost = mock.calls.find((c) => c.method === "POST" && c.url.endsWith("/Divisions"));
    assert.ok(divPost);
    const body = divPost.body as Record<string, unknown>;
    assert.equal(body.StandardIndustryCode, "318b5d", `SIC missing: ${JSON.stringify(body)}`);
    assert.equal(body.DeliveryZoneCode, "5ceeb6", `delivery zone missing: ${JSON.stringify(body)}`);
    assert.equal(body.PriorityId, 1, `priority missing: ${JSON.stringify(body)}`);
    assert.equal(body.Employees, 446, `pupilNumbers should map to Employees: ${JSON.stringify(body)}`);
  } finally {
    mock.restore();
  }
});

test("create_division: standardIndustryCode='Multi-Academy Trust' (label) translates to '318b5d' (code)", async () => {
  const mock = installFetchMock((call) => {
    if (call.url.includes("/StandardIndustryCodes")) {
      return { json: { value: [{ Code: "318b5d", Description: "Multi-Academy Trust", Obsolete: 0 }] } };
    }
    if (call.method === "POST" && call.url.endsWith("/Companies")) {
      return { json: { CompanyId: 9002 } };
    }
    if (call.method === "POST" && call.url.endsWith("/Divisions")) {
      return { json: { DivisionId: 5556, AddressId: 7778 } };
    }
    return { status: 204 };
  });
  try {
    await createDivision({ name: "Label Test", standardIndustryCode: "Multi-Academy Trust" });
    const divPost = mock.calls.find((c) => c.method === "POST" && c.url.endsWith("/Divisions"));
    const body = divPost!.body as Record<string, unknown>;
    assert.equal(body.StandardIndustryCode, "318b5d", "label must translate to FK");
  } finally {
    mock.restore();
  }
});

// ─── Acceptance criterion 4 — delete_division ────────────────────────────────

test("delete_division: refuses without confirmed=true", async () => {
  const mock = installFetchMock(() => ({ status: 204 }));
  try {
    await assert.rejects(
      () => deleteDivision({ divisionId: 34020, confirmed: false }),
      /destructive.*confirmed=true/i,
    );
    assert.equal(mock.calls.length, 0, "should make zero HTTP calls when not confirmed");
  } finally {
    mock.restore();
  }
});

test("delete_division: with confirmed=true issues DELETE /Divisions(id) and returns ok", async () => {
  const mock = installFetchMock((call) => {
    if (call.method === "DELETE" && call.url.includes("/Divisions(34020)")) {
      return { status: 204 };
    }
    return { status: 204 };
  });
  try {
    const out = await deleteDivision({ divisionId: 34020, confirmed: true });
    const parsed = JSON.parse(out) as { ok: boolean; divisionId: number; deletedAt: string };
    assert.equal(parsed.ok, true);
    assert.equal(parsed.divisionId, 34020);
    assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(parsed.deletedAt), `deletedAt should be ISO: ${parsed.deletedAt}`);
    const del = mock.calls.find((c) => c.method === "DELETE" && c.url.includes("/Divisions(34020)"));
    assert.ok(del, "expected DELETE /Divisions(34020)");
  } finally {
    mock.restore();
  }
});

// ─── Acceptance criterion 6 — URL encoding regression ────────────────────────

test("regression: list_dropdown_options encodes URL-reserved chars in extraFilter cleanly", async () => {
  // The slot filter has a literal "'Entity.DivisionXtra.StandardDropdownField2.'" —
  // dots/quotes don't need encoding, but we want to make sure the assembled URL
  // is parseable and the connector survives.
  const mock = installFetchMock(() => dropdownItemsResponse());
  try {
    await listDropdownOptions({ field: "customerType", includeObsolete: false });
    const url = mock.calls[0].url;
    // Ensure the URL is structured (single ?, single host).
    assert.equal(url.split("?").length, 2, `URL must have exactly one ?: ${url}`);
    const parsed = new URL(url);
    const filter = parsed.searchParams.get("$filter");
    assert.ok(filter, `expected $filter param: ${url}`);
    assert.ok(filter.includes("Entity.DivisionXtra.StandardDropdownField2."));
  } finally {
    mock.restore();
  }
});
