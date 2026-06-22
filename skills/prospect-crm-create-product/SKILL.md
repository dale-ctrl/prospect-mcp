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
checking the item doesn't already exist, generating the code, pricing the item from the supplier
price list + discount, creating the ProductItem record, and **attaching a product image to Manage
Images**.

## When to use
- The item the customer wants is not already in the catalogue (the §1 duplicate check returns
  nothing for the supplier/manufacturer code or description).
- A quote needs a line for a bespoke item (a swapped finish, a special size, a made-to-order piece).

## 1. Check it doesn't already exist — ALWAYS do this first

**Never create a new product before searching for an existing one.** Many "bespoke" items have
already been set up by someone else — re-creating them spawns duplicate SKUs that fragment sales
history and clutter Dimensions. If a match already exists, **use that existing code** and skip
straight to the quote (§6).

Search in this order and stop at the first real match:

1. **Manufacturer product code (strongest signal).** Search the supplier's own reference:
   ```
   search_products(searchTerm="<manufacturerReference>")     # e.g. "WESTCOUNTRY-31797"
   ```
   Also check the manufacturer code on its own and with the manufacturer name
   (e.g. `Hawk WESTCOUNTRY-31797`). The same physical item from the same supplier = the same
   product, regardless of what NC code it was given.
2. **Description / model name.** Search distinctive words from the description
   (e.g. `D-end boardroom table twin pedestal`) in case it was set up under a different code with
   no manufacturer reference recorded.
3. **Inspect candidates.** For any hit, `get_product_detail(productItemId=...)` and confirm the
   manufacturer + manufacturer reference (and size/spec) genuinely match — not just a similar name.

Decision:
- **Match found** — use that existing SKU. Note it to Dale ("already exists as `NCxxxxxxxx` — using
  that"), confirm its price is still right for this job, and go to §6 (put it on the quote). Do not
  create anything new.
- **No match** — continue to §2.

> The duplicate check is also enforced server-side from v1.24.0: `create_product` refuses to make a
> second product with a manufacturer reference that already exists and returns the existing code
> instead (see §7b). The skill still searches first so Dale sees the match and can reuse it
> deliberately.

## 2. Generate the NC code

Format — **three parts, no separators**: `NC` + `DDMMYY` (today) + `NN` (2-digit daily sequence).

Examples on file: `NC27062401`, `NC18052601`, `NC13032502`, `NC01112402`.
For 17 June 2026 the first code of the day is `NC17062601`.

**Always look up what already exists today** so two people creating items on the same day don't
collide:

```
search_products(searchTerm="NC<DDMMYY>")        # e.g. "NC170626"
```

Take the highest trailing `NN` found and add 1 (zero-padded). If none exist, start at `01`.

> If the `create_product` MCP tool is deployed (see §7), pass `autoCode=true` and it does this
> lookup and assigns the next free number for you — preferred, as it closes the race window by
> re-checking on a clash.

## 3. Price the item

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
   e.g. list £1,000, supplier on 59% off — cost = 1000 × 0.41 = **£410.00**.
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
> Supplier **Hawk Furniture**, their code **WESTCOUNTRY-31797**. Bespoke — Route B.
> Cost **£391.00**, sell **£821.10** — margin (821.10 − 391)/821.10 = **52.4%**.
> Code **NC17062601**.

## 4. Create the product

**Preferred — `create_product` MCP tool** (deployed v1.21.0; fixes v1.22.0; duplicate guard v1.24.0):

```
create_product(
  productItemId="NC17062601",        # or omit + autoCode=true
  description="D-end Boardroom Table, Maple 1-piece top, twin pedestal silver base, 2600x1200x740mm",
  sellPrice=821.10,
  costPrice=391.00,
  manufacturer="Hawk Furniture",
  manufacturerReference="WESTCOUNTRY-31797",
  unitDescription="Each",
  categoryId="<defaults to STOCK if omitted; match a comparable SKU via get_product_categories>",
  salesAnalysis="<copy from a comparable furniture SKU via get_product_detail>",
  extendedDescription="<optional product blurb>"
)
```

Always pass `manufacturer` + `manufacturerReference` — they power the §1 duplicate check (and the
server-side guard) for the next person. If the manufacturer reference already exists in the
catalogue, the tool returns `duplicate: true` with the existing code instead of creating a second
SKU — that's the right outcome; reuse the existing code on the quote. Override with
`allowDuplicate=true` only for a genuine variant.

After creating, `get_product_detail(productItemId="NC17062601")` and confirm sell/cost/margin
persisted.

**Interim — if `create_product` is not yet deployed:** create the item in the Prospect web UI
(Products → New), entering the same fields, OR have the estimator create it. Then proceed to §5.

## 5. Find and attach a product image (Manage Images)

Goal: give the new NC product a picture in the **Manage Images** panel so it shows on quotes and is
recognisable in the catalogue. **Always show Dale the candidate image(s) and get approval before
anything is attached** — never auto-attach.

### 5.1 Build the best search query
Search most-specific first and stop at the first query that returns a clearly matching photo:

1. `manufacturer` + `manufacturerReference` — e.g. `Hawk Furniture WESTCOUNTRY-31797`. The
   supplier's own code is the strongest match.
2. Supplier/manufacturer + the product's range/model name from the description.
3. Description keywords without per-quote finishes — e.g. `D-end boardroom table twin pedestal`
   (drop "Maple", "silver" etc. unless the customer specifically wants that finish shown).

Prefer images from: the **supplier's own website / price-list PDF**, then a reputable reseller, then
general web image results. Aim for a clean product shot on a plain background, landscape, ≥ 600px on
the long edge, JPG or PNG.

> Use `WebSearch` to find candidates and `web_fetch` to open the supplier product page. Do **not**
> fetch images with curl/wget/other downloaders — if `web_fetch`/`WebSearch` can't reach a source,
> stop and tell Dale rather than working around it. (For a JS-heavy supplier site that returns an
> empty shell, switch to the Claude-in-Chrome tools to read the rendered page.)

### 5.2 Bespoke items (Route B) — expect no exact photo
Genuinely made-to-order pieces usually have **no exact image online**. In that case offer the
closest representative shot you can find (same range, same supplier, nearest size/config) and **say
plainly it's representative, not the exact item** when you present it. Do not invent or AI-generate
a photo.

### 5.3 Present candidates and wait for approval
Show Dale 1–3 candidates, each with a thumbnail/preview, the source URL, and a one-line note on why
it matches (and whether it's exact or representative). Then **wait**. Only proceed with the image he
picks. If he rejects all of them, leave Manage Images empty and note it — an empty panel is better
than a wrong picture on a bespoke item.

### 5.4 Attach the approved image
**Preferred — `upload_product_image` MCP tool** (deployed v1.24.0):

```
upload_product_image(
  productItemId="NC17062601",
  imageUrl="https://hawkfurniture.co.uk/.../westcountry-31797.jpg",   # server fetches it
  # OR imageBase64="<base64>", filename="NC17062601.jpg", contentType="image/jpeg"
)
```

The first image uploaded to a product becomes the **primary/main image automatically** — that
covers the common (new NC) case. Changing primary on a multi-image product still needs the web UI
for now (separate endpoint not yet wired).

Then confirm it landed: open the product's **Manage Images** panel in the web UI and eyeball it.

**Interim — if `upload_product_image` is not yet deployed:** save the approved image to the project
outputs folder, give Dale the file, and he drags it into **Manage Images → Manage Images** on the
product (Details tab, top-right). The skill should hand over the file rather than skip the image.

## 6. Put it on the quote

Use `add_quote_line` with the new (or existing, per §1) code and explicit price/cost (see the
`prospect-crm-create-quote` skill for grouping, sequencing, and QuoteLineXtra colour/supplier
fields):

```
add_quote_line(quoteId=<id>, groupId=<group>, productItemId="NC17062601",
  description="D-end Boardroom Table — Maple top, silver twin-pedestal base, 2600x1200x740mm",
  quantity=1, price=821.10, costPrice=391.00, sequence=<n>)
```

Then populate the QuoteLineXtra fields (Colour, Supplier, Supplier Code) per the create-quote skill.

## 7. The MCP tools that back this skill

### 7a. `create_product` / `update_product` (v1.21.0, fixes v1.22.0)
Handlers live in `src/tools/products.ts`. Wired into `src/index.ts` and gated by the `catalogue`
permission module (`create_product` → catalogue.create; `update_product` → catalogue.edit).
Permissions are fetched live from GitHub on each Claude Desktop restart, so module grants propagate
without a code pull.

> **ProductItem quirks (documented at the top of `src/tools/products.ts`, resolved v1.22.0):**
> 1. Composite primary key (`OperatingCompanyCode` + `ProductItemId`). POST body must include
>    both halves; `update_product` PATCH targets the full key URL
>    `ProductItems(OperatingCompanyCode='A',ProductItemId='<code>')`. The single-string-key form
>    returns HTTP 500.
> 2. Prices stored as integer-pounds × 10^decimals. The computed `Decimal*` fields are
>    `Computed="1"` + `UpdateVisibility="never"` — POST silently ignores them. The handler sends
>    raw `SellingPrice` × 10² + `SellDecimals=2` (and matching `CostPrice` / `CostDecimals`).
> 3. `UpdateVisibility="never"` governs PATCH, NOT POST. So sell / cost / category are
>    create-only; `update_product` can only flip `Obsolete` and edit text fields.
> 4. `CategoryId` is required on POST (server-side validation) — schema defaults to `"STOCK"`,
>    matching every existing WCG NC item.

### 7b. `create_product` duplicate guard (v1.24.0)
Before inserting, `create_product` searches for an existing ProductItem with the same
`ManufacturerReference` (and, when given, the same `Manufacturer`). If a match exists it returns
the existing `ProductItemId` + current sell/cost + a `duplicate: true` flag in the response text
rather than creating a second SKU. Overridable with `allowDuplicate=true` for the rare genuine
variant. This backstops the §1 skill step so a duplicate can't slip in even if the search was
skipped.

### 7c. `upload_product_image` (v1.24.0)
Third write handler in `src/tools/products.ts` for attaching an image to **Manage Images** (§5.4).

- **Endpoint** (confirmed via live DevTools capture 2026-06-22): bound OData action
  `POST /ProductItems('A','<code>')/UploadImage` with the **raw image bytes** as the request body
  and `Content-Type: image/<format>`. Not multipart, not a JSON wrapper, not a separate
  `ProductItemImages` collection. Composite key uses the **positional** form `('A','<code>')`
  here (matches what the web UI sends), distinct from the named form used by `update_product`'s
  PATCH. Both work for Prospect.
- **Schema** — `productItemId` (required), one of `imageUrl` **or** `imageBase64` (handler enforces
  exactly-one — Zod `.refine()` was dropped so the MCP wrapper's `.shape` access keeps working);
  optional `filename`, `contentType`.
- **Handler** — if `imageUrl` given, the server fetches the bytes; else decode `imageBase64`.
  Validates MIME (image/jpeg, image/png, image/gif, image/webp) and size (≤ 8 MB). POSTs via the
  new `client.postBinary()` helper which sets the Content-Type per call (the regular `client.post`
  forces `application/json`).
- **Permission map** — `upload_product_image: { module: "catalogue", action: "edit" }`. Reuses the
  catalogue/edit grant from 7a, so **no `config/permissions.json` change** beyond what 7a added.
- **`makePrimary` — intentionally NOT in the v1.24.0 schema.** The first image uploaded to a
  product becomes primary on Prospect automatically (covers the common new-NC case). Changing
  primary on a multi-image product needs a separate endpoint not yet captured; punted to a
  follow-up release.

## Pitfalls
- **Create-before-checking** — the §1 duplicate search is mandatory. Same item + same manufacturer
  reference = reuse the existing SKU, never a second one.
- **Same-day collisions** — always look up existing `NC<DDMMYY>` codes before assigning `NN`
  (or use `autoCode=true`). Another user may have created items earlier today.
- **Wrong discount column** — check for `Nett price on list` and split rates in
  `Supplier Discounts.xlsx` before applying a flat %.
- **Margin vs markup** — WCG works to *margin* `(sell − cost)/sell`, not markup. £391 cost at 52%
  margin is £821.10 sell, NOT £391 × 1.52.
- **ProductItems composite key** — `update_product` PATCHes
  `ProductItems(OperatingCompanyCode='A',ProductItemId='<code>')`, NOT
  `ProductItems('<code>')`. The latter returns HTTP 500 on this tenant.
- **Sell / cost / category are create-only** — `update_product` cannot change them
  (`UpdateVisibility="never"`). Use `create_product` (or the Prospect UI) to set the price.
- **Don't put colour/finish in the product Description** if it'll vary per quote — keep the product
  generic and use the QuoteLineXtra Colour fields on the line (see create-quote skill).
- **Never attach an image without Dale's OK** — always present candidates first (§5.3). On bespoke
  items, label representative shots as representative; an empty Manage Images panel beats a
  misleading photo.
- **Don't side-load images** — only fetch via `WebSearch`/`web_fetch` (or Claude-in-Chrome for
  rendered pages). No curl/wget/archive mirrors.

## Changelog
- **2026-06-22 (v2)** — Added §1 mandatory duplicate check (search manufacturer product code +
  description before creating; reuse the existing SKU if found) with a matching server-side guard in
  `create_product` (§7b, shipped v1.24.0). Added §5 "Find and attach a product image (Manage
  Images)": query strategy (supplier code → range → keywords), Route-B representative-image
  handling, mandatory show-and-approve gate before attaching, and the new `upload_product_image`
  MCP tool (with an interim manual-upload fallback). Endpoint shape confirmed via live DevTools
  capture: bound OData action `POST /ProductItems('A','<code>')/UploadImage` with raw image bytes
  as the body (not multipart, not a child collection). Renumbered sections (code → §2, price → §3,
  create → §4, image → §5, quote → §6, tools → §7).
- **2026-06-17 (v1)** — Initial skill. Created from the Marpool / Clyst Heath boardroom-table
  amendment (opps 14050 / 15672). Documents the NC naming convention + same-day sequential lookup,
  the SharePoint Furniture Price Lists + `#Supplier Discounts` pricing route, the bespoke
  (not-on-list) route, and the new `create_product` MCP tool (`src/tools/products.ts`) plus its
  deploy steps. Supplier-discount snapshot captured from `Supplier Discounts.xlsx`.
