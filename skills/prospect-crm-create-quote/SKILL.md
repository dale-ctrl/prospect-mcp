---
name: prospect-crm-create-quote
description: >
  Create a Prospect CRM quote linked to an opportunity, with correct line pricing, customer-specific
  price recognition, preserved product descriptions, properly populated WCG QuoteLine custom
  fields (Colour, Colour (Extended), Supplier, etc.), and lines grouped into named sections.
  Trigger whenever the user asks to create, raise, build, or generate a quote against an
  opportunity, lead, or directly for a customer — especially WCG furniture, Versa, or interiors
  quotes with product codes, or any request mentioning quote lines with colour, finish, or
  supplier details. Also trigger for adding delivery / assembly / room-placement lines to a quote.
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
    fields including Quote Template (Itemised vs Subtotalled), Quote Due By, Delivery Type,
    and Quote Contact
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
  - `create_quote` — quote header
  - `add_quote_line_group` — create section headings. **REQUIRED** before adding any lines —
    see Step 4. Lines cannot be moved into a group afterwards (Pitfall 6)
  - `add_quote_line` — add lines. Always pass `groupId`
  - `update_quote_line` — update existing lines. Does NOT accept `productItemId` (can't swap SKUs
    — see Pitfall 9). Can clash with concurrent UI edits and return HTTP 500 (Pitfalls 1, 2)
  - `update_quote_line_xtra` — write QuoteLine custom fields (Colour, Supplier, etc.) — separate
    endpoint, no price recalc, accepts friendly labels
  - `get_xtra_fields(entityType='QuoteLineXtras', parentId=<lineId>)` — discover the slot-to-label
    map for the tenant
  - `update_quote` — update header fields including the memo (use when lines change mid-build —
    Pitfall 11)
  - `get_quote` — verify final state
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
| StandardDropdownField2 | **Delivery Type** | If set, USE this — do not re-ask the user which service tier they want. |
| StandardDropdownField3 | **Quote Template** | Itemised → every line prints its own price. Subtotalled → only group subtotals print. Inherited onto the quote header as "Opportunity Custom Fields Quote Template". |
| StandardSearchTextField1 | **Quote Contact** | Override the opp's Contact for the quote if Quote Contact is populated with someone different. |

`list_dropdown_options` is scoped to Division dropdowns only on this tenant, so LeadXtra dropdown
FK slugs can't be resolved to labels via the MCP. To see the human label, create the quote and
call `get_quote` — the inherited "Opportunity Custom Fields Quote Template" appears as a plain
string on the quote header.

When reviewing the `get_quoting_knowledge()` output, search specifically for `customer-<acct>`
entries for this customer and `supplier-<name>` entries for any supplier on the requested SKUs.

### 2. Clarify anything not stated, BEFORE creating the quote

Use AskUserQuestion to confirm:

- **Group structure** — what section heading(s) to use. Most quotes are a single group named
  after the project / room / item type ("Workstations", "Office Chairs", "Reception Refurb").
  Complex quotes have multiple groups. **Never skip this step** — flat un-grouped quotes are
  not WCG style, and lines cannot be moved into a group after creation (Pitfall 6).
- **Delivery / assembly approach** if not stated AND not on the opp's Delivery Type LeadXtra.
- **Price of variable lines** (delivery, assembly, room placement, casual labour). These default
  to £0.00 in the catalogue. Ask what to charge.
- **Customer PO / project code** if relevant.

Do NOT ask about colour / finish / dimensions if they are already in the opp Situation Summary —
those are part of the brief.

Do NOT ask about Quote Template — that's set on the opp and the quote inherits it automatically.

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
- The Quote Template setting flows from the opp's LeadXtra StandardDropdownField3 — visible on
  the quote header as "Opportunity Custom Fields Quote Template".
- **Price Expiry is auto-set** on every quote raised via `create_quote` from MCP v1.12.1+ —
  defaults to today + 30 days, written to `Quote.EndDate` via a follow-up PATCH after the
  initial POST. Override via the optional `priceExpiryDate` parameter (`YYYY-MM-DD`). See
  Pitfall 7.

### 4. Create the group(s) FIRST

Before adding any lines, create the section headings via `add_quote_line_group`. Capture the
returned `GroupId` — you'll need it on every line.

```
add_quote_line_group(quoteId=<id>, title="Workstations", sequence=10)  # returns GroupId
```

For multi-group quotes, create all groups up-front in display order:

```
add_quote_line_group(quoteId=..., title="Workstations",       sequence=10)  # GroupId G1
add_quote_line_group(quoteId=..., title="Seating",            sequence=20)  # GroupId G2
add_quote_line_group(quoteId=..., title="Storage",            sequence=30)  # GroupId G3
add_quote_line_group(quoteId=..., title="Delivery & Install", sequence=40)  # GroupId G4
```

**Why this matters:** `update_quote_line` does not expose a `groupId` parameter, and
`delete_quote_line` is **disabled** on the WCG tenant. So if you add lines without a `groupId`,
there is NO way to move them into a group via the MCP — the user has to drag them in via the UI.

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

### 6. Add delivery / assembly / carriage line

**Every quote needs one.** The SKU depends on (a) Versa vs Interiors, (b) for Versa, mobile
tables vs Wall Pockets, (c) for Interiors, education vs commercial customer. Check the opp's
LeadXtra **Delivery Type** first — if populated, use that SKU. If blank, infer from product
mix + customer type, or ask via AskUserQuestion.

**Versa quotes:**
- Mobile tables (Versa Benchmark, ConverTable, any folding / wheeled dining table) →
  `VCARRIAGEMOB` — sell price is TIERED ON TOTAL TABLE COUNT (not customer location):
  1-3 = £300, 4-5 = £400, 6-10 = £500, 11-15 = £700, 16+ = £950. Cost £100.
  Catalogue sell is £0 because the real charge varies — set `price` explicitly per the matrix.
- Wall Pockets (Versa wall-mounted folding tables) → `VWPINST-<region>` — fixed price per UK
  region (e.g. VWPINST-LON £2080 Greater London, VWPINST-SE £2086 South East, VWPINST-SWE
  £1425 South West). Cost £250 across UK SKUs. See KB lesson for the full regional table.

**Interiors quotes (non-Versa):**
Three service tiers, each with `-E` (education customers — schools, academies, MATs, colleges,
universities) or `-C` (commercial) suffix:
- `DEL,RP&ASSEM-E-1` / `DEL,RP&ASSEM-C` — Delivery, Room Placement AND Assembly (full white-glove)
- `DEL&ASSEM-E-1` / `DEL&ASSEM-C` — Delivery + Assembly (ground floor only)
- `DELIVERY-E-1` / `DELIVERY-C` — Delivery only

All Interiors codes catalogue at £0 — set `price` explicitly per the agreed charge on the opp.

**Carriage line POSITION rule — always last in its group:**
- Single-group quote → carriage is the bottom line of the only group.
- Multi-group "option" quote (Option 1 / Option 2) → carriage line appears at the end of EACH
  group as that group's last item, so each option totals as a complete bundle the customer
  can pick between.
- Multi-group quote where carriage applies once across the whole quote → use a dedicated
  final group named "Delivery & Install" with the carriage as the only line, sequenced AFTER
  all product groups.

Set carriage `sequence` to the next round number AFTER the highest product-line sequence in
that group. See also Pitfall 14 on sequence collisions across groups.

Always set `price` explicitly — never let it pull as £0 from the catalogue (and once set,
don't try to fix it via `update_quote_line` — see Pitfall 13).

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
- The Quote Template setting on the header matches the opp's

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

### Pitfall 7 — Price Expiry: now auto-set via Quote.EndDate (RESOLVED v1.12.1+)

RESOLVED in MCP v1.12.1 (2026-05-19). Price Expiry is stored on `Quote.EndDate` (database
column `donotuse_enddate` — the `donotuse_` prefix is misleading, the column is actively
repurposed for Price Expiry). It is NOT in QuoteXtras (earlier guidance in v1-v2 of this skill
was wrong — verified by setting the field in the UI and observing QuoteXtras stayed empty).

`create_quote` now automatically sets `Quote.EndDate` to today + 30 days via a follow-up
PATCH after the initial POST. The optional `priceExpiryDate` parameter (`YYYY-MM-DD`)
overrides this default. The success message confirms the date that was written:

```
**Price Expiry:** 2026-06-18
```

If the response shows `**Price Expiry:** ❌ failed to write — please set manually in the
Prospect UI`, the follow-up PATCH errored and the user should set the field manually.

Why the two-step pattern: Prospect's OData metadata flags `Quote.EndDate` as
`UpdateVisibility="never"` (technically — it omits the attribute entirely, which defaults to
"never" on this tenant), so the POST handler silently DROPS any EndDate in the initial body.
PATCH accepts it. Same metadata-lies pattern this codebase has hit at v1.3.2 (Notepad FKs),
v1.4.0 (Enquiry FKs), v1.5.0 (CampaignActivityContact), v1.6.0 (Division.CompanyId). Verified
via dev-tools inspection of the Prospect UI's own save sequence on quote 15493 — the UI uses
the same POST-then-PATCH pattern.

**Do NOT use the MCP's `update_quote(orderDueDate=...)` parameter** — `orderDueDate` maps to
`donotuse_orderduedate`, a DIFFERENT legacy column that the UI no longer surfaces. The write
succeeds but the value never appears anywhere. The MCP descriptions on `orderDueDate` are
marked DEPRECATED from v1.12.0+ for exactly this reason. Use `priceExpiryDate` instead.

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

### Pitfall 13 — `update_quote_line` zeroes the price on £0-catalogue product-linked lines

Service-code SKUs (Versa `VCARRIAGEMOB`, all WCG delivery codes `DELIVERY-E-1`,
`DEL&ASSEM-E-1`, `DEL,RP&ASSEM-E-1`, `ROOM-PLACEMENT-E`, `CASUAL/ASSEM-E`,
`ASSEMBLY & INSTALL`, etc.) are deliberately catalogued at £0 because the actual charge
varies per quote. When you call `update_quote_line(lineId=..., price=700, ...)` on one of
these lines, the server triggers a post-write recalc that re-pulls the £0 catalogue price
and overwrites your £700 override. The MCP response says "Fields changed: ..., DecimalPrice,
..." but the net effect is the line ends up at £0. Retrying with the same args does NOT
recover it.

`add_quote_line` honours the explicit `price` arg correctly — only `update_quote_line`
triggers the recalc.

**Workaround when you need to "edit" one of these lines** (e.g. to fix a wrong sequence or
qty on an existing carriage line):

1. State the workaround clearly in chat — "Re-adding carriage line because update_quote_line
   would zero the price; please delete the old £0 line LineId X in the UI when done."
2. Add a fresh line via `add_quote_line` with the right `price`, `groupId`, and `sequence`.
   `add_quote_line` preserves the explicit price.
3. Tell the user the LineId of the old £0 line so they can delete it manually in the Prospect
   UI (since `delete_quote_line` is disabled on this tenant per Pitfall 9).
4. After confirmation, re-run `get_quote` to verify only the new line remains for that
   product.

Observed 2026-05-19 on quote 15493 (Grenfell Hall) — `update_quote_line` repeatedly returned
"DecimalPrice changed" but the £700 carriage lines kept settling at £0 until we re-created
them via `add_quote_line`.

### Pitfall 14 — Sequence collisions across groups scramble display order

The Prospect UI sorts quote lines by `Sequence` GLOBALLY, not per-group. If you give both
"Option 1 line 1" and "Option 2 line 1" the same `sequence=10`, the UI's tiebreaking shuffles
them unpredictably. Observed 2026-05-19 on a multi-group "options" quote: Option 2's carriage
line at `sequence=40` displayed BEFORE Option 2's ConverTable at `sequence=30` despite both
being in group 2, because Option 1's carriage at `sequence=30` won the global tiebreak and
shoved everything around.

**Mitigation:** use globally unique sequence values across groups. Big gaps between groups:

```
Group 1 (Option 1):
  product line 1:   sequence=10
  product line 2:   sequence=20
  carriage:         sequence=30

Group 2 (Option 2):
  product line 1:   sequence=100   ← big jump so no collision with group 1
  product line 2:   sequence=110
  product line 3:   sequence=120
  carriage:         sequence=130

Group 3 (Option 3):
  product line 1:   sequence=200
  ...
```

Especially important for multi-group "option" / "phase" quotes. If you fix this AFTER lines
are created via `update_quote_line(..., sequence=...)`, be aware Pitfall 13 may zero out
prices on £0-catalogue lines — preferable to get the sequence right at `add_quote_line` time.

## Business Rules

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
| `ROOM-PLACEMENT-E` | Delivery + room placement (no assembly) | |
| `DEL,RP&ASSEM-E-1` | Delivery, room placement, AND assembly | Full white-glove |
| `CASUAL/ASSEM-E` | Casual labour — assembly | When assembly is contracted out |
| `ASSEMBLY & INSTALL` | Assembly & install (combined) | |

If unsure, check the opp's LeadXtra **Delivery Type** first. If blank, ask the user. All
default to £0.00 in the catalogue.

### Opportunity LeadXtra field map (WCG tenant)

| LeadXtra slot | Label | Use |
|---|---|---|
| StandardDateField1 | Quote Due By | Flag in memo if today > this date |
| StandardDropdownField1 | Waiting On | Context for memo |
| StandardDropdownField2 | Delivery Type | Pre-select delivery tier instead of asking |
| StandardDropdownField3 | **Quote Template** | Itemised vs Subtotalled — drives quote print layout |
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

1. `get_quote(quoteId=<id>)` — confirm prices, quantities, groups, totals, delivery / carriage
   line at the bottom of its group, Quote Template setting, and Price Expiry populated.
2. `get_xtra_fields(entityType='QuoteLineXtras', parentId=<lineId>)` for any line you set
   custom fields on — confirm stored values are correct.
3. Confirm Price Expiry appears in the `create_quote` response — `**Price Expiry:** YYYY-MM-DD`.
   If it shows `❌ failed to write`, the follow-up PATCH errored; ask the user to set the date
   manually in the Prospect UI. See Pitfall 7.
4. Save any new learnings via `save_quoting_lesson` (correct category) or `save_product_note`
   — Step 9.

## Changelog

- **2026-05-19 (v4)** — Price Expiry resolved (it's `Quote.EndDate`, NOT QuoteXtras — earlier
  Pitfall 7 was wrong). MCP v1.12.1+ auto-sets it on `create_quote` to today + 30 days via a
  follow-up PATCH after the initial POST, with the optional `priceExpiryDate` parameter for
  overrides. Step 9 (manual UI reminder) removed from the workflow — no longer needed.
  Pitfall 7 fully rewritten with the new resolution and the metadata-lies explanation.
  Step 3 note updated to reflect auto-set behaviour. Verification step 3 updated to check
  the response's `**Price Expiry:**` line instead of reminding the user.

  Step 6 (delivery / carriage line) expanded with the full taxonomy:
  - Versa mobile tables → `VCARRIAGEMOB` tiered on table count (1-3 £300 ... 16+ £950).
  - Versa Wall Pockets → `VWPINST-<region>` fixed per UK region.
  - Interiors → `DEL,RP&ASSEM` / `DEL&ASSEM` / `DELIVERY` × `-E` (education) or `-C`
    (commercial) suffix based on customer type.
  - Carriage line POSITION rule: must always be the last line in its group. For multi-group
    "option" quotes, carriage appears at the end of EACH group.

  New Pitfall 13: `update_quote_line` zeroes the price on £0-catalogue product-linked lines
  (all service codes / Versa carriage SKUs). Workaround: re-create via `add_quote_line` +
  delete old in UI. Observed during the Grenfell Hall session.

  New Pitfall 14: sequence collisions across groups scramble display order — the Prospect UI
  sorts by Sequence GLOBALLY, not per-group. Mitigation: use big gaps between groups
  (10/20/30 for group 1, 100/110/120/130 for group 2, etc.).

  Codified during the Grenfell Hall Versa options quote session (opp 15457 / quote 15493).

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
