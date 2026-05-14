#!/usr/bin/env node

/**
 * Unit tests for the StatusDetail surfacing across opportunities tools:
 *   - get_lead_lookups(kind="statusDetails")
 *   - search_opportunities(statusDetail=...)
 *   - get_opportunity / get_lead_details "Status Detail:" output line
 *
 * Run with: npm run test:status-details
 */

import { test } from "node:test";
import assert from "node:assert/strict";

process.env.PROSPECT_PAT = process.env.PROSPECT_PAT || "test-token-for-mock";
process.env.PROSPECT_BASE_URL =
  process.env.PROSPECT_BASE_URL || "https://api-v1-westeurope.prospect365.com";
process.env.PROSPECT_PROFILE_ID = process.env.PROSPECT_PROFILE_ID || "test-profile-id";

const { getLeadLookups, searchOpportunities, getOpportunity, getLeadLookupsSchema, searchOpportunitiesSchema } =
  await import("./tools/opportunities.js");
const { getLeadDetails } = await import("./tools/extended.js");

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
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

// ─── Schema acceptance ───────────────────────────────────────────────────

test("getLeadLookupsSchema accepts kind='statusDetails'", () => {
  const parsed = getLeadLookupsSchema.parse({ kind: "statusDetails" });
  assert.equal(parsed.kind, "statusDetails");
});

test("searchOpportunitiesSchema accepts statusDetail param", () => {
  const parsed = searchOpportunitiesSchema.parse({ statusDetail: "Uncompetitive" });
  assert.equal(parsed.statusDetail, "Uncompetitive");
});

// ─── get_lead_lookups(kind="statusDetails") ──────────────────────────────

test("get_lead_lookups(kind='statusDetails') queries LeadStatusDetails and returns parent-grouped rows", async () => {
  const mock = installFetchMock((call) => {
    if (call.url.includes("/Info()")) return { json: { ProfileId: "p" } };
    if (call.url.includes("/LeadStatusDetails")) {
      return {
        json: {
          value: [
            { StatusId: "LOST", Code: "UNCMP", Description: "Uncompetitive", Sequence: 1, Obsolete: 0 },
            { StatusId: "LOST", Code: "NONEED", Description: "No need anymore", Sequence: 2, Obsolete: 0 },
            { StatusId: "WON", Code: "PRICE", Description: "Best price", Sequence: 1, Obsolete: 0 },
          ],
        },
      };
    }
    return { json: { value: [] } };
  });
  try {
    const out = await getLeadLookups({ kind: "statusDetails", includeObsolete: false });
    // Output groups by parent status and lists the rows.
    assert.match(out, /Lead Status Details \(3\)/);
    assert.match(out, /Parent Status: LOST/);
    assert.match(out, /Uncompetitive/);
    assert.match(out, /No need anymore/);
    assert.match(out, /Parent Status: WON/);
    // Query must target the right entity set and include parent-status code.
    const ldCall = mock.calls.find((c) => c.url.includes("/LeadStatusDetails"));
    assert.ok(ldCall, "should call /LeadStatusDetails");
    const select = ldCall!.query.get("$select") ?? "";
    assert.ok(select.includes("StatusId") && select.includes("Code") && select.includes("Description"));
    // Obsolete filter default should be applied.
    const filter = ldCall!.query.get("$filter") ?? "";
    assert.ok(filter.includes("Obsolete eq 0"), `should exclude obsolete by default: ${filter}`);
  } finally {
    mock.restore();
  }
});

// ─── search_opportunities statusDetail filter + row formatting ────────────

test("search_opportunities(statusDetail=X) builds combined label/code OData filter", async () => {
  const mock = installFetchMock((call) => {
    if (call.url.includes("/Info()")) return { json: { ProfileId: "p" } };
    if (call.url.includes("/Leads")) {
      return {
        json: {
          value: [
            {
              LeadId: 15331,
              Description: "ACME deal",
              Value: 1000,
              WeightedValue: 500,
              Guttometer: 50,
              EstimatedClose: "2026-06-01T00:00:00Z",
              Created: "2026-01-01T00:00:00Z",
              RecordLink: "https://example/lead/15331",
              StatusDetailId: "UNCMP",
              Contact: {
                Forename: "A",
                Surname: "B",
                Division: { Name: "ACME Ltd" },
              },
              Status: { Description: "Lost" },
              StatusDetail: { Code: "UNCMP", Description: "Uncompetitive" },
              SalesPerson: { UserName: "Dale" },
              Pipeline: { Description: "Standard" },
            },
          ],
        },
      };
    }
    return { json: { value: [] } };
  });
  try {
    const out = await searchOpportunities({
      statusDescription: "Lost",
      statusDetail: "Uncompetitive",
      includeClosed: true,
      top: 20,
    });
    // Row formatting must include the detail label next to the status.
    assert.match(out, /Status: Lost \(Uncompetitive\)/);

    const leadsCall = mock.calls.find((c) => c.url.includes("/Leads"));
    assert.ok(leadsCall);
    const filter = leadsCall!.query.get("$filter") ?? "";
    assert.ok(
      filter.includes("StatusDetail/Description") && filter.includes("StatusDetailId"),
      `statusDetail filter must include both label-contains and code-eq clauses: ${filter}`,
    );
    const expand = leadsCall!.query.get("$expand") ?? "";
    assert.ok(expand.includes("StatusDetail"), `expand must include StatusDetail: ${expand}`);
  } finally {
    mock.restore();
  }
});

// ─── get_opportunity Status Detail line ───────────────────────────────────

test("get_opportunity output includes 'Status Detail:' line with resolved label", async () => {
  const mock = installFetchMock((call) => {
    if (call.url.includes("/Info()")) return { json: { ProfileId: "p" } };
    if (call.url.includes("/Leads(")) {
      return {
        json: {
          value: [
            {
              LeadId: 15331,
              Description: "ACME deal",
              StatusId: "LOST",
              StatusDetailId: "UNCMP",
              SizeId: "M",
              Status: { Code: "LOST", Description: "Lost" },
              StatusDetail: { Code: "UNCMP", Description: "Uncompetitive" },
              Size: { Code: "M", Description: "Medium" },
              Contact: { ContactId: 1, Forename: "A", Surname: "B", Division: { Name: "ACME" } },
              Guttometer: 0,
              AutocalculateValue: false,
              StatusFlag: "A",
            },
          ],
        },
      };
    }
    return { json: { value: [] } };
  });
  try {
    const out = await getOpportunity({ leadId: 15331 });
    assert.match(out, /\*\*Status:\*\* Lost/);
    assert.match(out, /\*\*Status Detail:\*\* Uncompetitive \(UNCMP\)/);
  } finally {
    mock.restore();
  }
});

test("get_opportunity shows '—' for Status Detail when null", async () => {
  const mock = installFetchMock((call) => {
    if (call.url.includes("/Info()")) return { json: { ProfileId: "p" } };
    if (call.url.includes("/Leads(")) {
      return {
        json: {
          value: [
            {
              LeadId: 15332,
              Description: "Other deal",
              StatusId: "QUOT",
              StatusDetailId: null,
              SizeId: "M",
              Status: { Code: "QUOT", Description: "Quoting" },
              StatusDetail: null,
              Size: { Code: "M", Description: "Medium" },
              Contact: { ContactId: 1, Forename: "A", Surname: "B", Division: { Name: "ACME" } },
              Guttometer: 0,
              AutocalculateValue: false,
              StatusFlag: "A",
            },
          ],
        },
      };
    }
    return { json: { value: [] } };
  });
  try {
    const out = await getOpportunity({ leadId: 15332 });
    assert.match(out, /\*\*Status Detail:\*\* —/);
  } finally {
    mock.restore();
  }
});

// ─── get_lead_details Status Detail line ──────────────────────────────────

test("get_lead_details output includes 'Status Detail:' line", async () => {
  const mock = installFetchMock((call) => {
    if (call.url.includes("/Info()")) return { json: { ProfileId: "p" } };
    if (call.url.includes("/Leads(")) {
      return {
        json: {
          value: [
            {
              LeadId: 15331,
              Description: "ACME deal",
              StatusDetailId: "UNCMP",
              Guttometer: 0,
              Status: { Description: "Lost" },
              StatusDetail: { Code: "UNCMP", Description: "Uncompetitive" },
              Owner: { UserCode: "DL", UserName: "Dale" },
              Contact: {
                ContactId: 1,
                Forename: "A",
                Surname: "B",
                Email: null,
                PhoneNumber: null,
                Division: {
                  DivisionId: 5380,
                  Name: "ACME",
                  SalesLedgerId: "ACME001",
                  Address: null,
                },
              },
              Quotes: [],
              RecordLink: null,
            },
          ],
        },
      };
    }
    return { json: { value: [] } };
  });
  try {
    const out = await getLeadDetails({ leadId: 15331 });
    assert.match(out, /\*\*Status:\*\* Lost/);
    assert.match(out, /\*\*Status Detail:\*\* Uncompetitive \(UNCMP\)/);
  } finally {
    mock.restore();
  }
});
