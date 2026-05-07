/**
 * MCP tool handlers for the Company entity (parent of Division).
 *
 * Hierarchy: Company → Division → Contact. The connector already creates a
 * Company explicitly inside create_division — these tools let callers read
 * and update Company-level fields after the fact, including the "Company
 * Group Type" shown in the Categorisation panel header.
 *
 * Company.TypeId (FK → CompanyType.Code, e.g. 'CUS') backs the Group Type.
 * The static metadata flags TypeId UpdateVisibility=never, but the Type
 * navigation property is UpdateVisibility=common — round 3 confirmed
 * Prospect's metadata flag is misleading on this tenant. Verify on first
 * live PATCH that companyGroupType writes through.
 */

import { z } from "zod";
import { getClient } from "../client.js";
import { resolveDropdownValue } from "./dropdowns.js";

// ─── Schemas ─────────────────────────────────────────────────────────────────

export const getCompanySchema = z.object({
  companyId: z.number().int().describe("CompanyId to fetch"),
});

export const updateCompanySchema = z.object({
  companyId: z.number().int().describe("CompanyId to update"),
  name: z.string().optional().describe("Company name"),
  companyGroupType: z.string().optional().describe(
    "Patches Company.TypeId (Group Type). Accepts the FK code (e.g. 'CUS') or the UI label ('Customer')."
  ),
  source: z.string().optional().describe("Free-text Source field. Not a dropdown on this tenant."),
  alternateReference: z.string().optional().describe("Alternate reference / external code"),
  longDescription: z.string().optional().describe("Notes about the company"),
});

export const listCompaniesSchema = z.object({
  filters: z
    .object({
      name: z.string().optional().describe("contains() match on Company.Name"),
      companyGroupType: z.string().optional().describe("Exact match on Company.TypeId (FK code or label)"),
    })
    .optional(),
  fields: z.array(z.string()).optional().describe(
    "Which Company fields to return. Defaults to: CompanyId, Name, TypeId, AccountManagerId, Source, AlternateReference, LastUpdated.",
  ),
  pageSize: z.number().int().min(1).max(2000).optional().default(500),
  skip: z.number().int().min(0).optional(),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

const COMPANY_AUTO_PAGINATE_CEILING = 5000;
const COMPANY_SERVER_PAGE_CAP = 500;

function escapeOData(s: string): string {
  return s.replace(/'/g, "''");
}

function buildQuery(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") sp.set(k, v);
  }
  return sp.toString();
}

const LIST_COMPANIES_DEFAULT_FIELDS = [
  "CompanyId",
  "Name",
  "TypeId",
  "AccountManagerId",
  "Source",
  "AlternateReference",
  "LastUpdated",
];

// ─── Handlers ────────────────────────────────────────────────────────────────

export async function getCompany(args: z.infer<typeof getCompanySchema>): Promise<string> {
  const client = getClient();
  const result = await client.getById<Record<string, unknown>>(
    "Companies",
    args.companyId,
    buildQuery({ $expand: "Type($select=Code,Description)" }),
  );
  return JSON.stringify(result, null, 2);
}

export async function updateCompany(args: z.infer<typeof updateCompanySchema>): Promise<string> {
  const client = getClient();
  const { companyId, ...fields } = args;

  const body: Record<string, unknown> = {};
  if (fields.name !== undefined) body.Name = fields.name;
  if (fields.companyGroupType !== undefined) {
    body.TypeId = await resolveDropdownValue("companyGroupType", fields.companyGroupType);
  }
  if (fields.source !== undefined) body.Source = fields.source;
  if (fields.alternateReference !== undefined) body.AlternateReference = fields.alternateReference;
  if (fields.longDescription !== undefined) body.LongDescription = fields.longDescription;

  if (Object.keys(body).length === 0) {
    return "No fields provided to update. Specify at least one field to change.";
  }

  await client.patch<Record<string, unknown>>("Companies", companyId, body);
  return `Company #${companyId} updated successfully. Fields changed: ${Object.keys(body).join(", ")}`;
}

export async function listCompanies(args: z.infer<typeof listCompaniesSchema>): Promise<string> {
  const client = getClient();

  const fields = args.fields && args.fields.length > 0 ? args.fields : LIST_COMPANIES_DEFAULT_FIELDS;
  // CompanyId is required for keying.
  const odataFields = Array.from(new Set(["CompanyId", ...fields]));

  const filterClauses: string[] = ["StatusFlag ne 'D'"];
  if (args.filters?.name !== undefined) {
    filterClauses.push(`contains(Name,'${escapeOData(args.filters.name)}')`);
  }
  if (args.filters?.companyGroupType !== undefined) {
    const code = await resolveDropdownValue("companyGroupType", args.filters.companyGroupType);
    filterClauses.push(`TypeId eq '${escapeOData(code)}'`);
  }

  const baseFilter = filterClauses.join(" and ");
  const selectValue = odataFields.join(",");
  const orderbyValue = "CompanyId";
  const pageSize = args.pageSize ?? 500;
  const effectivePageSize = Math.min(pageSize, COMPANY_SERVER_PAGE_CAP);

  const records: Record<string, unknown>[] = [];
  let totalCount: number | undefined;

  const ceiling = args.skip !== undefined ? pageSize : COMPANY_AUTO_PAGINATE_CEILING;
  const startSkip = args.skip ?? 0;

  for (let offset = 0; offset < ceiling; offset += effectivePageSize) {
    const remaining = ceiling - offset;
    const top = Math.min(effectivePageSize, remaining);
    const queryStr = buildQuery({
      $filter: baseFilter,
      $select: selectValue,
      $top: String(top),
      $skip: String(startSkip + offset),
      $orderby: orderbyValue,
      $count: offset === 0 ? "true" : undefined,
    });
    const result = await client.get<Record<string, unknown>>("Companies", queryStr);
    if (offset === 0 && typeof result["@odata.count"] === "number") {
      totalCount = result["@odata.count"];
    }
    records.push(...result.value);
    if (result.value.length < top) break;
    if (args.skip !== undefined) break; // single-page mode
  }

  if (totalCount === undefined) totalCount = records.length;
  const truncated = totalCount > records.length;

  return JSON.stringify({
    totalCount,
    returnedCount: records.length,
    truncated,
    skip: startSkip,
    pageSize,
    records,
  });
}
