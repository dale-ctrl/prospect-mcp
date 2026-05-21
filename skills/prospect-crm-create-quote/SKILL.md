---
name: prospect-crm-create-quote
description: >
  Create a Prospect CRM quote linked to an opportunity, with correct line pricing,
  customer-specific price recognition, preserved product descriptions, properly populated
  WCG QuoteLine custom fields (Colour, Colour (Extended), Supplier, etc.), and lines
  grouped into named sections. Trigger whenever the user asks to create, raise, build,
  or generate a quote against an opportunity, lead, or directly for a customer —
  especially WCG furniture, Versa, or interiors quotes with product codes, or any request
  mentioning quote lines with colour, finish, or supplier details. Also trigger for adding
  delivery / assembly / room-placement lines to a quote.
---

# Create a Quote in Prospect CRM

This skill is the **generic WCG quoting workflow** — applies to every customer, every supplier,
every product. Customer-specific, supplier-specific, and SKU-specific knowledge lives in the
quoting knowledge base and product notes (see "Knowledge taxonomy" below) and is retrieved at
Step 1 of every quote.

## WCG Environment Context

- **Prospect CRM** (prospect365.com) via the `prospect-crm` MCP — OData v1 API at
  `api-v1-westeurope.prospect365.com`.
- Salesperson code for Dale: `DL` (match the opp's salesperson if different).
- Key MCP tools used by this skill:
  - `get_opportunity` — pull opp context (company, contact, salesperson, value, situation summary)
  - `get_xtra_fields(entityType='LeadXtras', parentId=<opp>)` — **REQUIRED** — pull opp custom
    fields including Quote Template, Quote Due By, Delivery Type, and Quote Contact. Dropdown
    values now resolve to labels inline (MCP v1.13.0+) — Stored values prints
    `<Label> [<slug>]` for Waiting On, Delivery Type, and Quote Template.
  - `list_dropdown_options(field='leadXtraDropdown1|2|3')` — list all options for the LeadXtra
    Waiting On / Delivery Type / Quote Template dropdowns (MCP v1.13.0+). Useful when you need
    the full label-to-SKU mapping
  - `get_quoting_knowledge` — **REQUIRED** at Step 1 — pull all saved lessons; filter mentally
    by category (see Knowledge taxonomy)
  - `search_products` — searches across SKU, description, extended description, manufacturer
    reference, manufacturer name, AlternateRef1–4, and barcode. Returns matched products with
    Manufacturer and Mfr Ref inline so it's clear why each result hit
  - `get_product_detail` — full ProductItem record including saved product notes
  - `get_product_pricing` — catalogue + price band pricing
  - `search_sales_transactions(salesLedgerId=<account>)` — pull the customer's previous purchase
    history to verify any prices the user references and to spot products whose supplier may now
    be obsolete
  - `create_quote` — quote header. `priceExpiryDate` parameter (YYYY-MM-DD) defaults to today + 30
    days when omitted, matching the WCG rule
  - `add_quote_line_group` — create section headings. **REQUIRED** before adding any lines —
    see Step 4. Lines cannot be moved into a group afterwards (Pitfall 6)
  - `add_quote_line` — add lines. Always pass `groupId`
  - `update_quote_line` — update existing lines. Does NOT accept `productItemId` (can't swap SKUs
    — see Pitfall 9). Can clash with concurrent UI edits and return HTTP 500 (Pitfalls 1, 2)
  - `update_quote_line_xtra` — write QuoteLine custom fields (Colour, Supplier, etc.) — separate
    endpoint, no price recalc, accepts friendly labels
  - `get_xtra_fields(entityType='QuoteLineXtras', parentId=<lineId>)` — discover the slot-to-label
    map for the tenant
  - `update_quote` — update header fields including the memo and `priceExpiryDate` (use when
    lines change mid-build — Pitfall 11)
  - `get_quote` — verify final state. CRM Link is now absolute
    (`https://crm.prospect365.com/view/Quote/<id>`, MCP v1.13.0+)
  - `save_quoting_lesson(category=..., lesson=...)` — record learnings from corrections
  - `save_product_note(productName=..., note=...)` — record SKU-specific knowledge

## Knowledge taxonomy

At Step 1 always call `get_quoting_knowledge()`. The output is a flat list of lessons with a
`category` tag — filter mentally for the categories relevant to the quote at hand:

| Category | What lives there |
|---|---|
| `process` | Workflow rules (some of which are codified here in the skill) |
| `configuration` | Tenant-wide MCP / Prospect quirks (some codified here as Pitfalls) |
| `pricing` | Pricing rules, customer-specific price exceptions, discount rules |
| `customer-<account>` | Things specific to one customer, e.g. `customer-SBJ001` |
| `supplier-<name>` | Things specific to one supplier (e.g. defunct supplier, lead-time rules) |
| `product-<sku>` | Product-specific rules (also see `save_product_note`) |
| `general` | Anything that doesn't fit the above |

When you learn something during a session that future quotes need to know, save it with the
correct category. The skill should stay generic; specifics go in the knowledge base.

When you need SKU-level knowledge, also call `get_product_detail` — it surfaces any
`save_product_note` content under "Notes".

## Prerequisites

- A Prospect opportunity (LeadId) — preferred — OR at minimum a known ContactId.
- The user has stated the products required (SKUs and quantities), or these are in the opp's
  Situation Summary.
- For furniture / interiors quotes: the user has stated the delivery/assembly approach OR it's
  on the opp's LeadXtra Delivery Type field — or ask via AskUserQuestion.
- The user has confirmed the group structure for the quote (single group named after the
  project / room, OR multiple groups). See Step 2.

## Workflow Steps

### 1. Gather context up-front (run in parallel)

Always start with these calls in parallel — they minimise round-trips and the opp's Situation
Summary often contains the verbatim quote brief.

- `get_opportunity(leadId=<opp>)`
- `get_xtra_fields(entityType='LeadXtras', parentId=<opp>)`
- `get_quoting_knowledge()`
- `get_product_detail(productItemId=<sku>)` — one call per requested SKU; surfaces product notes
- `search_sales_transactions(salesLedgerId=<account>)` — customer's purchase history; cross-check
  any prices the user references and any products whose Manufacturer may now be obsolete

Read the opp's **Situation Summary** carefully. It commonly contains:
- Exact product codes, sizes, finishes (read these verbatim — don't paraphrase)
- Pricing sensitivity ("trust is sharp on the ££")
- Leadtime / deadline constraints
- The contact the quote should go to

Read the opp's **LeadXtras** carefully — these drive how the quote is built:

| LeadXtra slot | Label | What to do |
|---|---|---|
| StandardDateField1 | **Quote Due By** | Customer's expected quote date. If today is past it, flag in memo as "Late — quote due was YYYY-MM-DD". |
| StandardDropdownField2 | **Delivery Type** | If set, USE this — see "Delivery Type → SKU mapping" in Business Rules. Auto-derive the SKU when customer type is also known; only ask the user if either signal is missing or an edge-case SKU is needed. |
| StandardDropdownField3 | **Quote Template** | 7 print-layout options — see "Quote Template values" in Business Rules. Inherited onto the quote print layout (not the QuoteXtras row — that stays empty). |
| StandardSearchTextField1 | **Quote Contact** | Override the opp's Contact for the quote if Quote Contact is populated with someone different. |

LeadXtra dropdown slugs now resolve to labels inline (MCP v1.13.0+). The Stored values block
prints `<Label> [<slug>]` for Delivery Type, Quote Template, and Waiting On — no UI lookup
required. If you need the full options list (e.g. to map a label to a delivery SKU), call
`list_dropdown_options(field='leadXtraDropdown1|2|3')`.

When reviewing the `get_quoting_knowledge()` output, search specifically for `customer-<acct>`
entries for this customer and `supplier-<name>` entries for any supplier on the requested SKUs.

### 2. Clarify anything not stated, BEFORE creating the quote

Use AskUserQuestion (or the elicitation form when collecting multiple signals at once) to confirm:

- **Group structure** — what section heading(s) to use. Most quotes are a single group named
  after the project / room / item type ("Workstations", "Office Chairs", "Reception Refurb").
  Complex quotes have multiple groups. **Never skip this step** — flat un-grouped quotes are
  not WCG style, and lines cannot be moved into a group after creation (Pitfall 6).
- **Delivery / assembly approach** — derive automatically when BOTH signals are available:
   - The opp's Delivery Type LeadXtra resolves to one of "Delivery Only", "Delivery and
     Assembly", or "Delivery, Room Placement & Assembly", AND
   - The customer's education-vs-commercial status is derivable from their Division (Customer
     Type dropdown / Sector). Education = schools, academies, MATs, colleges, universities;
     commercial = everything else.
   When both are present, look up the SKU in the **Delivery Type → SKU mapping** table in
   Business Rules and proceed without asking. Fall back to elicitation when (a) either signal
   is missing, or (b) the customer needs one of the SKUs not covered by the 3 dropdown options
   (ROOM-PLACEMENT-E, CASUAL/ASSEM-E, ASSEMBLY & INSTALL).
- **Price of variable lines** (delivery, assembly, room placement, casual labour). These default
  to £0.00 in the catalogue. Ask what to charge.
- **Customer PO / project code** if relevant.

Do NOT ask about colour / finish / dimensions if they are already in the opp Situation Summary —
those are part of the brief.

Do NOT ask about Quote Template — that's set on the opp.

### 3. Create the quote header

```
create_quote(
  contactId=<from opp, or LeadXtra Quote Contact if populated>,
  leadId=<opp_id>,
  salesPersonId="DL",            # or the actual opp salesperson code
  memo="Quote raised against Opp <id>. <pricing sensitivity, leadtime, agreed pricing>"
)
```

Notes:
- When `leadId` is supplied, the quote description is **auto-copied from the opp**. Do NOT pass
  a separate `description` argument — it will be ignored.
- contactId, company, and delivery address are pulled automatically from contact + opp linkage.
- Always set `salesPersonId` explicitly.
- **Price Expiry** auto-defaults to (today + 30 days) per the WCG rule. Override via the
  `priceExpiryDate` parameter (YYYY-MM-DD) if needed. (Resolved by MCP v1.12.x — see Pitfall 7.)

### 4. Create the group(s) FIRST — with display toggles set per the opp's Quote Template

Before adding any lines, create the section headings via `add_quote_line_group`. Capture the
returned `GroupId` — you'll need it on every line.

**Every group on the quote MUST have its display toggles set to match the opp's Quote Template**
(LeadXtra StandardDropdownField3). Apply the same toggle settings to every group on a multi-group
quote — the Quote Template is a single value per opp.

Mapping rules:

- Template contains "Itemised" → `showPriceColumn = true`
- Template contains "Non Itemised" → `showPriceColumn = false`
- Template contains "Subtotalled" → `showSubtotal = true`
- Template does NOT contain "Subtotalled" → `showSubtotal = false`

`(no grand totals)` is a quote-HEADER concern — ignore it at the group level.

Full mapping for the 7 WCG Quote Template values:

| Quote Template | showPriceColumn | showSubtotal |
|---|---|---|
| Itemised | `true` | `false` |
| Itemised (no grand totals) | `true` | `false` |
| Itemised and Subtotalled | `true` | `true` |
| Itemised and Subtotalled (no grand totals) | `true` | `true` |
| Non Itemised | `false` | `false` |
| Non Itemised and Subtotalled | `false` | `true` |
| Non Itemised and Subtotalled (no grand totals) | `false` | `true` |

**Always pass these toggles explicitly — do NOT rely on wrapper defaults** (see Pitfall 14).

Example for "Itemised" template:

```
add_quote_line_group(
  quoteId=<id>,
  title="Workstations",
  sequence=10,
  showPriceColumn=true,    # template is "Itemised"
  showSubtotal=false       # template does NOT contain "Subtotalled"
)  # returns GroupId
```

Multi-group quote with the same opp-level Quote Template applied to every group:

```
add_quote_line_group(quoteId=..., title="Workstations",       sequence=10, showPriceColumn=true, showSubtotal=false)
add_quote_line_group(quoteId=..., title="Seating",            sequence=20, showPriceColumn=true, showSubtotal=false)
add_quote_line_group(quoteId=..., title="Storage",            sequence=30, showPriceColumn=true, showSubtotal=false)
add_quote_line_group(quoteId=..., title="Delivery & Install", sequence=40, showPriceColumn=true, showSubtotal=false)
```

**Why this matters:** `update_quote_line` does not expose a `groupId` parameter, and
`delete_quote_line` is **disabled** on the WCG tenant. So if you add lines without a `groupId`,
there is NO way to move them into a group via the MCP — the user has to drag them in via the UI.
The same UI-only escape applies to toggle fixes (see Pitfall 14).

### 5. Add each product line at creation time

Before each `add_quote_line` call, **state in chat what you're about to add** — this gives the
user the chance to pause if they're editing the quote concurrently in the UI (Pitfall 1).

```
add_quote_line(
  quoteId=<id>,
  groupId=<from step 4>,         # ALWAYS pass this
  productItemId="<SKU>",
  description="<line description, including colour/frame summary>",
  quantity=<qty>,
  price=<USER-SPECIFIED OR EXPECTED PRICE>,
  costPrice=<from product detail>,
  sequence=<n>                   # 10, 20, 30, ... (leave gaps for inserts)
)
```

**Critical:**
- Always pass `groupId` — see Step 4 / Pitfall 6.
- Always pass `price` and `costPrice` explicitly. Catalogue price is a default; the user may
  want a different price (or a customer-specific price from sales history).
- After adding lines, **always call `get_quote` and verify every line's quantity** — see
  Pitfall 8 (quantity-0.002 bug).

When `productItemId` is supplied, the server will auto-copy the product's `WebExtendedDescription`
into the line's `ExtendedDescription`. PRESERVE IT — see Pitfall 3.

### 6. Add delivery / assembly line

Use the SKU from the **Delivery Type → SKU mapping** in Business Rules — derived from the opp's
LeadXtra Delivery Type label + the customer's education-vs-commercial status. Only ask the user
when one of those signals is missing or an edge-case SKU is needed.

Always set `price` explicitly even if £0.00, otherwise it pulls as null.

The delivery line can sit at the bottom of the main group OR in its own "Delivery & Install"
group — confirm with the user when discussing grouping in Step 2.

### 7. Populate QuoteLine custom fields via `update_quote_line_xtra`

For furniture / Versa / interiors quotes, populate the relevant custom fields:

```
update_quote_line_xtra(
  lineId=<line>,
  fields={
    "Colour": "<short value>",
    "Colour (Extended)": "<full spec>",
    "Supplier": "<supplier name>",
    "Supplier Code": "<MfrRef>"
  }
)
```

Separate endpoint from `update_quote_line` — does NOT trigger price recalc. Safe to call freely.

Use `get_xtra_fields(entityType='QuoteLineXtras', parentId=<lineId>)` first if you need to
confirm which slots are configured on the tenant.

### 8. Verify with `get_quote`

ALWAYS call `get_quote(quoteId=<id>)` at the end to confirm:
- Each line's actual price matches expected
- **Each line's quantity matches expected** (catch the 0.002 bug — Pitfall 8)
- Each line is in the correct group
- Total Net / Gross / Margin look right
- The right delivery / assembly line is present, with the agreed charge
- **Price Expiry** is set to (created date + 30 days) — auto-defaults, but verify
- CRM Link prints as `https://crm.prospect365.com/view/Quote/<id>` (absolute, MCP v1.13.0+)

If a value differs from what was passed in, FLAG IT — don't silently override. The user may
be editing the quote in the UI concurrently (Pitfall 1).

### 9. Capture any learnings

If during the session the user corrected you, or you discovered something about a customer /
supplier / product / process that future quotes need to know, save it BEFORE ending the session:

- Process or configuration learnings → `save_quoting_lesson(category='process'|'configuration', lesson=...)`
- Customer-specific facts → `save_quoting_lesson(category='customer-<account>', lesson=...)`
- Supplier-specific facts → `save_quoting_lesson(category='supplier-<name>', lesson=...)`
- Product-specific facts → `save_product_note(productName='<SKU> — <desc>', note=...)`

Keep these entries factual and dated. Add the originating opp/quote ID for traceability.

## Known Pitfalls

### Pitfall 1 — Concurrent UI edits can change OR add to the quote

The user often has the quote open in Prospect while Claude is working on it via the MCP. This
manifests in two ways:

1. **Field values change unexpectedly between calls** — most commonly a price changing because
   the user typed a new one in the UI. Don't invent server-side explanations (price bands,
   automation, recalc) without evidence.

2. **Whole new lines appear that you didn't add** — the user added them manually in the UI
   while you were working. If `get_quote` returns more lines than you expect, the most likely
   explanation is concurrent manual addition.

**Mitigation:**
- BEFORE every `add_quote_line` or `update_quote_line` call, state in chat what you're about
  to do ("Adding line for NCxxx, qty 2, £xx.xx"). This gives the user a chance to wait.
- After any unexpected change between calls, STOP and ask the user "I see line N is now X —
  did you change that, or do you want it reset?" BEFORE attempting to override.
- If unexpected duplicate lines appear, list them clearly to the user with their LineIds and
  ask which to keep. Don't try to delete via MCP (delete is blocked — see Pitfall 9).

### Pitfall 2 — `update_quote_line` HTTP 500 errors

`update_quote_line` can return HTTP 500 errors, most commonly when the line is being
concurrently edited in the CRM UI, or when the payload lacks fields the server expects to be
present.

**Mitigation:**
- Set ALL line metadata (description, quantity, price, cost, groupId) AT CREATION TIME via
  `add_quote_line` to minimise the need for subsequent updates.
- For custom fields, use `update_quote_line_xtra` — separate endpoint, simpler payload.
- If `update_quote_line` 500s, retry once with the full set of fields (price, costPrice,
  quantity, description) populated. If it still errors, pause and confirm with the user.

### Pitfall 3 — `ExtendedDescription` is the product blurb — do NOT overwrite

When `productItemId` is supplied to `add_quote_line`, the server copies the product's
`WebExtendedDescription` into the line's `ExtendedDescription`. This text belongs to the
product. **Do not put colour / finish / supplier info into ExtendedDescription** — use the
dedicated QuoteLineXtra custom fields instead.

### Pitfall 4 — `get_product_detail` does not surface `WebExtendedDescription`

The MCP's `get_product_detail` response omits `WebExtendedDescription`. If you need to see
what blurb will auto-populate:
- Add the line first, then read it back via `get_quote`, OR
- Ask the user to check the product's "Web Extended Description" field in Prospect.

### Pitfall 5 — Colour belongs in `Colour (Extended)`, not the description

WCG quote lines have dedicated colour custom fields. NEVER cram colour / finish into the
line description or ExtendedDescription — the description carries into Access Dimensions
sales orders, and ExtendedDescription belongs to the product.

- Short colour value → `Colour` (StandardTextField1), e.g. "Beech / Black"
- Full colour spec  → `Colour (Extended)` (StandardMemoField3), e.g. "Beech tops, black frame"

### Pitfall 6 — Lines CANNOT be moved into a group after creation

`update_quote_line` does NOT expose `groupId`, and `delete_quote_line` is **disabled** on the
WCG tenant. So once a line is created without a `groupId`, there is NO programmatic way to
assign it to a group — the user has to drag it in manually.

**Mitigation:**
- ALWAYS create the group(s) FIRST via `add_quote_line_group` (Step 4).
- ALWAYS pass `groupId` to every `add_quote_line` call (Step 5).
- Confirm the group structure with the user up-front via AskUserQuestion (Step 2).

### Pitfall 7 — RESOLVED — Price Expiry now settable via the MCP (v1.12.x+)

The MCP's `create_quote` and `update_quote` tools accept a `priceExpiryDate` parameter
(YYYY-MM-DD format) that writes to `Quote.EndDate` — the column behind "Price Expiry" on the
Quote header. When omitted on `create_quote`, defaults to today + 30 days at 12:00 UTC, matching
the WCG rule that prices are held for 30 days.

**Still true — `orderDueDate` is a trap.** `update_quote(orderDueDate=...)` maps to the
deprecated `donotuse_orderduedate` column, NOT the Price Expiry field. The write succeeds but
the value never appears in the UI. Always use `priceExpiryDate` for the UI's "Price Expiry".

(Previously documented as "Price Expiry cannot be set via the MCP" — out of date as of v1.12.x.)

### Pitfall 8 — `add_quote_line` quantity-0.002 bug

For certain SKUs, `add_quote_line` with `quantity=N` (integer) returns the line with
`Quantity = 0.00N`. This is product-specific (not all SKUs) — hypothesis is a per-product
`UnitDecimals` / `QuantityDecimals` setting being mis-interpreted as a divisor.

**Mitigation:**
- Always run `get_quote` after adding lines and eyeball every line's quantity.
- If a line shows `0.00N` where it should be `N`, repair via:
  ```
  update_quote_line(lineId=..., quantity=N, price=..., costPrice=..., description=...)
  ```
  Pass the full set per Pitfall 2. `update_quote_line` reliably accepts integer quantities.

### Pitfall 9 — Cannot change the SKU on an existing line; cannot delete via MCP

`update_quote_line` does NOT accept `productItemId`, so a line's SKU is fixed at creation
time. `delete_quote_line` is **disabled** on this tenant. So a SKU swap = add a new line +
ask the user to delete the old one manually.

**Mitigation when swapping a SKU:**
1. State the swap clearly in chat ("Swapping SKU A → SKU B on this line").
2. Add the new line via `add_quote_line` with `groupId=<same group>` and `sequence=<same as old line>`
   so it lands in the right place.
3. Tell the user the LineId of the old line and ask them to delete it in the UI:
   *"Please delete LineId X in Prospect (right-click on the line → Delete, or use the trash
   icon). The MCP can't do this."*
4. After they confirm deletion, re-run `get_quote` to verify only one line remains for that
   product.

### Pitfall 10 — Quantity semantics differ between SKUs that look interchangeable

Some "back-to-back" / "pod" / "bench" SKUs are sold per workstation; others are sold per
complete back-to-back assembly. Two products that look like substitutes can therefore need
DIFFERENT quantities to produce the same end result.

**Mitigation:**
- Before swapping a line's SKU, call `get_product_detail` on the new SKU and read its product
  note (saved via `save_product_note`) for quantity semantics.
- Don't blindly carry the old line's qty across. Re-derive qty from what the customer actually
  wants (e.g. "a pod for 2 workstations") and the SKU's unit definition.

### Pitfall 11 — Memo doesn't auto-refresh when lines change

The quote memo is a free-text field written at create time. When you swap a line, add a line,
or change a price mid-build, the memo will still reference the previous state.

**Mitigation:** when the line-up changes materially during a session, also call
`update_quote(quoteId=..., memo="<refreshed text>")` so the memo accurately reflects what's
on the quote now. Especially important for SKU swaps, supplier changes, and price overrides.

### Pitfall 12 — Sequence-on-replacement

When adding a replacement line via Pitfall 9's workflow, set `sequence` to match the line
being replaced so the new line lands in the same display slot. Otherwise the quote re-orders
mid-build and the user has to drag lines around in the UI.

### Pitfall 13 — RESOLVED in v1.16.0 — `update_quote_line` price clobbering

Until MCP v1.16.0, `update_quote_line(lineId=..., price=X, ...)` would either:

- **Silently revert** the line's price to the product's catalogue value (originally observed
  2026-05-19 on quote 15493 / Grenfell Hall with VCARRIAGEMOB — a £0-catalogue carriage SKU
  whose £700 update reverted to £0), OR
- **Return HTTP 500** ("An error occurred") with no body detail (observed 2026-05-21 on quote
  15521 / Drayton Manor with Y15607 — £337.11 catalogue / £100 attempted update).

Both failure modes traced to the same root cause: the wrapper PATCHed the OData `Decimal*`
computed fields, which the server either re-derives from catalogue or rejects outright.

**Fixed in MCP v1.16.0** — `update_quote_line` now PATCHes the raw integer backing fields
`Price` (pounds × 100, Int64), `Discount` (percentage × 100, Int32), and `CostPrice`
(pounds × 100, Int64) instead. The raw fields persist cleanly through the server's
post-write recalc on every product-linked line tested, including £0-catalogue carriage SKUs.
No follow-up call needed.

`add_quote_line` still POSTs `DecimalPrice` directly (POST honours it), with a follow-up
PATCH for discount only — see Pitfall 15.

### Pitfall 14 — No `update_quote_line_group` writer; `add_quote_line_group` defaults not honoured

Two related gaps observed on quote 15518 (2026-05-21, Hampton School):

1. **Defaults don't apply at create time.** `add_quote_line_group` documents `showPriceColumn`
   and `showSubtotal` as defaulting to `true`, but groups created without explicit values came
   through with both toggles OFF in the UI. **Always pass them explicitly** per the Step 4
   mapping.
2. **No `update_quote_line_group` MCP writer.** If a group's toggles are wrong after creation
   there is no way to fix them programmatically — the user has to do it in the UI: click the
   group title row → toggle the relevant Output Format Settings → Save.

**Mitigation:**
- Set toggles correctly at `add_quote_line_group` time using the Step 4 mapping.
- If you spot a toggle mismatch mid-session via `get_quote`, tell the user the GroupId and
  which toggles to flip, ask them to fix it in the UI, then re-verify with `get_quote`.

**ACTIONABLE for MCP repo:** add `update_quote_line_group(groupId, title?, sequence?,
showPriceColumn?, showSubtotal?, showDiscount?, showSeparateTotals?, showDiscountInSubtotal?,
newPage?, newTable?)` — the UI dialog exposes all those toggles so the underlying API endpoint
accepts them.

### Pitfall 15 — RESOLVED in v1.16.0 — `discountPercentage` silently dropped

Until MCP v1.16.0, both `add_quote_line(discountPercentage=N)` and
`update_quote_line(discountPercentage=N)` returned success but the line came back with
`DecimalDiscountPercentage=0`. Discovered 2026-05-21 on quote 15521 (Drayton Manor — 5% volume
discount on Option 2 silently dropped). Empirical probing confirmed the WCG tenant's server-
side automation zeroes `DecimalDiscountPercentage` on every POST regardless of headers tried,
and rejects PATCH on the field outright with HTTP 500.

**Fixed in MCP v1.16.0** — the wrapper now writes the raw `Discount` Int32 backing field
(percentage × 100) via a follow-up PATCH on `add_quote_line`, and via direct PATCH on
`update_quote_line`. The raw field bypasses the recalc and the 500 cleanly. The
`discountPercentage` parameter on both tools now works.

No manual UI step needed for line discounts. The `discountPercentage` arg behaves as documented.

### Default pricing rule — SKU prefix

- **SKUs starting with `Y`** (e.g. `Y100323`) → use the **standard catalogue price** from the
  product record. The user may override; if no override stated, default to catalogue.
- **Other SKU prefixes** → no automatic rule. Ask the user what price to apply unless they
  already told you OR a saved quoting lesson covers it OR the customer's sales history shows
  a recent agreed price.
- **Customer-specific prices** — when the user references a previous sale ("we charged them £X
  last time"), verify via `search_sales_transactions(salesLedgerId=<acct>, productItemId=<sku>)`
  and use the verified price.

### Flag obsolete-supplier products

WCG carries SKUs from suppliers who have since gone out of business or been discontinued.
At Step 1:

- Check `get_quoting_knowledge()` for any `supplier-<name>` lessons.
- For every SKU on the brief, `get_product_detail` and read the `Manufacturer` field.
- If a Manufacturer is flagged in the knowledge base as defunct, surface alternatives from
  active suppliers, capture the swap in the quote memo, and tell the user explicitly.
- After the session, if you discovered a new defunct supplier or a new viable alternative,
  save a `supplier-<name>` lesson so future quotes catch it.

### WCG Service Codes (delivery, assembly, room placement)

| Code | Description | Notes |
|---|---|---|
| `DELIVERY-E-1` | Delivery only — to your school, no charge | Stock item |
| `DELIVERY-C` | Delivery / Carriage Charge | Use when delivery is chargeable |
| `DEL&ASSEM-E-1` | Delivery + assembly, ground floor only | Stock item |
| `DEL&ASSEM-C` | Delivery + assembly, commercial | |
| `ROOM-PLACEMENT-E` | Delivery + room placement (no assembly) | |
| `DEL,RP&ASSEM-E-1` | Delivery, room placement, AND assembly | Full white-glove |
| `DEL,RP&ASSEM-C` | Delivery, room placement, AND assembly, commercial | |
| `CASUAL/ASSEM-E` | Casual labour — assembly | When assembly is contracted out |
| `ASSEMBLY & INSTALL` | Assembly & install (combined) | |

The opp's LeadXtra **Delivery Type** dropdown maps to a subset of these — see "Delivery Type
→ SKU mapping" below. For SKUs outside the mapping (ROOM-PLACEMENT-E, CASUAL/ASSEM-E,
ASSEMBLY & INSTALL) fall back to asking the user.

### Delivery Type → SKU mapping (LeadXtra StandardDropdownField2)

When the opp's Delivery Type label is set AND the customer's education-vs-commercial status is
known, auto-derive the delivery SKU from this table:

| Delivery Type label | Education (-E) | Commercial (-C) |
|---|---|---|
| Delivery Only | DELIVERY-E-1 | DELIVERY-C |
| Delivery and Assembly | DEL&ASSEM-E-1 | DEL&ASSEM-C |
| Delivery, Room Placement & Assembly | DEL,RP&ASSEM-E-1 | DEL,RP&ASSEM-C |

Customer type comes from the Division's Customer Type / Sector dropdown — education = schools,
academies, MATs, colleges, universities; commercial = everything else.

These 3 dropdown options don't cover every WCG service code. For edge cases
(ROOM-PLACEMENT-E, CASUAL/ASSEM-E, ASSEMBLY & INSTALL) fall back to asking the user via
elicitation.

### Quote Template values (LeadXtra StandardDropdownField3)

7 print-layout options on this tenant:
- Itemised
- Itemised (no grand totals)
- Itemised and Subtotalled
- Itemised and Subtotalled (no grand totals)
- Non Itemised
- Non Itemised and Subtotalled
- Non Itemised and Subtotalled (no grand totals)

Read via `get_xtra_fields(LeadXtras)` — the label resolves inline (MCP v1.13.0+). The setting
drives the printed quote PDF's layout; it does not write back to QuoteXtras on the new quote.

When the template is "Subtotalled" (any variant), grouping discipline matters even more — the
customer only sees group subtotals, so group names and pricing balance per group is what they
see. Discuss group structure with the user explicitly in Step 2.

### Waiting On values (LeadXtra StandardDropdownField1)

2 options:
- Waiting on Customer
- Waiting on Supplier

Use as context in the quote memo if populated.

### Opportunity LeadXtra field map (WCG tenant)

| LeadXtra slot | Label | Use |
|---|---|---|
| StandardDateField1 | Quote Due By | Flag in memo if today > this date |
| StandardDropdownField1 | Waiting On | Context for memo (2 options — see above) |
| StandardDropdownField2 | Delivery Type | Pre-select delivery SKU via mapping table |
| StandardDropdownField3 | **Quote Template** | Drives per-group display toggles (showPriceColumn / showSubtotal) — see Step 4 for the full mapping. |
| StandardSearchTextField1 | Quote Contact | Override opp Contact for the quote if populated |
| StandardFlagField1 | Exclude from Forecast | Don't reference unless asked |

### QuoteLineXtra custom field map (WCG tenant)

| Field label | Slot | Column |
|---|---|---|
| Colour | StandardTextField1 | x_365_custom_text_1 |
| Supplier Code | StandardTextField2 | x_365_custom_text_2 |
| Supplier | StandardTextField3 | x_365_custom_text_3 |
| Supplier Notes | StandardMemoField1 | x_365_custom_memo_1 |
| Dimensions | StandardMemoField2 | x_365_custom_memo_2 |
| Colour (Extended) | StandardMemoField3 | x_365_custom_memo_3 |
| Minimum Order Qty | StandardDecimalField1 | x_365_custom_decimal_1 |
| Box Price | StandardDecimalField2 | x_365_custom_decimal_2 |
| Deleted | StandardFlagField1 | x_365_custom_flag_1 |

### Salesperson code

Dale's user code is `DL`. Use this on `create_quote` unless the opportunity is owned by a
different salesperson — in which case match the opp's salesperson code.

### Quote memo content

Populate the memo with context that will be useful when the quote is reviewed later:
- The opp number being quoted against
- Pricing context from the situation summary
- Leadtime / delivery deadlines, including a "Late — quote due was YYYY-MM-DD" flag if past
  the Quote Due By date
- Any obsolete-supplier swaps with the replacement SKUs and reason
- Any non-obvious pricing decisions
- Any items where finish / fabric / colour is TBC

If the line-up changes mid-build, refresh the memo via `update_quote(memo=...)` — Pitfall 11.

## Verification

End every quote-creation session with:

1. `get_quote(quoteId=<id>)` — confirm prices, quantities, groups, totals, delivery line,
   and **Price Expiry** (auto-defaults to created + 30 days). CRM Link should print as
   `https://crm.prospect365.com/view/Quote/<id>` (absolute URL, MCP v1.13.0+).
2. `get_xtra_fields(entityType='QuoteLineXtras', parentId=<lineId>)` for any line you set
   custom fields on — confirm stored values are correct.
3. Save any new learnings via `save_quoting_lesson` (correct category) or `save_product_note`
   — Step 9.

## Changelog

- **2026-05-21 (v5)** — Pitfalls 13 and 15 RESOLVED in MCP v1.16.0. The WCG tenant's
  server-side QuoteLines write-path was clobbering both price and discount via two related
  failure modes: (a) POST zeroes `DecimalDiscountPercentage` regardless of headers tried
  (probed 5 Prefer variants — none worked), and (b) PATCH on any `Decimal*` computed field
  returns HTTP 500. Original Pitfall 13 framing ("silent revert to catalogue") matched the
  2026-05-19 Grenfell Hall observation; current observation on Y15607 (£337.11 catalogue) is
  HTTP 500 — both behaviours documented and now bypassed. Fix: switch `update_quote_line` to
  PATCH the raw integer backing fields (`Price` / `Discount` / `CostPrice`, each × 100 scale),
  and add a follow-up PATCH on `add_quote_line` for the `Discount` field when discount > 0.
  `discountPercentage` parameter on both tools now works. End-to-end smoke-tested against
  quote 15521. Discovered during opp 15503 / quote 15521 (Drayton Manor High School).
- **2026-05-21 (v4)** — Codified Quote Template → group display-toggle mapping at Step 4
  ("Itemised" → showPriceColumn=true; "Non Itemised" → showPriceColumn=false; "Subtotalled" →
  showSubtotal=true; combinations read literally). Applies to every group on a quote. Added
  Pitfall 14 covering (a) no `update_quote_line_group` MCP writer and (b)
  `add_quote_line_group` toggle defaults coming through OFF despite documented `true`. Always
  set toggles explicitly. Updated the LeadXtra field map row for Quote Template to reference
  Step 4. Discovered during opp 15510 / quote 15518 (Hampton School).
- **2026-05-21 (v4)** — Updated for MCP v1.12.x and v1.13.0 capabilities (Cowork retrospective
  from opp 15502 / quote 15512 — The Stonehenge School):
  * `get_xtra_fields(LeadXtras)` now resolves dropdown slugs to human labels inline (Waiting On,
    Delivery Type, Quote Template). Removed the outdated workaround that required creating the
    quote just to see Quote Template's value (it didn't actually inherit onto QuoteXtras).
  * `list_dropdown_options` now accepts `leadXtraDropdown1|2|3`. Added to tool inventory.
  * Added **Delivery Type → SKU mapping** table in Business Rules. Skill now auto-derives the
    delivery SKU when Delivery Type label + customer type are both available — only falls back
    to elicitation when either is missing or an edge-case SKU is needed (ROOM-PLACEMENT-E,
    CASUAL/ASSEM-E, ASSEMBLY & INSTALL).
  * Quote Template documented as having 7 print-layout options (was previously stated as 2 —
    Itemised vs Subtotalled — which was wrong/incomplete).
  * Waiting On documented as 2 options (Customer / Supplier).
  * Marked Pitfall 7 as RESOLVED — Price Expiry IS settable via `priceExpiryDate` param on
    `create_quote` / `update_quote` since v1.12.x; defaults to today + 30 days on create.
    Removed the "remind user to set Price Expiry in UI" Step 9 and Verification step 3 (both
    now obsolete). The `orderDueDate` trap warning is retained.
  * CRM Links now absolute (`https://crm.prospect365.com/view/...`) by default — no manual
    prefixing needed downstream. Updated Verification to confirm absolute URLs print correctly.
  * Service Codes table extended with `DEL&ASSEM-C` and `DEL,RP&ASSEM-C` (commercial variants).
  * Renumbered Step 10 (Capture learnings) → Step 9 after removing the Price Expiry reminder.

- **2026-05-18 (v3)** — Reorganised knowledge layering. Stripped all customer/supplier/SKU
  specifics from the skill (these now live in `save_quoting_lesson` with `customer-<acct>` /
  `supplier-<name>` / `product-<sku>` categories, plus `save_product_note` for SKU-level
  facts). Added Knowledge Taxonomy section. Updated `search_products` description to reflect
  the enhanced wrapper (now searches MfrRef, Manufacturer name, ExtendedDescription,
  AlternateRef1–4, Barcode). Added Pitfalls 9 (can't change SKU on existing line; can't
  delete via MCP), 10 (qty semantics differ between substitute SKUs), 11 (memo doesn't
  auto-refresh on swap), 12 (sequence-on-replacement). Reinforced Pitfall 1 to cover
  duplicate-line scenarios from concurrent UI edits and added the "state-before-write"
  mitigation. Added Step 10 (capture learnings). Generic obsolete-supplier rule now points
  at the knowledge base rather than hardcoding any specific supplier.
- **2026-05-15 (v2)** — Major update from retrospective on a workstations quote session.
  Added mandatory grouping workflow (Step 4 + Pitfall 6), LeadXtras context pull at Step 1
  with Quote Template / Quote Due By / Delivery Type / Quote Contact field map, Price
  Expiry MCP gap (Pitfall 7), `add_quote_line` quantity-0.002 bug (Pitfall 8),
  obsolete-supplier flag rule, customer-specific price verification via
  `search_sales_transactions`. Pitfalls 1–5 retained.
- **(prior)** — Initial skill covering opp linkage, line pricing, QuoteLineXtra mapping,
  ExtendedDescription preservation, and concurrent-edit pitfalls.
