# ProspectCRM MCP Server

## Project Overview

A local MCP server that wraps the Prospect365 OData v1 API, enabling Claude (via Claude Desktop, Claude Code, or any other MCP-compatible client) to create, read, update, and search quotes in ProspectCRM for Westcountry Group (WCG).

**Deployment model:** Code lives on the Synology NAS (mapped drive), spawned locally on each user's machine via `claude_desktop_config.json`. The server runs as a stdio-based MCP server — Claude Desktop launches it as a subprocess.

**API base URL:** `https://api-v1-westeurope.prospect365.com` (tenant regional host; `client.ts` defaults here). The public-docs host `crm-odata-v1.prospect365.com` is read-only and silently no-ops on bound actions — do not use.
**Auth:** Bearer token (PAT) via `Authorization: Bearer {token}` header
**Rate limit:** 1200 requests per 10 minutes (sliding window), shared across all PATs for the workspace. 429 = retry.

---

## Key OData Endpoints (EntitySets)

| EntitySet | Entity Type | Use |
|-----------|-------------|-----|
| `Quotes` | Quote | Quote headers (create, read, update) |
| `QuoteLines` | QuoteLine | Line items on quotes |
| `QuoteLineGroups` | QuoteLineGroup | Grouping/sections within quotes |
| `QuoteStatus` | QuoteStatus | Lookup: status codes and descriptions |
| `QuoteTypes` | QuoteType | Lookup: quote type codes |
| `QuoteSearch` | QuoteSearch | Optimised search endpoint for quotes |
| `Contacts` | Contact | Customer contacts |
| `ContactSearch` | ContactSearch | Optimised search for contacts |
| `Divisions` | Division | Companies/accounts (parent of contacts) |
| `DivisionSearch` | DivisionSearch | Optimised search for divisions |
| `ProductItems` | ProductItem | Product catalogue |
| `ProductItemSearch` | ProductItemSearch | Optimised product search |
| `ProductCategories` | ProductCategory | Product groupings |
| `Users` | User | CRM users (salespeople) |

---

## Quote Entity — Key Fields

### Writable on POST (create)
Fields with `UpdateVisibility` of `common` or `default`, plus ancestor entity IDs needed on creation:

| Field | Type | Notes |
|-------|------|-------|
| `ContactId` | Int32 | **Required.** Links to Contact. Auto-populates DivisionId. |
| `Description` | String(250) | Quote description/title |
| `OrderNumber` | String(50) | PO/order number |
| `CustomerOrderReference` | String(100) | Customer's own reference |
| `OrderDueDate` | DateTimeOffset | Delivery/due date |
| `SalesPersonId` | String(3) | User code of salesperson (e.g. "DL") |
| `Memo` | String(32767) | Internal notes |
| `DeliveryName` | String(100) | Delivery address fields... |
| `DeliveryAddressLine1-5` | String(100) | |
| `DeliveryCountry` | String(50) | |
| `DeliveryPostcode` | String(30) | |
| `DeliveryNotes1` | String(75) | |
| `DeliveryNotes2` | String(75) | |
| `ProjectCode` | String(100) | WCG project code |
| `OverallDiscountPercentage` | Decimal(5,2) | Header-level discount % |
| `Priority` | Int32 | Priority flag |
| `Urgent` | Byte | Urgent flag |

### Read-only / Auto-populated
| Field | Type | Notes |
|-------|------|-------|
| `QuoteId` | Int32 | PK, auto-generated |
| `DivisionId` | Int32 | Auto-set from ContactId |
| `StatusId` | Int32 | Defaults on creation |
| `QuoteType` | String(3) | Defaults to standard type |
| `QuoteDate` | DateTimeOffset | Auto-set |
| `Created` / `LastUpdated` | DateTimeOffset | Audit timestamps |
| `DecimalHomeNetValue` | Decimal | Computed totals |
| `DecimalHomeGrossValue` | Decimal | Computed totals |
| `DecimalHomeCostValue` | Decimal | Computed totals |
| `MarginPercentage` | Decimal | Computed |
| `RecordLink` | String | URL to quote in CRM UI |
| `StatusFlag` | String(1) | Active/deleted flag |

---

## QuoteLine Entity — Key Fields

### Writable on POST
| Field | Type | Notes |
|-------|------|-------|
| `QuoteId` | Int32 | **Required.** Parent quote FK |
| `ProductItemId` | String(100) | SKU/product code |
| `Description` | String(500) | **Required.** Line description |
| `ExtendedDescription` | String(32767) | Long description/notes |
| `Sequence` | Decimal(9,3) | Display order |
| `TaxCode` | String(50) | VAT code |
| `GroupId` | Int32 | Optional line group |
| `BackToBack` | Byte | Back-to-back flag |

### Decimal Fields (use these, not the raw Int64 fields)
| Field | Type | RW | Notes |
|-------|------|-----|-------|
| `DecimalQuantity` | Decimal | Read (Computed) | Use raw `Quantity` + `QuantityDecimals` for write |
| `DecimalPrice` | Decimal | Read/Write | Unit sell price |
| `DecimalCostPrice` | Decimal | Read/Write | Unit cost price |
| `DecimalDiscountPercentage` | Decimal | Read/Write | Line discount % |
| `DecimalNetValue` | Decimal | Read (Computed) | Qty × Price - Discount |
| `DecimalGrossValue` | Decimal | Read (Computed) | Net + Tax |
| `DecimalCostValue` | Decimal | Read (Computed) | Qty × Cost |
| `MarginPercentage` | Decimal | Read (Computed) | (Net - Cost) / Net |

**IMPORTANT:** The raw `Quantity`, `Price`, `CostPrice` fields are Int64 (stored as integers with implied decimals via `QuantityDecimals`, `SellDecimals`, `CostDecimals`). The `Decimal*` computed fields are the human-readable versions. For writing, prefer the Decimal* fields where UpdateVisibility="common" — test POST/PATCH with these first.

---

## QuoteLineGroup Entity

| Field | Type | Notes |
|-------|------|-------|
| `QuoteId` | Int32 | **Required.** Composite PK part 1 |
| `GroupId` | Int32 | **Required.** Composite PK part 2 (auto?) |
| `Title` | String(100) | **Required.** Group heading |
| `ShowSubtotal` | Boolean | Show subtotal for this group |
| `Sequence` | Int32 | Display order |
| `ShowPriceColumn` | Boolean | Show prices in this section |
| `ShowDiscount` | Boolean | Show discount column |

---

## QuoteStatus Lookup

Fetch via: `GET /QuoteStatus`

The exact status codes are workspace-specific. Typical Prospect statuses:
- Quote (open/draft)
- Order (confirmed)
- Cancelled
- Expired

**Action:** On first run, cache these. The `DeadFlag` field indicates whether a status represents a "dead" quote.

---

## WCG Business Rules

- **Default salesperson codes:** DL (Dale), plus others as needed
- **Dale's user code:** DL
- **Dale's ContactId:** 23122 (auto-populates DivisionId 5380)
- **Operating company:** Single company, code auto-populated
- **Currency:** GBP (default home currency)
- **AM code substitutions (for display/emails):** ML→CML, ML1→ML, JM→JRM, RL→RSL, JL unchanged
- **Prospect OData quirk:** POST requires `Content-Type: application/json`, responses are JSON by default
- **Expanding related entities:** Use `$expand=QuoteLines,Contact,Division,Status` on GET for full quote data
- **Filtering:** Standard OData v4 `$filter`, `$select`, `$orderby`, `$top`, `$skip`

---

## MCP Tool Definitions

### Phase 1 — Core Quote CRUD

1. **search_quotes** — Search/list quotes with filters
   - Inputs: `contactName?`, `divisionName?`, `description?`, `status?`, `salesPerson?`, `dateFrom?`, `dateTo?`, `top?`
   - Uses: `QuoteSearch` or `Quotes` with `$filter`, `$expand`, `$orderby`

2. **get_quote** — Get full quote with lines
   - Inputs: `quoteId`
   - Uses: `Quotes({id})?$expand=QuoteLines,Contact($expand=Division),Status,SalesPerson`

3. **create_quote** — Create a new quote header
   - Inputs: `contactId`, `description`, `salesPersonId?`, `orderDueDate?`, `memo?`, `projectCode?`, delivery address fields
   - Uses: POST to `Quotes`

4. **update_quote** — Update quote header fields
   - Inputs: `quoteId`, any writable header fields
   - Uses: PATCH to `Quotes({id})`

5. **add_quote_line** — Add a line item to a quote
   - Inputs: `quoteId`, `productItemId?`, `description`, `quantity`, `price`, `costPrice?`, `discountPercentage?`, `taxCode?`, `sequence?`
   - Uses: POST to `QuoteLines`

6. **update_quote_line** — Update an existing line item
   - Inputs: `lineId`, writable line fields
   - Uses: PATCH to `QuoteLines({lineId})`

7. **delete_quote_line** — Remove a line item
   - Inputs: `lineId`
   - Uses: DELETE to `QuoteLines({lineId})`

### Phase 2 — Supporting Lookups

8. **search_contacts** — Find contacts by name/company
   - Inputs: `searchTerm`, `top?`
   - Uses: `ContactSearch` or `Contacts` with `$filter`

9. **search_products** — Find products by code/name
   - Inputs: `searchTerm`, `top?`
   - Uses: `ProductItemSearch` or `ProductItems` with `$filter`

10. **get_quote_statuses** — List available statuses
    - Uses: `QuoteStatus`

11. **search_divisions** — Find companies/accounts
    - Inputs: `searchTerm`, `top?`
    - Uses: `DivisionSearch` or `Divisions` with `$filter`

### Phase 3 — Advanced

12. **add_quote_line_group** — Create a group/section on a quote
13. **duplicate_quote** — Clone an existing quote (create header + copy lines)
14. **get_quote_totals** — Get computed totals for a quote

---

## Tech Stack

- **Runtime:** Node.js (v24.14.0 installed)
- **Language:** TypeScript
- **MCP SDK:** `@modelcontextprotocol/sdk`
- **HTTP client:** `node-fetch` or native `fetch` (Node 18+)
- **Validation:** Zod
- **Build:** `tsc` to `dist/`

---

## claude_desktop_config.json Entry

For each user's machine (pointing to NAS share):

```json
{
  "mcpServers": {
    "prospect-crm": {
      "command": "node",
      "args": ["\\\\NAS\\IT\\prospect-mcp\\dist\\index.js"],
      "env": {
        "PROSPECT_PAT": "user_pat_token_here",
        "PROSPECT_BASE_URL": "https://crm-odata-v1.prospect365.com"
      }
    }
  }
}
```

**Note:** On Windows, you may need the full path to `node.exe` if it's not on the system PATH. Use `where node` to find it. The NAS UNC path backslashes need escaping in JSON (`\\\\`).

---

## Development Workflow

1. Code lives on NAS share, mapped to Dale's laptop
2. Open in Claude Code via mapped drive path
3. `npm run build` compiles TypeScript → `dist/`
4. Test by restarting Claude Desktop (or use `npx @anthropic-ai/mcp-inspector` for standalone testing)
5. Changes to source files on NAS are immediately available to all users after rebuild

---

## Error Handling

- 401 → PAT expired or invalid, prompt user to regenerate
- 404 → Entity not found (bad ID or wrong entity name)
- 429 → Rate limited, implement exponential backoff with retry
- 400 → Validation error, surface the OData error message to the user
- 500 → Server error, check if Prospect webhook/service is down (known issue with Prospect)

Always surface the full OData error response body to help debug field-level validation failures.

---

## Self-Fix Guide for Claude Code

The full OData metadata is at `reference/prospect-metadata.xml`. When you hit a field name error (HTTP 400 "Could not find a property named..."):

1. Search the metadata XML for the correct field name: `grep -i "PropertyName" reference/prospect-metadata.xml`
2. Check `meta:UpdateVisibility` — `never` = read-only, `common`/`default` = writable
3. Check `meta:Computed` — computed fields cannot be written to
4. Navigation properties define how entities relate — check these for $expand queries
5. Entity names in URLs are the `EntitySet Name` values (plural), not the `EntityType Name`

Common field name patterns in Prospect:
- Decimal/computed versions of integer fields: `DecimalPrice`, `DecimalQuantity`, `DecimalSellingPrice`
- User fields: `UserCode` (PK), `UserName` (display name), `EmailAddress`
- Status fields: `StatusFlag` (A/D active/deleted), `StatusId` (FK to status lookup)
- Address: always via navigation property `Address` on Division/Contact, never direct fields
- Timestamps: `Created`, `LastUpdated`, `LastUpdatedTimestamp`

---

## Testing Checklist

- [ ] GET Quotes with $expand works
- [ ] POST Quote creates successfully, returns QuoteId
- [ ] POST QuoteLine with ProductItemId populates price from catalogue
- [ ] PATCH Quote updates description
- [ ] PATCH QuoteLine updates quantity/price
- [ ] DELETE QuoteLine removes line
- [ ] Search contacts returns expected results
- [ ] Search products returns expected results
- [ ] Rate limiting handled gracefully
- [ ] Error messages are clear and actionable
