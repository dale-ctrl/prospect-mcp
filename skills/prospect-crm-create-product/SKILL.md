---
name: prospect-crm-create-product
description: >
  Create a new non-catalogue (NC) product in Prospect CRM following the WCG naming convention
  (NC + DDMMYY + sequential NN), with cost/sell derived from the supplier price list and discount.
  Trigger whenever the user needs to add a bespoke or one-off item to the catalogue before it can
  go on a quote — e.g. "create a new product", "this isn't in the catalogue", "set up an NC code",
  "add a bespoke table/chair/desk", or any request to look up a supplier list price and apply the
  supplier discount to work out the cost. Pairs with prospect-crm-create-quote: create the product
  first, then add it to the quote by SKU.
---

# Create a Non-Catalogue (NC) Product in Prospect CRM

WCG raises bespoke / one-off / made-to-order items as **non-catalogue (NC) products** so they
have a real SKU that flows onto quotes and into Access Dimensions orders. This skill covers
generating the code, pricing the item from the supplier price list + discount, and creating the
ProductItem record.

## When to use
- The item the customer wants is not already in the catalogue (`search_products` returns nothing
  for the supplier code or description).
- A quote needs a line for a bespoke item (a swapped finish, a special size, a made-to-order piece).

## 1. Generate the NC code

Format — **three parts, no separators**: `NC` + `DDMMYY` (today) + `NN` (2-digit daily sequence).

Examples on file: `NC27062401`, `NC18052601`, `NC13032502`, `NC01112402`.
For 17 June 2026 the first code of the day is `NC17062601`.

**Always look up what already exists today** so two people creating items on the same day don't
collide:

```
search_products(searchTerm="NC<DDMMYY>")        # e.g. "NC170626"
```

Take the highest trailing `NN` found and add 1 (zero-padded). If none exist, start at `01`.

> If the `create_product` MCP tool is deployed (see §5), pass `autoCode=true` and it does this
> lookup and assigns the next free number for you — preferred, as it closes the race window by
> re-checking on a clash.

## 2. Price the item

Two routes depending on whether the item is on a published supplier price list.

### Route A — item IS on the supplier's price list (the normal case)

1. **Find the list price.** SharePoint → **Estimating Team** library →
   **Furniture Price Lists** → the supplier's folder (e.g. `Hille/2026`, `CORAL 8 SPREADSHEET`).
   Open the current price list and find the item / its list (RRP) price.
   - Tools: `sharepoint_folder_search(name="Furniture Price Lists")` then `read_resource` on the
     supplier subfolder, or `sharepoint_search(query=..., folderName="Furniture Price Lists")`.
2. **Find the supplier discount.** SharePoint →
   **Furniture Price Lists** → **`#Supplier Discounts`** → **`Supplier Discounts.xlsx`**.
   Columns: `Supplier Name | Discount off list | Useful Contact | Email`.
   Read the row for this supplier to get **% off list**.
3. **Cost price = list price × (1 − discount%).**
   e.g. list £1,000, supplier on 59% off → cost = 1000 × 0.41 = **£410.00**.
   - Some suppliers are `Nett price on list` (Fusion 10, Origin, Tabilo) — the list price IS the
     cost, no discount applied.
   - A few have split rates (Identity Furniture: Furniture 55% / Screens 60%) — pick the right one.
4. **Sell price** = cost ÷ (1 − target margin). WCG furniture target is typically ~50% margin;
   use the margin the estimator/customer agreed for the job. `margin = (sell − cost) / sell`.

   | Target margin | Multiplier on cost (÷) |
   |---|---|
   | 50% | ÷ 0.50  (= cost × 2.00) |
   | 52% | ÷ 0.48  (= cost × 2.083) |
   | 55% | ÷ 0.45  (= cost × 2.222) |
   | 60% | ÷ 0.40  (= cost × 2.50) |

   Supplier-discount snapshot (read `Supplier Discounts.xlsx` live for the current figures — this
   is a convenience copy, last seen 2026-06-17): Aaron Desking 60%, Air Seating 55%, Alliance 58%,
   Allsfar 55%, Arrow 67.5%, Dams 62%, Deadgood 50%, Dynamic 62%, Elite Lockers 30%,
   Elite Office (via Wellworking) 52.5%, Frovi 50%, Fusion 10 nett, GoPak 20%, Gresham 60%,
   **Hawk 59%**, Identity (Furn 55% / Screens 60%), L&P 60%, Lavoro 50%, MDD 50%, Mobili 67.5%,
   Modus 45%, Moventi 60%, Ocee 57.5%, Origin nett, ORN 60%, Palmer Hamilton 62%, Pledge 56%,
   Quadrifoglio 60%, Rhubarb 48%, Steel Co 55%, Summit 58%, Tabilo nett, TC Group 60%, Verco 50%,
   Workstories 65%.

### Route B — bespoke item NOT on any price list

For a genuinely bespoke / made-to-order piece the supplier quotes a price directly (it won't be in
their list). Use the **cost and sell the supplier/estimator gives you** and skip the SharePoint
lookup. Record in the product/quote memo that it's bespoke and where the price came from.

> **Worked example (this skill's origin — 17 Jun 2026):**
> D-end Boardroom Table, Maple 1-piece top, twin pedestal silver base, 2600×1200×740mm.
> Supplier **Hawk Furniture**, their code **WESTCOUNTRY-31797**. Bespoke → Route B.
> Cost **£391.00**, sell **£821.10** → margin (821.10−391)/821.10 = **52.4%**.
> Code **NC17062601**.

## 3. Create the product

**Preferred — `create_product` MCP tool** (once deployed, §5):

```
create_product(
  productItemId="NC17062601",        # or omit + autoCode=true
  description="D-end Boardroom Table, Maple 1-piece top, twin pedestal silver base, 2600x1200x740mm",
  sellPrice=821.10,
  costPrice=391.00,
  manufacturer="Hawk Furniture",
  manufacturerReference="WESTCOUNTRY-31797",
  unitDescription="Each",
  categoryId="<match a comparable boardroom-table SKU via get_product_categories>",
  salesAnalysis="<copy from a comparable furniture SKU via get_product_detail>",
  extendedDescription="<optional product blurb>"
)
```

After creating, `get_product_detail(productItemId="NC17062601")` and confirm sell/cost/margin
persisted (watch for £0.00 — see the price-storage note in §5).

**Interim — if `create_product` is not yet deployed:** create the item in the Prospect web UI
(Products → New), entering the same fields, OR have the estimator create it. Then proceed to §4.

## 4. Put it on the quote

Use `add_quote_line` with the new code and explicit price/cost (see the `prospect-crm-create-quote`
skill for grouping, sequencing, and QuoteLineXtra colour/supplier fields):

```
add_quote_line(quoteId=<id>, groupId=<group>, productItemId="NC17062601",
  description="D-end Boardroom Table — Maple top, silver twin-pedestal base, 2600x1200x740mm",
  quantity=1, price=821.10, costPrice=391.00, sequence=<n>)
```

Then populate the QuoteLineXtra fields (Colour, Supplier, Supplier Code) per the create-quote skill.

## 5. Deploying `create_product` to the team (one-off, by Dale)

The tool handler lives in `src/tools/products.ts` (createProduct / updateProduct). Wire it in:

1. **Import** in `src/index.ts` (near the catalogue imports):
   `import { createProductSchema, createProduct, updateProductSchema, updateProduct } from "./tools/products.js";`
2. **Permission map** in `index.ts` (alongside `create_inventory`):
   `create_product: { module: "catalogue", action: "create" },`
   `update_product: { module: "catalogue", action: "edit" },`
3. **Register** with `registerWriteTool("create_product", "<desc>", createProductSchema.shape, async (args) => { ... createProduct(...) ... })` — copy the `create_inventory` block verbatim and swap names. Same for `update_product`.
4. **Permissions JSON** (`config/permissions.json` in dale-ctrl/prospect-mcp): there is no
   `catalogue` module yet, so add one to the `modules` array, add `catalogue` to the relevant
   users' `writeAllow`, and add a `catalogue: { create: true, edit: true }` permissions block
   (mirror how `inventory` is granted to DL). Permissions are fetched live from GitHub each
   restart, so this propagates to the team without a code pull. See `INTEGRATION.md` for the exact
   JSON. (Quick alternative if you don't want a new module: register under the existing `inventory`
   module instead — zero permissions changes, but semantically muddier.)
5. Build + ship per the WCG deploy lessons: `npm run build` → commit + push to `main` → tag
   `vX.Y.Z` + push tag → **create the GitHub Release** → on each teammate's machine
   `git pull` in `…/.claude/plugins/marketplaces/wcg-prospect` → fully restart Claude Desktop.
6. **Smoke test:** create one product, `get_product_detail` it, confirm sell/cost are non-zero.

> **Price-storage caveat to verify on first live create:** the handler POSTs
> `DecimalSellingPrice` / `DecimalCostPrice`. POST honours these on quote lines (`DecimalPrice`),
> so it should here too — but if a created product reads back at £0.00, switch the wrapper to the
> raw integer backing fields (`SellingPrice` × 10^`SellDecimals` + `SellDecimals`, and the matching
> `CostPrice` / `CostDecimals`), mirroring the PriceLists pattern in `pricing.ts`. The handler
> already flags this in its output if it detects a £0.00 round-trip.

## Pitfalls
- **Same-day collisions** — always look up existing `NC<DDMMYY>` codes before assigning `NN`
  (or use `autoCode=true`). Another user may have created items earlier today.
- **Wrong discount column** — check for `Nett price on list` and split rates in
  `Supplier Discounts.xlsx` before applying a flat %.
- **Margin vs markup** — WCG works to *margin* `(sell−cost)/sell`, not markup. £391 cost at 52%
  margin is £821.10 sell, NOT £391 × 1.52.
- **ProductItems key is a string** — `update_product` must PATCH `ProductItems('<code>')`, not a
  numeric id.
- **Don't put colour/finish in the product Description** if it'll vary per quote — keep the product
  generic and use the QuoteLineXtra Colour fields on the line (see create-quote skill).

## Changelog
- **2026-06-17 (v1)** — Initial skill. Created from the Marpool / Clyst Heath boardroom-table
  amendment (opps 14050 / 15672). Documents the NC naming convention + same-day sequential lookup,
  the SharePoint Furniture Price Lists + `#Supplier Discounts` pricing route, the bespoke
  (not-on-list) route, and the new `create_product` MCP tool (`src/tools/products.ts`) plus its
  deploy steps. Supplier-discount snapshot captured from `Supplier Discounts.xlsx`.
