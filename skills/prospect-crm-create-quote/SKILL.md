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
- **Price Expiry CANNOT be set via the MCP** — see Pitfall 7. Always remind the user to set it
  in the Prospect UI to (CreatedDate + 30 days).

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

### 6. Add delivery / assembly line

Use the appropriate WCG service code (table in Business Rules below) — or, if the opp's
LeadXtra Delivery Type is set, use that.

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
- The Quote Template setting on the header matches the opp's

If a value differs from what was passed in, FLAG IT — don't silently override. The user may
be editing the quote in the UI concurrently (Pitfall 1).

### 9. Remind the user about Price Expiry

At the very end of the session, tell the user explicitly:

> "Quote <id> created — please set Price Expiry to YYYY-MM-DD (30 days from today) in the
> Prospect UI. The MCP can't set this field directly."

Non-negotiable — see Pitfall 7.

### 10. Capture any learnings

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

### Pitfall 7 — Price Expiry cannot be set via the MCP

The WCG Prospect UI displays a **Price Expiry** date field on the Quote header. WCG rule:
Price Expiry should always be 30 days from quote created date.

**Do NOT use the MCP's `update_quote(orderDueDate=...)` parameter.** `orderDueDate` maps to the
column `donotuse_orderduedate` — a deprecated/legacy field the UI no longer surfaces. The
write succeeds but the value never appears in the UI.

Price Expiry is most likely stored in one of the QuoteXtras `StandardDateField1-5` slots, but
the MCP has **no `update_quote_xtra` writer** for header-level custom fields. So Price Expiry
cannot currently be set via the MCP.

**Mitigation:** at end of session, tell the user explicitly to set it in the UI.

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

1. `get_quote(quoteId=<id>)` — confirm prices, quantities, groups, totals, delivery line,
   Quote Template setting.
2. `get_xtra_fields(entityType='QuoteLineXtras', parentId=<lineId>)` for any line you set
   custom fields on — confirm stored values are correct.
3. Remind the user to set **Price Expiry** in the UI to (created date + 30 days) — Pitfall 7.
4. Save any new learnings via `save_quoting_lesson` (correct category) or `save_product_note`
   — Step 10.

## Changelog

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
