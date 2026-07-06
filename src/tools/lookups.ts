/**
 * MCP tool handlers for supporting lookups — contacts, products, divisions, statuses.
 */

import { z } from "zod";
import { getClient } from "../client.js";
import type { Contact, Division, ProductItem, QuoteStatus } from "../types/prospect.js";

// ─── Schemas ───────────────────────────────────────────────────

export const searchContactsSchema = z.object({
  searchTerm: z.string().describe("Name, email, or phone number to search for"),
  top: z.number().optional().default(10).describe("Max results (default 10)"),
});

/**
 * Fields search_products consults. Match is case-insensitive substring on each.
 * Order matters: it controls the order of OR clauses in the OData $filter (and
 * therefore the order documented in errors / help text).
 */
export const PRODUCT_SEARCH_FIELDS = [
  "ProductItemId",
  "Description",
  "ExtendedDescription",
  "ManufacturerReference",
  "Manufacturer",
  "AlternateReference1",
  "AlternateReference2",
  "AlternateReference3",
  "AlternateReference4",
  "Barcode",
] as const;

export const searchProductsSchema = z.object({
  searchTerm: z.string().describe(
    "Substring to look for. Matches case-insensitively against SKU, description, extended description, " +
      "manufacturer reference (supplier code), manufacturer name, AlternateReference1..4, and barcode.",
  ),
  searchFields: z
    .array(z.enum(PRODUCT_SEARCH_FIELDS))
    .optional()
    .describe(
      "Optional subset of fields to search. Defaults to all of: " +
        PRODUCT_SEARCH_FIELDS.join(", ") +
        ". Use this to narrow a noisy search (e.g. searchFields=['ManufacturerReference'] to look up by supplier code only).",
    ),
  salesAnalysisMin: z.number().optional().describe("Filter by Access Dimensions sales nominal >= this integer (e.g. 1000). Stored as string '10-1-NNNN-000' — pass the 4-digit nominal only."),
  salesAnalysisMax: z.number().optional().describe("Filter by Access Dimensions sales nominal <= this integer (e.g. 1195). Used with salesAnalysisMin to filter a range, e.g. 1000–1195 for paper."),
  top: z.number().optional().default(10).describe("Max results (default 10)"),
});

export const getProductDetailSchema = z.object({
  productItemId: z.string().describe("The product code / SKU (ProductItemId) — e.g. 'VCARRIAGEMOB'."),
});

export const divisionFiltersSchema = z
  .object({
    customerType: z.string().optional().describe(
      "Alias for customDropdown2 — the user-visible 'Customer Type' dropdown on this tenant. " +
      "Backed by DivisionXtra/StandardDropdownField2. Exact match (e.g. 'M.A.T.')."
    ),
    relationship: z.string().optional().describe("Exact match on Division.Relationship"),
    territoryCode: z.string().optional().describe(
      "AREA LOCATION — case-insensitive exact match on Division.TerritoryCode (e.g. 'WGAREA137e6eff02e14d98942fe6b8baf5af77' or the human label like 'WG AREA' if upstream stores hashed codes)."
    ),
    accountManager: z.string().optional().describe("Exact match on Division.AccountManager (3-char UserCode, e.g. 'DL')"),
    postcode: z.string().optional().describe("Prefix match on the linked Address.Postcode (e.g. 'PE10' matches all PE10-area postcodes)"),
    // Canonical custom-dropdown filters — friendly names are tenant-specific, so the connector exposes the slot
    // numbers and the caller decides what they mean. Each backs DivisionXtra/StandardDropdownField{N}.
    customDropdown1: z.string().optional().describe("Exact match on DivisionXtra/StandardDropdownField1 (paperAccountManager on WCG)"),
    customDropdown2: z.string().optional().describe("Exact match on DivisionXtra/StandardDropdownField2 (customerType on WCG)"),
    customDropdown3: z.string().optional().describe("Exact match on DivisionXtra/StandardDropdownField3 (officeAllocated on WCG)"),
    customDropdown4: z.string().optional().describe("Exact match on DivisionXtra/StandardDropdownField4 (colouredPaperPriceList on WCG)"),
    customDropdown5: z.string().optional().describe("Exact match on DivisionXtra/StandardDropdownField5 (laminatingPouchesList on WCG)"),
  })
  .partial();

export const searchDivisionsSchema = z.object({
  searchTerm: z.string().describe("Company/division name or account code to search for"),
  top: z.number().optional().default(10).describe("Max results (default 10). Values >500 auto-paginate under the hood up to 5000."),
  filters: divisionFiltersSchema.optional().describe(
    "Optional structured filters that AND with searchTerm. Use this to narrow by CustomerType, Relationship, TerritoryCode, AccountManager, or postcode prefix."
  ),
});

export const listDivisionsSchema = z.object({
  filters: divisionFiltersSchema.optional().describe(
    "Structured filters: customerType, relationship, territoryCode, accountManager, postcode (prefix). All AND together."
  ),
  fields: z.array(z.string()).optional().describe(
    "Which Division fields to return. Defaults to the dedupe-relevant subset: " +
      "DivisionId, Name, SalesLedgerId, Relationship, TerritoryCode, AccountManager, Website, AlternateReference, MainAddressId, LastUpdated, " +
      "plus Address.Postcode flattened as 'Postcode' and DivisionXtra dropdowns flattened as customDropdown1..5."
  ),
  pageSize: z.number().int().min(1).max(2000).optional().default(500).describe("Records per fetch (default 500, max 2000)."),
  skip: z.number().int().min(0).optional().describe(
    "If set, returns one page starting at this offset. If omitted, auto-paginates up to 5000 records."
  ),
});

export const getQuoteStatusesSchema = z.object({});

// ─── Handlers ──────────────────────────────────────────────────

export async function searchContacts(args: z.infer<typeof searchContactsSchema>): Promise<string> {
  const client = getClient();
  const term = args.searchTerm;

  const filter = [
    `(contains(Forename,'${term}') or contains(Surname,'${term}') or contains(Email,'${term}') or contains(PhoneNumber,'${term}'))`,
    "StatusFlag ne 'D'",
  ].join(" and ");

  const params = [
    `$filter=${filter}`,
    `$expand=Division($select=DivisionId,Name,SalesLedgerId)`,
    `$select=ContactId,DivisionId,Forename,Surname,Email,PhoneNumber,MobilePhoneNumber,JobTitle,RecordLink`,
    `$top=${args.top || 10}`,
    `$orderby=Surname,Forename`,
  ].join("&");

  const result = await client.get<Contact>("Contacts", params);

  if (result.value.length === 0) {
    return `No contacts found matching "${term}".`;
  }

  const lines = result.value.map((c) => {
    const name = `${c.Forename || ""} ${c.Surname || ""}`.trim();
    const company = c.Division?.Name || "N/A";
    const account = c.Division?.SalesLedgerId || "";
    return [
      `**${name}** (ContactId: ${c.ContactId})`,
      `  Company: ${company}${account ? ` [${account}]` : ""} (DivisionId: ${c.DivisionId})`,
      `  Job: ${c.JobTitle || "N/A"} | Email: ${c.Email || "N/A"} | Phone: ${c.PhoneNumber || c.MobilePhoneNumber || "N/A"}`,
    ].join("\n");
  });

  return `Found ${result.value.length} contact(s):\n\n${lines.join("\n\n")}`;
}

/**
 * Build the $filter clause for search_products. Exported so the unit test
 * can assert on it without round-tripping through fetch.
 *
 * Case-insensitive via `tolower(<field>)` on both sides — OData v4's
 * `contains()` is case-sensitive by default, and the WCG catalogue mixes
 * upper/mixed-case SKUs ("NC27062401") with title-case manufacturers
 * ("Arrow Group Global Ltd."). Null values short-circuit cleanly: any
 * `tolower(null)` makes the clause evaluate null → false, so missing fields
 * are simply ignored rather than throwing.
 */
export function buildProductSearchFilter(args: z.infer<typeof searchProductsSchema>): string {
  const term = args.searchTerm;
  const fields = args.searchFields && args.searchFields.length > 0
    ? args.searchFields
    : (PRODUCT_SEARCH_FIELDS as readonly string[]);
  const literal = escapeOData(term.toLowerCase());

  const orClause = fields
    .map((f) => `contains(tolower(${f}),'${literal}')`)
    .join(" or ");

  const parts = [`(${orClause})`, "Obsolete ne 1"];

  // SalesAnalysis is Edm.String with format "10-1-NNNN-000" (e.g. "10-1-1125-000").
  // Use lexical string comparisons with zero-padded 4-digit nominal segments.
  // -000 as min suffix, -999 as max suffix so the entire nominal range is captured.
  if (args.salesAnalysisMin !== undefined) {
    const min = String(args.salesAnalysisMin).padStart(4, "0");
    parts.push(`SalesAnalysis ge '10-1-${min}-000'`);
  }
  if (args.salesAnalysisMax !== undefined) {
    const max = String(args.salesAnalysisMax).padStart(4, "0");
    parts.push(`SalesAnalysis le '10-1-${max}-999'`);
  }

  return parts.join(" and ");
}

export async function searchProducts(args: z.infer<typeof searchProductsSchema>): Promise<string> {
  const client = getClient();
  const term = args.searchTerm;

  const filter = buildProductSearchFilter(args);

  // $select includes the new searchable + diagnostic fields so the renderer
  // can show *why* a row matched (e.g. Mfr Ref hit). ExtendedDescription is
  // queryable but deliberately NOT selected — it's 32 KB per row and bloats
  // the response; the caller can fetch it via get_product_detail.
  const params = [
    `$filter=${filter}`,
    `$select=ProductItemId,Description,DecimalSellingPrice,DecimalCostPrice,DecimalQuantityAvailable,CategoryId,UnitDescription,SalesAnalysis,Manufacturer,ManufacturerReference,AlternateReference1,AlternateReference2,AlternateReference3,AlternateReference4,Barcode`,
    `$top=${args.top || 10}`,
    `$orderby=ProductItemId`,
  ].join("&");

  const result = await client.get<ProductItem & {
    Manufacturer?: string | null;
    ManufacturerReference?: string | null;
    AlternateReference1?: string | null;
    AlternateReference2?: string | null;
    AlternateReference3?: string | null;
    AlternateReference4?: string | null;
    Barcode?: string | null;
  }>("ProductItems", params);

  if (result.value.length === 0) {
    return `No products found matching "${term}".`;
  }

  const lines = result.value.map((p) => {
    const rows = [
      `**${p.ProductItemId}** — ${p.Description || "(no description)"}`,
      `  Sell: £${p.DecimalSellingPrice?.toFixed(2) ?? "N/A"} | Cost: £${p.DecimalCostPrice?.toFixed(2) ?? "N/A"} | Stock: ${p.DecimalQuantityAvailable ?? "N/A"}`,
      `  Category: ${p.CategoryId || "N/A"} | Unit: ${p.UnitDescription || "N/A"} | Sales Nominal: ${p.SalesAnalysis ?? "N/A"}`,
    ];

    // Append a supplier/refs line only when any of those fields is populated —
    // most products fill at least one (Mfr or MfrRef), so this is usually visible.
    const mfrBits: string[] = [];
    if (p.Manufacturer) mfrBits.push(`Manufacturer: ${p.Manufacturer}`);
    if (p.ManufacturerReference) mfrBits.push(`Mfr Ref: ${p.ManufacturerReference}`);
    if (p.Barcode) mfrBits.push(`Barcode: ${p.Barcode}`);
    if (mfrBits.length > 0) rows.push(`  ${mfrBits.join(" | ")}`);

    const altBits: string[] = [];
    if (p.AlternateReference1) altBits.push(`Alt1: ${p.AlternateReference1}`);
    if (p.AlternateReference2) altBits.push(`Alt2: ${p.AlternateReference2}`);
    if (p.AlternateReference3) altBits.push(`Alt3: ${p.AlternateReference3}`);
    if (p.AlternateReference4) altBits.push(`Alt4: ${p.AlternateReference4}`);
    if (altBits.length > 0) rows.push(`  ${altBits.join(" | ")}`);

    return rows.join("\n");
  });

  return `Found ${result.value.length} product(s):\n\n${lines.join("\n\n")}`;
}

export async function getProductDetail(args: z.infer<typeof getProductDetailSchema>): Promise<string> {
  const client = getClient();
  const code = args.productItemId;

  const select = [
    "ProductItemId", "Description", "ExtendedDescription", "InternalNotes", "Specification",
    "SellingPrice", "CostPrice", "PurchaseCostPrice",
    "DecimalSellingPrice", "DecimalCostPrice", "DecimalPurchaseCostPrice",
    "CategoryId", "Manufacturer", "ManufacturerReference", "PreferredSupplier",
    "Barcode", "Sku",
    "AlternateReference1", "AlternateReference2", "AlternateReference3", "AlternateReference4",
    "Stocked", "Sellable", "UnitDescription",
    "SalesAnalysis", "PurchaseAnalysis", "VatCode", "Type",
    "Obsolete", "LastUpdated",
  ].join(",");

  const params = `$filter=ProductItemId eq '${code.replace(/'/g, "''")}'&$select=${select}&$top=1`;
  const result = await client.get<Record<string, unknown>>("ProductItems", params);

  if (result.value.length === 0) {
    return `No product found for code ${code}.`;
  }

  const p = result.value[0];
  const fenced = (label: string, raw: unknown): string | null => {
    const text = typeof raw === "string" ? raw.trim() : "";
    if (!text) return null;
    return `### ${label}\n\`\`\`\n${text}\n\`\`\``;
  };
  const money = (raw: unknown): string =>
    typeof raw === "number" ? `£${raw.toFixed(2)}` : "N/A";

  const header = `# ${p.ProductItemId} — ${p.Description || "(no description)"}`;

  const pricing = [
    `## Pricing`,
    `**Sell:** ${money(p.DecimalSellingPrice)} | **Cost:** ${money(p.DecimalCostPrice)} | **Purchase Cost:** ${money(p.DecimalPurchaseCostPrice)}`,
    `**Unit:** ${p.UnitDescription || "N/A"} | **Category:** ${p.CategoryId || "N/A"} | **Type:** ${p.Type ?? "(null — Dimensions will reject order conversion)"}`,
    `**Sales Nominal:** ${p.SalesAnalysis ?? "N/A"} | **Purchase Nominal:** ${p.PurchaseAnalysis ?? "N/A"} | **VAT code:** ${p.VatCode ?? "N/A"}`,
  ].join("\n");

  const supplier = [
    `## Supplier`,
    `**Preferred Supplier:** ${p.PreferredSupplier || "N/A"}`,
    `**Manufacturer:** ${p.Manufacturer || "N/A"} | **Mfr Ref:** ${p.ManufacturerReference || "N/A"}`,
    `**Stocked:** ${p.Stocked ?? "N/A"} | **Sellable:** ${p.Sellable ? "yes" : "no"} | **Obsolete:** ${p.Obsolete ? "yes" : "no"}`,
  ].join("\n");

  const refs = [
    `## References`,
    `**SKU:** ${p.Sku || "N/A"} | **Barcode:** ${p.Barcode || "N/A"}`,
    `**Alt 1:** ${p.AlternateReference1 || "N/A"}`,
    `**Alt 2:** ${p.AlternateReference2 || "N/A"}`,
    `**Alt 3:** ${p.AlternateReference3 || "N/A"}`,
    `**Alt 4:** ${p.AlternateReference4 || "N/A"}`,
    `**Last Updated:** ${typeof p.LastUpdated === "string" ? p.LastUpdated : "N/A"}`,
  ].join("\n");

  const notesSections = [
    fenced("Extended Description", p.ExtendedDescription),
    fenced("Internal Notes", p.InternalNotes),
    fenced("Specification", p.Specification),
  ].filter((s): s is string => s !== null);
  const notes = notesSections.length ? `## Notes\n\n${notesSections.join("\n\n")}` : null;

  return [header, "", pricing, "", supplier, "", refs, notes ? "\n" + notes : ""]
    .filter((s) => s !== "")
    .join("\n");
}

// Hard ceiling for auto-pagination — protects MCP transport from oversized responses.
const DIVISION_AUTO_PAGINATE_CEILING = 5000;
// Server caps each page at 500 regardless of $top.
const DIVISION_SERVER_PAGE_CAP = 500;

function escapeOData(s: string): string {
  return s.replace(/'/g, "''");
}

/**
 * URL-encode a flat object of OData query operators into a query string.
 * Uses URLSearchParams so reserved characters (&, ?, #, +, =) inside values
 * — particularly inside `$filter=contains(Name,'…')` — are percent-encoded
 * once. The OData server decodes them back to literals on the wire.
 */
function buildODataQuery(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") sp.set(k, v);
  }
  return sp.toString();
}

/**
 * Map the connector's filter object onto OData $filter clauses.
 * The 'Customer Type' dropdown the WCG UI shows is custom slot #2 on
 * DivisionXtra (StandardDropdownField2), NOT the unused Division.CustomerType
 * field. Same for the other slots — see DivisionXtra metadata lines 900–904.
 */
function buildDivisionFilterClauses(filters: z.infer<typeof divisionFiltersSchema> | undefined): string[] {
  const clauses: string[] = [];
  if (!filters) return clauses;

  // customerType is a friendly alias for customDropdown2; let an explicit
  // customDropdown2 win if both are supplied (caller asked for the canonical).
  const dropdowns: Array<[number, string | undefined]> = [
    [1, filters.customDropdown1],
    [2, filters.customDropdown2 ?? filters.customerType],
    [3, filters.customDropdown3],
    [4, filters.customDropdown4],
    [5, filters.customDropdown5],
  ];
  for (const [slot, val] of dropdowns) {
    if (val !== undefined) {
      clauses.push(`DivisionXtra/StandardDropdownField${slot} eq '${escapeOData(val)}'`);
    }
  }

  if (filters.relationship !== undefined) {
    clauses.push(`Relationship eq '${escapeOData(filters.relationship)}'`);
  }
  if (filters.territoryCode !== undefined) {
    clauses.push(`tolower(TerritoryCode) eq '${escapeOData(filters.territoryCode.toLowerCase())}'`);
  }
  if (filters.accountManager !== undefined) {
    clauses.push(`AccountManager eq '${escapeOData(filters.accountManager)}'`);
  }
  if (filters.postcode !== undefined) {
    clauses.push(`startswith(Address/Postcode, '${escapeOData(filters.postcode)}')`);
  }
  return clauses;
}

/** $expand fragment that pulls the DivisionXtra dropdown slots inline. */
const DIVISION_XTRA_EXPAND =
  "DivisionXtra($select=StandardDropdownField1,StandardDropdownField2,StandardDropdownField3,StandardDropdownField4,StandardDropdownField5)";

/**
 * Flatten DivisionXtra dropdown slots onto the record under canonical
 * customDropdown1..5 keys, regardless of whether the API returned them.
 */
function flattenDropdowns(record: Record<string, unknown>): Record<string, string | null> {
  const xtra = record["DivisionXtra"] as Record<string, unknown> | undefined;
  const out: Record<string, string | null> = {};
  for (let i = 1; i <= 5; i++) {
    const v = xtra ? (xtra[`StandardDropdownField${i}`] as string | null | undefined) : undefined;
    out[`customDropdown${i}`] = v ?? null;
  }
  return out;
}

/**
 * Walk the Divisions collection via $skip until either the result is exhausted
 * or `ceiling` records have been collected. Prospect caps each page at 500
 * regardless of $top, so we use min(pageSize, 500) per request and short-circuit
 * when a short page comes back.
 *
 * Issues `$count=true` on the first page to populate totalCount; if the API
 * doesn't include it, falls back to records.length and reports truncated=false.
 *
 * Filter/select/expand/orderby values are passed in unencoded — this function
 * URL-encodes them via URLSearchParams so '&', '?', '+', etc. inside literals
 * are safe.
 */
async function paginateDivisions<T = Division>(
  baseFilter: string,
  selectValue: string,
  expandValue: string,
  orderbyValue: string,
  ceiling: number,
  pageSize: number,
  startSkip = 0,
): Promise<{ records: T[]; totalCount: number; truncated: boolean }> {
  const client = getClient();
  const records: T[] = [];
  const effectivePageSize = Math.min(pageSize, DIVISION_SERVER_PAGE_CAP);
  let totalCount: number | undefined;

  for (let offset = 0; offset < ceiling; offset += effectivePageSize) {
    const remaining = ceiling - offset;
    const top = Math.min(effectivePageSize, remaining);
    const skip = startSkip + offset;
    const queryStr = buildODataQuery({
      $filter: baseFilter || undefined,
      $select: selectValue || undefined,
      $expand: expandValue || undefined,
      $top: String(top),
      $skip: String(skip),
      $orderby: orderbyValue || undefined,
      $count: offset === 0 ? "true" : undefined,
    });

    const result = await client.get<T>("Divisions", queryStr);
    if (offset === 0 && typeof result["@odata.count"] === "number") {
      totalCount = result["@odata.count"];
    }
    records.push(...result.value);
    if (result.value.length < top) break;
  }

  if (totalCount === undefined) totalCount = records.length;
  const truncated = totalCount > records.length;
  return { records, totalCount, truncated };
}

export async function searchDivisions(args: z.infer<typeof searchDivisionsSchema>): Promise<string> {
  const term = args.searchTerm;
  const requestedTop = args.top ?? 10;

  const clauses: string[] = [
    `(contains(Name,'${escapeOData(term)}') or contains(SalesLedgerId,'${escapeOData(term)}'))`,
    "StatusFlag ne 'D'",
    ...buildDivisionFilterClauses(args.filters),
  ];
  const baseFilter = clauses.join(" and ");

  const selectValue = "DivisionId,Name,SalesLedgerId,Relationship,TerritoryCode,AccountManager,RecordLink";
  const expandValue = `Address($select=AddressLine1,AddressLine2,AddressLine3,Postcode),${DIVISION_XTRA_EXPAND}`;
  const orderbyValue = "Name";

  const ceiling = Math.min(requestedTop, DIVISION_AUTO_PAGINATE_CEILING);
  const { records, totalCount, truncated } = await paginateDivisions<Division & { DivisionXtra?: Record<string, unknown> }>(
    baseFilter,
    selectValue,
    expandValue,
    orderbyValue,
    ceiling,
    DIVISION_SERVER_PAGE_CAP,
  );

  if (records.length === 0) {
    return `No divisions/companies found matching "${term}".`;
  }

  const lines = records.map((d) => {
    const addr = d.Address;
    const address = addr ? [addr.AddressLine1, addr.AddressLine2, addr.AddressLine3, addr.Postcode].filter(Boolean).join(", ") : "N/A";
    const dropdowns = flattenDropdowns(d as unknown as Record<string, unknown>);
    return [
      `**${d.Name}** (DivisionId: ${d.DivisionId})`,
      `  Account: ${d.SalesLedgerId || "N/A"} | Territory: ${d.TerritoryCode || "N/A"} | AM: ${d.AccountManager || "N/A"}`,
      `  Customer Type: ${dropdowns.customDropdown2 || "N/A"} | Relationship: ${(d as Division & { Relationship?: string | null }).Relationship || "N/A"}`,
      `  Address: ${address}`,
    ].join("\n");
  });

  const header =
    truncated
      ? `Showing ${records.length} of ${totalCount} division(s) matching "${term}" — truncated at ceiling ${DIVISION_AUTO_PAGINATE_CEILING}; use list_divisions for full sets.`
      : `Found ${records.length} division(s)${totalCount !== records.length ? ` of ${totalCount} total` : ""}:`;

  return `${header}\n\n${lines.join("\n\n")}`;
}

/** Synthetic field names that don't live on Division directly. */
const SYNTHETIC_FIELDS = new Set([
  "Postcode",
  "customDropdown1",
  "customDropdown2",
  "customDropdown3",
  "customDropdown4",
  "customDropdown5",
]);

const LIST_DIVISIONS_DEFAULT_FIELDS = [
  "DivisionId",
  "Name",
  "SalesLedgerId",
  "Relationship",
  "TerritoryCode",
  "AccountManager",
  "Website",
  "AlternateReference",
  "MainAddressId",
  "Postcode",
  "customDropdown1",
  "customDropdown2",
  "customDropdown3",
  "customDropdown4",
  "customDropdown5",
  "LastUpdated",
];

export async function listDivisions(args: z.infer<typeof listDivisionsSchema>): Promise<string> {
  const fields = args.fields && args.fields.length > 0 ? args.fields : LIST_DIVISIONS_DEFAULT_FIELDS;
  const includePostcode = fields.includes("Postcode");
  const includeDropdowns = fields.some((f) => /^customDropdown[1-5]$/.test(f));

  // DivisionId is required for keying. Strip synthetic fields from the OData $select.
  const odataFields = Array.from(
    new Set(["DivisionId", ...fields.filter((f) => !SYNTHETIC_FIELDS.has(f))]),
  );

  const filterClauses = ["StatusFlag ne 'D'", ...buildDivisionFilterClauses(args.filters)];
  const baseFilter = filterClauses.join(" and ");
  const selectValue = odataFields.join(",");
  const expandParts: string[] = [];
  if (includePostcode) expandParts.push("Address($select=Postcode)");
  if (includeDropdowns) expandParts.push(DIVISION_XTRA_EXPAND);
  const expandValue = expandParts.join(",");
  const orderbyValue = "DivisionId";

  const pageSize = args.pageSize ?? 500;

  let records: Record<string, unknown>[];
  let totalCount: number;
  let truncated: boolean;

  if (args.skip !== undefined) {
    const { records: r, totalCount: c, truncated: t } = await paginateDivisions<Record<string, unknown>>(
      baseFilter,
      selectValue,
      expandValue,
      orderbyValue,
      pageSize,
      pageSize,
      args.skip,
    );
    records = r;
    totalCount = c;
    truncated = t;
  } else {
    const result = await paginateDivisions<Record<string, unknown>>(
      baseFilter,
      selectValue,
      expandValue,
      orderbyValue,
      DIVISION_AUTO_PAGINATE_CEILING,
      pageSize,
    );
    records = result.records;
    totalCount = result.totalCount;
    truncated = result.truncated;
  }

  const flattened = records.map((r) => {
    const out: Record<string, unknown> = {};
    const dropdowns = flattenDropdowns(r);
    for (const f of fields) {
      if (f === "Postcode") {
        const addr = r["Address"] as { Postcode?: string | null } | undefined;
        out.Postcode = addr?.Postcode ?? null;
      } else if (/^customDropdown[1-5]$/.test(f)) {
        out[f] = dropdowns[f];
      } else {
        out[f] = r[f] ?? null;
      }
    }
    return out;
  });

  return JSON.stringify({
    totalCount,
    returnedCount: flattened.length,
    truncated,
    skip: args.skip ?? 0,
    pageSize,
    records: flattened,
  });
}

export async function getQuoteStatuses(): Promise<string> {
  const client = getClient();

  const params = "$select=QuoteStatusCode,Description,DeadFlag&$orderby=QuoteStatusCode";
  const result = await client.get<QuoteStatus>("QuoteStatus", params);

  if (result.value.length === 0) {
    return "No quote statuses found.";
  }

  const lines = result.value.map((s) => {
    const dead = s.DeadFlag ? " ☠️ (dead/closed)" : "";
    return `- **${s.QuoteStatusCode}**: ${s.Description || "(unnamed)"}${dead}`;
  });

  return `Quote statuses:\n\n${lines.join("\n")}`;
}
