# Changelog

All notable changes to this plugin will be documented in this file.

The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## [Unreleased]

## [1.26.0] - 2026-06-26
### Changed — `versa-maintenance-contracts-bulk` skill: equipment list now one-line-per-item

Docs-only release. The Versa Maintenance Contracts skill previously instructed callers to comma-separate mixed equipment on one site (`"5x Mobile Tables, 2x Single Pockets"`). Switched to one-line-per-item, with two wire formats that must stay in sync.

#### CRM side
`equipmentMaintained` passed to `update_division_versa_maintenance` is now a **newline-joined multi-line string** (`"5x Mobile Tables\n2x Single Pockets"`), so each quantity/description lands on a separate line in `DivisionXtra.StandardTextField5`. The CRM textarea preserves `\n` as a visible line break. Single-item contracts pass a single line with no trailing newline as before.

#### Contract docx side
The equipment value lands in `table[0]` cell `[4,1]` — a single Word table cell. **A bare `\n` inside a `<w:t>` XML text node is just whitespace, NOT a line break**, and would collapse multi-item equipment onto one line with a space between items. `build_replacements()` in Step 3 now transforms the equipment target string by replacing each `\n` with the in-paragraph Word line-break sequence `</w:t><w:br/><w:t>` (close run text, emit `<w:br/>`, reopen) so multiple items render as separate lines within that single cell:

```
<w:t>5x Mobile Tables</w:t><w:br/><w:t>2x Single Pockets</w:t>
```

Only the equipment replacement gets this XML transform — every other pair (client name, tel, address lines, cost) stays plain text.

#### Other changes
- Business rules updated with a fenced code-block example of the new format.
- Step 2 example call updated to pass the newline-joined string + an explanatory note.
- Step 3 gets a callout box explaining why bare `\n` doesn't work and what `<w:br/>` looks like in the rendered run.
- Changelog entry added at the top, dated 2026-06-26.

#### Untouched
Pricing rules (£42 per Mobile Table / £81 / £105 / £125 / £140 for Wall Pocket Single–Quad / £336 per-visit minimum) and all `max(subtotal, 336.00)` worked examples remain unchanged. No tool code changed.

## [1.25.0] - 2026-06-22
### Changed — `prospect-crm-create-product` skill v2.1 (image-search refinements from live testing)

Docs-only release. The new `upload_product_image` tool and `create_product` duplicate guard shipped in v1.24.0 hit live use this morning, and three rough edges in how the create-product skill guides image search and presentation showed up — this release adds three small but load-bearing pieces of guidance plus three worked examples, and tightens the §4 / §5.4 / §7 / Pitfalls wording so the deployed-state matches what the team actually has.

#### Image-search refinements
- **"Grab the full-size image, not a thumbnail"** rule in §5.1. Live this morning: an image came back at 4.9 KB because the model grabbed a cached thumbnail when a 321 KB proper image was available on the same page. The skill now tells the caller to pull the `og:image` / "download image" / product-zoom URL and treat anything < ~5 KB as a thumbnail-instead-of-asset signal to redo.
- **§5.1a "WCG catalogue as a fallback source"** — new section. For WCG own-brand / education lines that won't appear on a supplier site, `https://www.westcountrygroup.com/catalogue/` is a flip-book of full-page scans (130+ JS-rendered pages, no clean per-product image URLs), so `web_fetch` alone won't pull a product image. Use the Claude-in-Chrome tools to screenshot/crop instead. Page-scan quality is a fallback only — supplier/manufacturer product shots remain preferred.
- **§5.3 "Always give the real source link"** — the rendered preview widget only loads images from a small CDN allowlist, so external supplier-domain images render blank in the preview even when the URL is valid. The skill now tells the caller to paste the actual `https://…` image URL so Dale opens it at source.
- **Three worked examples in §5.4**: exact-match by manufacturer reference (Gresham LS21 circular table → clean cut-out from `gof.co.uk`), bespoke-representative (Duncan Reeds cantilever desks), and order-ref ≠ catalogue SKU (Hawk WESTCOUNTRY-31797 falling back to manufacturer + model).

#### Tightening (deployed-state accuracy)
The v2.1 paste was authored from the original v2 spec rather than the v2 currently in the repo, so it reverted some of the deployed-state accuracy from v1.21.0 → v1.24.0. Patched before shipping:
- §1 server-side-guard note rewired from "once the updated `create_product` tool is deployed" → "from v1.24.0".
- §2 autoCode tip → "(deployed v1.21.0, see §7)".
- §4 header → "(deployed v1.21.0; fixes v1.22.0; duplicate guard v1.24.0)". Default `categoryId` note added (the schema defaults to `"STOCK"`). Description of duplicate-guard outcome added.
- §5.4 example code → `makePrimary` and `caption` lines dropped (neither is in the v1.24.0 schema; the call would reject unknown args). Header → "(deployed v1.24.0)" with an explicit note that the first uploaded image is auto-primary and `makePrimary`/`caption` aren't accepted by this Prospect endpoint.
- §7 rewritten as "The MCP tools that back this skill" (deployed-state form) with the ProductItem quirks callout from v2 (composite key / raw integer prices / UpdateVisibility=never governs PATCH not POST / CategoryId required on POST).
- **Pitfalls** entry "ProductItems key is a string" → corrected to **composite key**, with the full key URL form spelled out. New entry "Sell / cost / category are create-only" added.

All other content from the v2.1 paste was kept verbatim with the standard UTF-8 mojibake cleanup (em-dashes, §, ×, ÷, £, …, ≥, ≠).

## [1.24.0] - 2026-06-22
### Added — `upload_product_image` + `create_product` duplicate guard + create-product skill v2

Three changes driven by the bespoke-furniture quoting flow Dale walked through this morning. The skill (`skills/prospect-crm-create-product/SKILL.md`) is rewritten to v2 to teach the new behaviour.

#### `upload_product_image` (new write tool)
Attach a JPG/PNG/GIF/WebP image to a product's **Manage Images** panel without leaving the Cowork session. The pre-v1.24.0 fallback was "save the file and drag it into the web UI by hand" — fine for one product, painful for a furniture batch.

- **Endpoint** confirmed against the live tenant via browser DevTools capture (2026-06-22): bound OData action `POST /ProductItems('A','<code>')/UploadImage` with the **raw image bytes** as the request body and `Content-Type: image/<format>`. Not multipart, not a JSON wrapper, not a separate `ProductItemImages` collection — much simpler than the original spec anticipated. Composite key uses the **positional** form `('A','<code>')` here (matches what the web UI sends), distinct from the named form `update_product`'s PATCH uses. Both work for Prospect.
- **Inputs**: `productItemId` (required), exactly one of `imageUrl` (server fetches the bytes itself) or `imageBase64`, plus optional `filename` / `contentType`. The exactly-one-of guard is enforced in the handler rather than via Zod `.refine()` so the schema stays a plain `ZodObject` and the MCP wrapper's `.shape` access keeps working.
- **Guardrails**: MIME must be `image/jpeg`, `image/png`, `image/gif`, or `image/webp`; size cap 8 MB.
- **Wire**: new `client.postBinary(pathAfterBase, bytes, contentType)` helper in `src/client.ts` — the existing `client.post` forces `application/json`, so binary uploads couldn't go through it. The new helper does its own fetch (mirroring `getBinary`) so the Content-Type and raw-body shape are caller-controlled.
- **Permissions**: gated under `catalogue.edit`, reusing the grant added for `create_product`/`update_product` in v1.21.0. No `config/permissions.json` change.
- **`makePrimary` is intentionally NOT in the schema for v1.24.0.** The first image uploaded to a product becomes primary on Prospect automatically — covers the common new-NC case. Changing primary on a multi-image product needs a separate endpoint we haven't captured yet; punted to a follow-up release. The tool description spells this out.

#### `create_product` — manufacturer-reference duplicate guard
Before inserting a new ProductItem, `create_product` now searches for an existing product with the same `ManufacturerReference` (and the same `Manufacturer` when supplied). If a match is found, it returns the existing `ProductItemId` + current sell / cost / obsolete state inline rather than creating a second SKU.

- The check runs before the existing existence-by-code guard, so even when a fresh `NC<DDMMYY><NN>` code is auto-generated, a same-supplier-reference duplicate is caught.
- New `allowDuplicate: boolean (default false)` arg to override for genuine variants (same supplier code, different size/finish).
- Reports up to three existing matches with their description, sell, cost, manufacturer, ref, and an `[OBSOLETE]` tag where applicable so the caller can see whether it's a live SKU or an old retired one.
- OData single-quote escape applied to the filter values so supplier refs containing apostrophes don't break the search.

This backstops §1 of the create-product skill (which already tells callers to search before creating). Even if the search was skipped, the server-side guard ensures duplicates don't slip in silently.

#### `skills/prospect-crm-create-product/SKILL.md` → v2
- New **§1 mandatory duplicate check** with explicit search ordering (manufacturer reference → description → inspect) and the decision tree: match found → reuse; no match → continue.
- New **§5 "Find and attach a product image (Manage Images)"** section: query strategy (supplier code → range/model → keywords), Route-B representative-image handling for bespoke items, the **show-and-approve** gate before any attach, and the new `upload_product_image` tool with `imageUrl` server-fetch flow.
- **§7** updated to describe the three tool deployments (v1.21.0 create/update, v1.22.0 quirks resolved, v1.24.0 duplicate guard + image upload) and the live-confirmed endpoint shape for image upload.
- Renumbered sections so code → §2, price → §3, create → §4, image → §5, quote → §6, tools → §7.
- File rewritten in proper UTF-8 (the v2 paste had mojibake on dashes, `§`, `×`, `÷`, `£`, `…`, `≥`).

## [1.23.0] - 2026-06-17
### Changed — `get_quote` line rendering: explicit Sequence, soft-deleted lines split out

Pre-v1.23.0, `get_quote` listed quote lines in creation/LineId order and never showed each line's `Sequence` (the per-line display-order column the printed quote and Prospect UI sort by). That made it impossible to tell from the response what order the lines will actually print in — and on one live quote the model guessed sequence numbers and left a delivery line mid-quote when inserting new items.

This release rewires the line section without touching totals or margin logic:

- **Active lines sorted by `Sequence`** ascending, with `null` sequences pushed to the end and `LineId` as the tiebreak so the rendered order matches the printed quote / UI exactly. (`$orderby=Sequence` alone leaves null ordering server-defined, hence the client-side sort.)
- **Each rendered line now shows its sequence value** as `**[Seq 10] NCAR10062602** — Premium Senior Tray Tables …` — visible upfront, no longer buried. Lines with no sequence render as `[Seq —]`.
- **Soft-deleted lines split into their own section.** Prospect's tenant-wide soft-delete convention is `StatusFlag = 'D'`; those rows still come back from `$expand=QuoteLines` but the UI excludes them from header totals. Previously they were listed inline alongside active lines, which was misleading and contributed to the wrong-sequence incident. They now render under `## Soft-deleted lines (N, excluded from totals)` with a count, after the active list, never mixed in.
- **`StatusFlag` added** to the `QuoteLines` `$select` so the split actually works.
- **Header counter updated** to `## Lines (3 active, 2 soft-deleted) — sorted by Sequence (printed-quote display order)`.
- **`get_quote` tool description updated** to spell out the new ordering and soft-delete handling, so the model picks correct sequence numbers when inserting / reordering.

Totals (Net / Gross / Cost / Margin) unchanged — soft-deleted lines were already excluded by the server-computed header values; this release only changes presentation.

Verified live against quote 15782 (Cornerstone Academy / Monkerton classroom furniture): three active lines render at Seq 10/20/30 in order, two soft-deleted NCAR10062603 lines appear in their own section, header totals unchanged at £700.00 Net / £840.00 Gross / £580.90 Cost.

## [1.22.0] - 2026-06-17
### Fixed — three bugs from the v1.21.0 live quoting session

Hot-on-the-heels release after v1.21.0 shipped this morning, addressing three issues Dale hit on the same day during real quote work.

- **`create_product` HTTP 500 "Unable to generate primary key for new record"**. `ProductItem` has a *composite* primary key (`OperatingCompanyCode` + `ProductItemId`) — the only write-target entity where this is true. The v1.21.0 POST body included only `ProductItemId`, so the server couldn't address the row. Body now includes `OperatingCompanyCode: "A"` (WCG operating company, same constant the contacts / quotes modules use). Bonus follow-ons caught by the controlled smoke test:
  - **Prices were silently saved as £0.00.** The `DecimalSellingPrice` / `DecimalCostPrice` fields have `meta:Computed="1"` + `meta:UpdateVisibility="never"` — the server ignores them on POST. Now sending the raw integer backing fields (`SellingPrice` = pounds × 10², `SellDecimals` = 2; same for `CostPrice` / `CostDecimals`). Smoke test confirmed £10.00 / £5.00 round-trip exactly.
  - **`CategoryId` is required on POST** despite metadata marking it `Nullable`. Schema now defaults to `"STOCK"`, matching every existing WCG NC item.
  - **`update_product` PATCH returned HTTP 500.** Composite-key URL needed — was `ProductItems('NC...')`, now `ProductItems(OperatingCompanyCode='A',ProductItemId='NC...')`. Also dropped `sellPrice` / `costPrice` / `categoryId` from `updateProductSchema` — those fields are create-only (`UpdateVisibility="never"`), the server rejects PATCHes that include them.
- **`duplicate_quote` resurrected soft-deleted source lines**. One observed case doubled a copied quote from £9,330.48 → £17,872 when 12 dead lines came back as active. Prospect's soft-delete convention is `StatusFlag = 'D'` (active is `'A'`); the deleted lines still come back through `$expand=QuoteLines` but the UI excludes them from header totals. Added `StatusFlag` to the source-line `$select` and skip the loop when it's `'D'`. The return blurb now also reports the skipped count when non-zero.
- **`duplicate_quote` dropped per-line custom fields (Colour, Colour Extended, Supplier, Supplier Code, …)**. These live in `QuoteLineXtras` keyed by `QuoteLineId`. v1.21.0 created the new lines but never carried their Xtras over. Now after each new line POSTs, the handler GETs the source line's `QuoteLineXtras` row, plucks the `Standard*Field*` slots (ignoring nulls / empty strings), and PATCH-with-POST-on-404-fallback writes them onto the new `LineId` (mirroring `upsertQuoteLineXtra` in `quote-lines.ts`). Per-line failures don't abort the whole duplicate — they're logged and surfaced in the response footer.

Documented every quirk found by the smoke test (composite PK, computed Decimal* fields, POST-vs-PATCH semantics of `UpdateVisibility="never"`, required `CategoryId`) in the docstring at the top of `src/tools/products.ts` so the next maintainer doesn't have to rediscover them. Existing `INTEGRATION.md` smoke-test note is still valid.

## [1.21.0] - 2026-06-17
### Added — `create_product` / `update_product` catalogue write tools

Two new MCP write tools targeting the `ProductItems` OData entity set, so bespoke / non-catalogue (NC) items can be created from a Cowork session rather than the Prospect web UI before they're used on a quote.

- **`create_product`** — POSTs a new `ProductItem`. Required: `description`, `sellPrice`, `costPrice`. Either pass `productItemId` verbatim, or pass `autoCode=true` (with `productItemId` omitted) to auto-generate the next `NC<DDMMYY><NN>` code by scanning today's existing NC entries. Guards against overwriting a duplicate SKU. Reads the persisted price back and warns inline if sell/cost rounded to £0.00 (signal that the server ignored the `Decimal*` POST and we need to fall back to raw integer backing fields per the note at the top of `products.ts`).
- **`update_product`** — PATCHes an existing `ProductItem`. ProductItems uses a string key, so the wrapper targets `ProductItems('<code>')` (verified against the existing read-side tooling). Supports description, sell/cost, supplier, references, category, obsolete flag.
- **Permissions**: new `catalogue` module added to `config/permissions.json` (`create` / `edit` actions). DL's `writeAllow` extended with `catalogue` and `"catalogue": { "create": true, "edit": true }` granted under DL's `permissions`. Per `src/permissions.ts`, permission changes are fetched live from GitHub on each restart, so teammates pick up the new module on next Claude Desktop restart without a plugin Update.
- Reuses the existing `toCrmLink()` helper from `src/lib/urls.ts` so the response carries an absolute `crm.prospect365.com/view/...` link.

Handler shipped from a Cowork session (`src/tools/products.ts`, 213 lines). Wired in per `INTEGRATION.md`: import alongside the catalogue.ts block, `TOOL_PERMISSION_MAP` entries next to `create_inventory`, two `registerWriteTool` calls in the "Final: Inventory Create/Update" neighbourhood.

**Smoke test post-deploy**: `create_product(autoCode=true, description="TEST", sellPrice=10, costPrice=5)` → `get_product_detail` → expect sell £10 / cost £5. If they come back £0.00 the wrapper needs the raw-integer price-field switch (SellingPrice × 10^SellDecimals + SellDecimals, plus matching CostPrice / CostDecimals) per the `PRICE STORAGE NOTE` at the top of `products.ts`.

## [1.20.0] - 2026-06-10
### Added — generic DivisionXtra writer

New MCP write tool `update_division_xtra` — sets any DivisionXtra custom-field slot (memo / text / dropdown / date / decimal / flag) on a Division, keyed by friendly label, slot identifier, or raw column name. The Division-level counterpart to `update_quote_line_xtra`.

- **Motivating case**: the "Full Delivery Address" field on the Division Delivery Address tab is `DivisionXtra.StandardMemoField3` (`x_365_custom_memo_3`). Until now the only DivisionXtra writers were `update_division` (dropdowns only) and `update_division_versa_maintenance` (TextField5/6), so memo/text/date/decimal/flag slots could only be set through the Prospect web UI.
- **Shared resolver**: reuses `loadXtraSlots` and `resolveXtraFieldsToBody` from `src/lib/xtra-labels.ts`, so all three key forms (friendly label e.g. `"Full Delivery Address"`, slot identifier `"StandardMemoField3"`, raw column `"x_365_custom_memo_3"`) work identically here as they do on `update_quote_line_xtra`.
- **Upsert contract**: mirrors `upsertDivisionXtra` in `src/tools/versa-maintenance.ts` — PATCH `DivisionXtras(divisionId)`; on HTTP 404 POST a new row keyed by `DivisionId`. Read back via `$filter=DivisionId eq <id>` and return the row.
- **Permissions**: gated via `contacts.edit` — same mapping as `update_division`, since editing a Division's own custom fields sits under the contacts module (the `divisions` module is reserved for cross-entity Division moves).
- **Discovery**: callers can list available slots and friendly labels via `get_xtra_fields(entityType='DivisionXtras', parentId=<divisionId>)` before writing.
- Unknown field keys produce the resolver's existing `"Unknown Xtra field(s)"` error with the valid-options list.

5 unit tests added to `src/test-division-writes.ts` covering: friendly-label resolution to `StandardMemoField3` (the Full Delivery Address case), identifier/raw-column resolution, empty-fields no-op, PATCH→POST 404 fallback, and unknown-key rejection.

## [1.13.0] - 2026-05-19
### Changed — skill content updates from the Grenfell Hall retrospective

`skills/prospect-crm-create-quote/SKILL.md` updated (v4):
- **Pitfall 7 fully rewritten** — Price Expiry resolution. Previously said the MCP couldn't write it; now reflects v1.12.1 reality (auto-set via `Quote.EndDate` to today + 30 days, with `priceExpiryDate` parameter for overrides). Earlier guidance that the field lived in `QuoteXtras.StandardDateField1-5` was wrong — confirmed via dev-tools inspection of the Prospect UI's save sequence on quote 15493.
- **Step 9 removed** — the manual "remind user to set Price Expiry in UI" step is no longer needed because the MCP sets it automatically.
- **Step 6 (delivery / carriage) expanded** with the full WCG taxonomy: Versa mobile tables → `VCARRIAGEMOB` tiered on table count; Versa Wall Pockets → `VWPINST-<region>` fixed per UK region; Interiors → `DEL,RP&ASSEM` / `DEL&ASSEM` / `DELIVERY` × `-E` (education) / `-C` (commercial) suffix. Plus the carriage line POSITION rule (always last in its group).
- **New Pitfall 13** — `update_quote_line` zeroes the price on £0-catalogue product-linked lines (service codes + Versa carriage SKUs). Workaround: re-create via `add_quote_line` + delete old in UI. Observed during the Grenfell Hall session where VCARRIAGEMOB lines kept settling at £0 after every `update_quote_line` call.
- **New Pitfall 14** — sequence collisions across groups scramble display order. The Prospect UI sorts by Sequence GLOBALLY, not per-group, so collisions between e.g. "Option 1 line 1" and "Option 2 line 1" (both at sequence=10) cause unpredictable shuffling. Mitigation: use big gaps between groups (10/20/30 for group 1, 100/110/120/130 for group 2).
- Step 3 note updated to reflect Price Expiry auto-set behaviour.
- Verification step 3 updated to check the response's `**Price Expiry:**` line instead of reminding the user.

`skills/wcg-retrospective/SKILL.md` updated (v4):
- **Step 3a step 7/8 and Step 3b step 6/7 rewritten** — Cowork's "Update" button is a NO-OP for the marketplace-clone install model. Teammates MUST manually `git pull` `.claude\plugins\marketplaces\wcg-prospect` on their own machine for every release. The published GitHub Release is still required (per the v3 lesson) but is not sufficient on its own. Step 5 example deployment sequence updated with the manual-pull commands for teammates.
- Discovered 2026-05-19: v1.12.0 and v1.12.1 sat unused for two hours of Price Expiry debugging because the marketplace clone was stuck at v1.11.0 despite a clean Release publish, Cowork Update click, and full Claude Desktop restart. The deploy workflow now explicitly includes the manual-pull step.

### Why
Both skills had drifted from operational reality. The create-quote skill was telling future Claude sessions to remind users about Price Expiry that the MCP now handles automatically, and the retrospective skill was telling Claude to instruct teammates to use a Cowork button that doesn't do anything. Codifying these into the skill body (not just the knowledge base) means every future quote / retrospective session inherits the corrections without needing them re-discovered.

### No code changes
This is a content-only release — no `src/` or `dist/` changes. Plugin version bumped to 1.13.0 from 1.12.1 because Cowork uses the plugin version to detect skill updates, and a matching tag + Release is required for teammates' marketplace metadata clone to see the new version.

## [1.12.1] - 2026-05-19
### Fixed
- **`create_quote` now actually writes Price Expiry.** v1.12.0 set `EndDate` in the initial POST body, but Prospect's OData layer silently drops it because `Quote.EndDate` has no `meta:UpdateVisibility="common"` attribute in the metadata (line ~11047 of the bundled `prospect-metadata.xml`) — absence of that attribute defaults to "never" on this tenant, so any value in the POST body is rejected without error. Net effect: every quote created via v1.12.0 still came up with Price Expiry blank (year 0000), same as pre-v1.12.0 — verified 2026-05-19 by Dale immediately after the v1.12.0 deploy.

  The fix is a two-step pattern: POST the quote without `EndDate`, then PATCH `EndDate` against the new QuoteId. The Prospect UI uses the same two-step pattern (verified via Network-tab inspection on quote 15493 — the UI's PATCH payload is `{"EndDate":"<ISO>"}` against the existing quote's PK). PATCH accepts what POST silently ignores. The follow-up PATCH is wrapped in a try/catch so a Price Expiry write failure surfaces in the response message rather than aborting the whole quote creation — the caller can then set the field manually in the UI as a fallback.

  The success message returned by `create_quote` now also shows the Price Expiry that was written (or a "❌ failed — set manually" indicator if the PATCH failed), so callers can immediately see whether the field landed.

### Why this slipped past v1.12.0 testing
Same metadata-lies pattern this codebase has hit several times before — see CHANGELOG 1.3.2 (Notepad FKs), 1.4.0 (Enquiry FKs), 1.5.0 (CampaignActivityContact), 1.6.0 (Division.CompanyId). The Prospect metadata flags many writable fields as `UpdateVisibility="never"` (or omits the attribute entirely, which defaults to "never") despite the API actually accepting them on PATCH. The v1.12.0 implementation assumed POST and PATCH had symmetric write permissions; in this case POST is stricter. Should have known better — the existing CHANGELOG explicitly lists this as a recurring pitfall.

## [1.12.0] - 2026-05-19
### Added
- **Price Expiry support on `create_quote` and `update_quote`.** New optional `priceExpiryDate` parameter (accepts `YYYY-MM-DD` or full ISO datetime). Writes to `Quote.EndDate` — the column the Prospect UI surfaces as **"Price Expiry"** on the Quote header Entry tab. When omitted on `create_quote`, defaults to today + 30 days, matching Prospect's tenant-wide `Quote expiry default days = 30` system option and the WCG rule that prices are held for 30 days from quote date.
- **`get_quote` now surfaces Price Expiry** in its rendered output (previously it displayed "Due Date" pulled from the deprecated `OrderDueDate` field, which has been misleading every reader).
- **`search_quotes`** result list now shows Price Expiry instead of Due Date for the same reason.

### Changed
- Existing `orderDueDate` parameter on `create_quote` / `update_quote` is now marked **DEPRECATED** in its description. It still writes to the legacy `donotuse_orderduedate` column for backward-compat, but that column is no longer surfaced by the Prospect UI, so values written there have no visible effect. Callers should switch to `priceExpiryDate`.

### Field mapping resolved
`Quote.EndDate` is the live column for Price Expiry on the WCG tenant — confirmed 2026-05-19 via browser dev-tools inspection of the Quote header form on quote 15493 (PATCH payload was `{"EndDate": "2026-06-17T23:00:00.000Z"}` for an entered date of 18/06/2026 BST). The underlying database column `donotuse_enddate` has been REPURPOSED — the `donotuse_` prefix on the column name is legacy and misleading. The corollary `donotuse_orderduedate` column (mapped to the API field `OrderDueDate`) genuinely IS deprecated and unsurfaced — two different legacy-prefixed columns, only one of them repurposed.

### Date handling
`priceExpiryDate` accepts `YYYY-MM-DD` or full ISO datetime. Both are normalised to **12:00 UTC on the target calendar date** before writing. Midday UTC avoids the BST/GMT day-boundary issue: midnight local time in BST is 23:00 UTC the day before, which would tip the displayed date in the Prospect UI to the prior day. Midday UTC sits inside the same calendar date in any plausible UK-local timezone.

### Type changes
`Quote` interface gains `EndDate: string | null`. `QuoteCreate` interface gains optional `EndDate?: string`.

### Why
Until now there was no way for the MCP to set Price Expiry — every quote raised through MCP came out with the field blank, which the Prospect UI renders as year `0000` and downstream rendering (the quote PDF "prices held for 30 days from date of quote" line) would have looked wrong against a missing/zero expiry. Prior assumption (Pitfall 7 in the create-quote skill) was that Price Expiry lived in `QuoteXtras.StandardDateField1-5` — verified wrong on 2026-05-19; xtras stay empty even after the UI sets the value. It's a core Quote field, just hidden behind a misleading legacy column name.

### Verified
Code change only — `npm run build` produces a clean compile. Live round-trip verification deferred to first MCP-call against the WCG tenant after deploy (will confirm the PATCH lands and the UI shows the expected date). Browser-inspected PATCH payload shape matches what `computePriceExpiry` produces.

## [1.11.0] - 2026-05-18
### Added
- **Shared OneDrive knowledge store via `WCG_KNOWLEDGE_PATH` env var.** `src/tools/knowledge.ts` now reads `quoting-lessons.md` and `product-notes.md` from `process.env.WCG_KNOWLEDGE_PATH || <plugin>/reference/`. Team members configure the env var in `claude_desktop_config.json` to point at a shared OneDrive folder, and all `save_quoting_lesson` / `save_product_note` writes propagate through OneDrive sync. Existing per-machine behaviour preserved as fallback for installs without the env var set.

## [1.10.0] - 2026-05-15
### Added
- **`prospect-crm-create-quote` and `wcg-retrospective` skills** bundled with the plugin. The plugin now ships three skills (alongside `versa-maintenance-contracts-bulk`). `wcg-retrospective` writes SKILL.md updates directly to the mounted plugin repo and prints a one-line git command for the user — retrospective improvements now deploy team-wide automatically.

## [1.9.0] - 2026-05-15
### Added
- **`wcg-retrospective` v3** — adds the GitHub Release step to the deployment sequence (Cowork's plugin install mechanism only detects new versions when a Release exists, not just a tag). Captures the multi-hour 2026-05-18 debug session into the workflow.

## [1.8.0] - 2026-05-12
### Added
- (changelog entry not previously recorded — placeholder; the `v1.8.0` tag corresponds to commit `d3e2b6d2`.)

## [1.7.0] - 2026-05-12
### Added
- `update_division_address` tool — patches the Address entity linked from the Division. Resolves AddressId from divisionId automatically. Mirrors the cross-entity-updater pattern used by `update_division_versa_maintenance`. Only fields supplied are patched; empty string explicitly clears a line; whitespace is trimmed. Foreign postcodes and countries pass through as-is. New file [src/tools/division-address.ts](src/tools/division-address.ts).

### Tenant-shape divergence from the spec
The original change brief instructed resolving the linked Address via `Division.MainAddressId`. On the WCG tenant `MainAddressId` is **null on every active Division** sampled (15/15 in a live spot-check). The populated column is `Division.AddressId`. The handler tries `AddressId` first then falls back to `MainAddressId`, so it works on both tenant layouts without the caller needing to know which. Flagged here so the same assumption isn't carried forward into v1.8+.

### Why
The 138-lead SA Show 2026 import in May 2026 left 42 newly-created Divisions with empty or partial addresses (bulk-create script regressed midway). Until now there was no way to repair them programmatically because `update_division` doesn't expose address fields. With this tool, the staged fixes in `outputs/sa-show-2026/address_fix_staging.json` can be applied via bulk `update_division_address` calls.

### Permission
New action `divisions.update_address` added to the [config/permissions.json](config/permissions.json) catalog and granted to `DL`. Sits under the existing `divisions` hierarchy module alongside `merge` and `reparent`. (The brief proposed `divisions.update.address` as a three-part dotted key; the repo's permission system is module.action two-part throughout, so it landed as `divisions.update_address` to stay consistent with neighbours like `campaigns.add_contact`, `enquiries.link_campaign`.)

### Verified
Live round-trip against the WCG tenant — see [scripts/verify-1.7.0.mjs](scripts/verify-1.7.0.mjs). All scenarios from the spec passed: happy path with divisionId, happy path with addressId, no-fields-supplied no-op, empty-string clear, partial-update preservation, whitespace trim, foreign country, no-AddressId-link error, neither-input rejection.

## [1.6.0] - 2026-05-11
### Added
Cleanup + Division-hierarchy tools — driven by the post-S&A Show 2026 dataset cleanup. New module [src/tools/cleanup.ts](src/tools/cleanup.ts).

#### Soft-delete tools
All four use Prospect's standard pattern: `DELETE /<EntitySet>(id)` flips `StatusFlag` from `A` → `D`. The row stays in the database; the Prospect UI excludes `StatusFlag='D'` from default views. Hard-delete is not exposed via OData.

- `delete_task({ taskId })` — idempotent on already-deleted tasks.
- `delete_enquiry({ enquiryId })` — REFUSES if the enquiry has been converted (`ConvertedDate` populated or `LeadId` non-null), so a delete can't strand the downstream Lead/Opportunity. Idempotent.
- `delete_activity_note({ noteId })` — idempotent on already-deleted or missing notes.
- `delete_contact({ contactId })` — REFUSES with a per-entity listing (Quote IDs / Lead IDs / Task IDs, up to 5 each) if the contact has any active dependents. Forces the caller to resolve them first; no `force` override (clean up the dependents or use the Prospect UI).

#### Division hierarchy
`Division.CompanyId` is the parent FK; metadata flags it `meta:UpdateVisibility="never"` but POST and PATCH both accept it (same misleading-metadata pattern this codebase keeps hitting — Notepad FKs in v1.3.2, Enquiry FKs in v1.4.0, CampaignActivityContact in v1.5.0). Verified live.

- `create_division` extended with optional `companyId` — when supplied, the new Division attaches to that existing Company (validates it exists and isn't deleted). Without it, the existing two-step Company-then-Division flow runs unchanged. Use this to add MAT-member schools under their Trust's Company in one call instead of getting a redundant Company alongside.
- `update_division` extended with optional `companyId` — re-parent in place. Validates target Company.
- `reparent_division({ divisionId, companyId })` — single-purpose reparent tool, gated separately via `divisions.reparent`. Same field exists on `update_division` for callers with broader `contacts.edit` grants; the dedicated tool is for narrowly-scoped reparent workflows.
- `merge_division({ sourceDivisionId, targetDivisionId, deleteSource? })` — moves every active child record from source → target via PATCH on each child's `DivisionId` (Contacts, Tasks, Enquiries, Leads, Quotes, plus division-bound Notepads which also re-stamp their `ObjectId`). Returns a per-entity move summary with failure listing. The OData metadata declares a bound `Merge` action on Division but its signature doesn't expose a target parameter; manual orchestration is the supported path. With `deleteSource: true`, soft-deletes the source Division — but only when every child moved cleanly. Failed moves are listed in the response and don't abort the rest of the merge (so a typoed Quote ID doesn't strand 137 contacts).
- `move_contact({ contactId, targetDivisionId })` — moves a single Contact and re-stamps any Tasks/Notepads whose own `DivisionId` column pointed at the old Division (those would otherwise show under the wrong division on the activity feed). Idempotent if already on the target.

#### Permissions
New actions added to [config/permissions.json](config/permissions.json) catalog and granted to `DL`:
- `tasks.delete`, `enquiries.delete`, `notes.delete`, `contacts.delete`
- `contacts.move` (gates `move_contact`)
- New `divisions` module with `merge` (gates `merge_division`) and `reparent` (gates `reparent_division`). Standard create/edit/delete on Divisions continues to live under the `contacts` module — the new module is hierarchy-only.

`tasks.update` was already covered by the existing `tasks.edit` permission; no extension needed.

### Verified
Live round-trip against the WCG tenant — **23/23 assertions passed**. See [scripts/verify-1.6.0.mjs](scripts/verify-1.6.0.mjs).

- Soft-delete confirmed on Task, Enquiry, Notepad, Contact, Division — all flip `StatusFlag` `A` → `D` via `DELETE`.
- PATCH confirmed to honour `Division.CompanyId`, `Contact.DivisionId`, `Task.TaskTypeId`, `Task.AssignedTo`, despite metadata's `UpdateVisibility="never"` flag on each.
- `merge_division`: contact + task + division-bound note all moved from source to target; source soft-deleted afterwards. Side-observation: Prospect auto-cascades `Task.DivisionId` when its parent `Contact.DivisionId` changes — our explicit Task loop sees `0 moved` because the cascade already ran during the Contacts pass. The result is correct (the Task ends up on the target); just noted so the move-summary isn't surprising.
- `reparent_division`, `create_division({ companyId })`, `update_task`, `delete_task`, `delete_contact` (clean + blocked + unblocked), `move_contact` (with contact-owned task re-stamping), `delete_enquiry`, `delete_activity_note` (all idempotent paths included).
- All test records cleaned up; tenant returned to baseline.

## [1.5.0] - 2026-05-08
### Added
Three additive features to finish the S&A Show 2026 lead-load workflow.

- **Contact ↔ Campaign target-roster tools** — new module [src/tools/campaign-contacts.ts](src/tools/campaign-contacts.ts) backed by the OData `CampaignActivityContact` join entity (composite key `CampaignActivityId` + `ContactId`):
  - `add_contact_to_campaign({ contactId, campaignId, campaignActivityId?, comments? })` — adds a contact to the target-contact roster on the activity. Defaults to the campaign's lowest-id activity when `campaignActivityId` is omitted. **Idempotent** — already-rostered contacts return a "no change" message rather than a duplicate-key error (the server itself is idempotent on duplicate POST, but we check first so the response is informative).
  - `remove_contact_from_campaign({ contactId, campaignId, campaignActivityId? })` — opposite. Idempotent on already-removed contacts. Uses the composite-key DELETE URL form `/CampaignActivityContacts(CampaignActivityId=X,ContactId=Y)`.
  - `list_campaign_contacts({ campaignId, campaignActivityId?, top? })` — read-only roster listing with full contact + division detail. Prefer this over `get_campaign_activity_contacts` for new code; the older tool selects `ResponseDate`/`ResponseCode` fields that don't exist on this entity (Prospect silently ignores them) — preserved for backwards compat.
- **`update_contact` extended with `roleCode`.** Accepts the FK code (e.g. `b730fd`) OR a UI label / canonical role name (e.g. `SENCO`, `Bursar / Finance / SBM`); resolved against the live `ContactRoles` table via `resolveRoleCodeOrLabel` so a typo fails fast with the full role list rather than silently defaulting. Same field surface available on `create_contact`.
- **Job-Title → Contact-Role auto-resolver** — new pure-function module [src/lib/role-mapper.ts](src/lib/role-mapper.ts). Eleven-rule WCG-agreed mapping table; rule order matters (SENCO > Head/Principal > Senior Teacher > … > default Office/Admin). Patterns are case-insensitive substring matches; `jobTitle` checked first, then `jobFunction`, falling through to `default-empty` / `default-no-match` when neither hits. Edge cases handled per spec: `"Senco/class teacher"` → SENCO; `"Head of Maths"` → Senior Teacher (rule 3 generic catch); `"Head of School"` → Head/Principal (rule 2 locked phrase); `"Headteacher and SENCO"` → SENCO (rule 1 priority). 21/21 unit tests pass — see [src/test-role-mapper.ts](src/test-role-mapper.ts), runnable via `npm run test:role-mapper`. Wired into:
  - `create_contact` — auto-resolves when `roleCode` is omitted; uses `jobTitle` (and optional new `jobFunction` input) to pick a role. Success message includes the resolved code, label, and matched-rule diagnostic so callers can verify.
  - `update_contact` — auto-resolves only when `roleCode` is NOT supplied AND `jobTitle` is being patched in this same call. Otherwise the existing role is left alone (no silent overwrite on unrelated edits).
  - New read-only `resolve_contact_role({ jobTitle?, jobFunction? })` tool — dry-run preview that returns the role code, label, and matched-rule string without writing anything. Useful for the bulk loader to validate its mapping plan before firing creates, and for wash-up reporting.
- **Permissions** — added `campaigns.add_contact` and `campaigns.remove_contact` to the [config/permissions.json](config/permissions.json) module catalog and granted to `DL`. Existing `update_contact`/`create_contact` continue under `contacts.edit`/`contacts.create` (the new role fields ride on the existing perms).

### Verified
Live round-trip against the WCG tenant on 2026-05-08:
- Test contact added to campaign 1039 / activity 1037 via `add_contact_to_campaign`; verified via OData query and `list_campaign_contacts`. Re-add returned "no change" (idempotent). `remove_contact_from_campaign` cleared the row; second remove returned "no change".
- `update_contact({ contactId, roleCode: "SENCO" })` patched a test contact's `RoleCode` from `271c0d` to `b730fd` — verified via `get_contact_details` follow-up. Reset to `271c0d` cleanly.
- Role-mapper unit suite: **21 passed, 0 failed**.
- Round-trip `create_contact({ jobTitle: "Senco/class teacher", divisionId: <test> })` (no `roleCode`) — response shows `Role: b730fd — SENCO` plus `Role auto-resolved via: rule-1-jobTitle:"senco"`.
- All test data deleted; tenant restored to baseline.

### Notes
- `Enquiry.CampaignActivityId` and `CampaignActivityContact.CampaignActivityId/ContactId` are flagged `meta:UpdateVisibility="never"` in the OData metadata. POST accepts them anyway; PATCH on Enquiry too. Same misleading-metadata pattern as v1.3.2's `Notepad.ContactId` and v1.4.0's enquiry FKs. Documented in [src/tools/campaign-contacts.ts](src/tools/campaign-contacts.ts).

## [1.4.0] - 2026-05-08
### Added
- **Enquiry ↔ Campaign linkage** and **Enquiry ownership** are now writable through the connector — addresses the gap where MCP-loaded enquiries didn't appear on a campaign's lead list and couldn't be assigned to a BDE programmatically. New module [src/tools/campaign-enquiry.ts](src/tools/campaign-enquiry.ts) backed by `Enquiry.CampaignActivityId` and `Enquiry.AssignedTo`.
  - `link_enquiry_to_campaign({ enquiryId, campaignId, campaignActivityId? })` — sets the activity. When `campaignActivityId` is omitted, defaults to the campaign's lowest-id activity. Validates both records exist before writing; returns the chosen activity description for audit.
  - `unlink_enquiry_from_campaign({ enquiryId })` — clears `CampaignActivityId`. Idempotent.
  - `assign_enquiry({ enquiryId, assignedTo })` — sets/clears the owner. `assignedTo` accepts user code (e.g. `CL1`) or name (`Calvin Liesching`, `Calvin`) using the same `resolveUserCodes` helper as `create_task`. Pass `null` to unassign. `AssignedDate` is auto-populated by the server.
- `create_enquiry` extended with `campaignId`, `campaignActivityId`, and `assignedTo` — so a bulk loader can create + link + assign in a single OData call. Resolution happens up-front so an unknown user / missing campaign aborts before the enquiry is written.
- `update_enquiry` extended with `campaignActivityId` (number or `null`) and `assignedTo` (string or `null`) for in-place re-linking and re-assignment workflows.
- Two new permission actions: `enquiries.link_campaign` (gates link/unlink) and `enquiries.assign` (gates `assign_enquiry`). Added to the [config/permissions.json](config/permissions.json) module catalog and granted to `DL`. Existing `create_enquiry` / `update_enquiry` continue to use `enquiries.create` / `enquiries.edit`; the new fields on those tools ride on the existing permission since they bundle naturally with the create/edit form (matches how the Prospect UI gates the same form).
- `tools/reports.ts` now exports `resolveUserCodes` so the new module can share the same name→code resolution rules without duplication.

### Verified
Live round-trip against the WCG tenant on 2026-05-08:
- Test enquiry created → `link_enquiry_to_campaign(testId, 1039)` → `Enquiries?$filter=CampaignActivityId eq 1037` count went from 1 → 2; the link expanded correctly to campaign 1039 / activity 1037 ("Schools & Academies Show May 2026").
- `assign_enquiry(testId, "CL1")` → `AssignedTo: "CL1"`, `AssignedToUser.UserName: "Calvin Liesching"`, `AssignedDate` server-populated.
- `unlink_enquiry_from_campaign(testId)` → count back to 1; `AssignedTo` persisted (independent fields, as expected).
- Test enquiry deleted; tenant data restored to baseline.
- `Enquiry.CampaignActivityId` and `Enquiry.AssignedTo` are flagged `meta:UpdateVisibility="never"` in the OData metadata, but PATCH and POST both accept them — same misleading metadata pattern as `Notepad.ContactId` in v1.3.2. Documented in [src/tools/campaign-enquiry.ts](src/tools/campaign-enquiry.ts).

## [1.3.2] - 2026-05-08
### Fixed
- **Permission gating ignored `~/.prospect-crm/config.json`.** `src/index.ts` was reading `process.env.PROSPECT_USER_ID` directly to identify the current user, bypassing the credential loader that already merges env vars with the file written by `setup-user.ps1`/`setup.cjs`. On installs that wired credentials via the file (no `env` block in `claude_desktop_config.json` — the supported plugin-install path), USER_ID resolved to `""`, fell through to `defaults.writeAllow=""`, and every write tool reported "no <module> <action> permission" even for users with full grants. Now uses `loadCredentials().PROSPECT_USER_ID` so the file-based config works as documented. Repro: Dale's `claude_desktop_config.json` had no `env` block (set up via `setup-user.ps1`), `~/.prospect-crm/config.json` had `PROSPECT_USER_ID: "DL"`, but `create_division` / `create_contact` / `create_enquiry` / `create_task` all failed with permission errors. Verified post-fix: `loadCredentials()` returns `USER_ID: "DL"`, gating allows DL's granular create+edit permissions through.

### Added
- **Activity-feed notes** — new `notes` module exposing two tools backed by Prospect's `Notepads` entity:
  - `create_activity_note({ objectType, objectId, text, dateTime?, pinned?, tags?, external?, visibility?, recallUser?, recallDateTime?, userCode? })` — creates a note attached to a division, contact, lead, enquiry, or quote. Parent FKs (`DivisionId`, `ContactId`, `EnquiryId`) are resolved from the target and set explicitly so the note rolls up to every relevant level of the activity feed (matches what the Prospect UI does on save). Validates the target exists before posting, so an invalid id fails fast rather than creating an orphan note.
  - `search_activity_notes({ divisionId?, contactId?, enquiryId?, objectType?, objectId?, user?, pinnedOnly?, dateFrom?, dateTo?, top? })` — read tool to inspect existing notes by parent record, type, author, pinned status, or date range.
- ObjectType codes verified live: lowercase `division`, `contact`, `lead`, `enquiry`, `quote`. Write-recipe documented in [src/tools/notes.ts](src/tools/notes.ts) — `UpdateVisibility="never"` in the metadata blocks PATCH, not POST, and the parent FK columns must be sent explicitly on create or the activity feed roll-up breaks.
- `notes` module added to [config/permissions.json](config/permissions.json) catalog and granted to `DL`.

## [1.3.1] - 2026-05-08
### Fixed
- Admin portal save: reordered `commitAndPushPermissions()` so it commits the staged file BEFORE running `git pull --rebase`. The previous order (rebase → add → commit → push) bailed with "you have unstaged changes" because the save endpoint had already written `config/permissions.json` to disk before calling the helper. New order: `git add config/permissions.json` → check `git diff --cached --quiet` (early-return as no-op if unchanged) → `git commit` → `git pull --rebase origin main` → `git push origin main`. The rebase now runs against a clean working tree. If the rebase hits a real conflict (not the unstaged-changes false positive), the helper runs `git rebase --abort` so the local commit is preserved and the UI's Retry Push button can be used after the conflict is resolved manually. Repro: Dale's v1.3.0 admin save returned `pushed: false` with an unstaged-changes error; v1.3.1 makes the helper idempotent and re-runnable.

## [1.3.0] - 2026-05-08
### Added
- **Centralised permissions store via GitHub.** `src/permissions.ts` introduces a three-layer loader: live fetch from `https://raw.githubusercontent.com/dale-ctrl/prospect-mcp/main/config/permissions.json` (5s timeout) → local cache at `~/.prospect-crm/permissions-cache.json` (atomic `*.tmp` + rename writes) → bundled `config/permissions.json` from the plugin install. Schema-validates each layer's parsed JSON; falls through on malformed input. Logs every fetch/cache attempt with timestamp and URL to MCP stderr. Offline and first-run-while-offline both keep working — the connector only fails if even the bundled file is missing. Override the URL via `PROSPECT_PERMISSIONS_URL` for forks of this plugin.
- **Admin portal pushes to GitHub on save.** `admin/server.mjs` now does `git pull --rebase` → `git add config/permissions.json` (precise — never `git add .`, so unrelated working-tree changes like `dist/` rebuilds aren't swept in) → `git commit` → `git push origin main` after the local file write. Inherits the maintainer's existing git credentials (Windows Credential Manager / SSH agent) — no new PAT introduced. Concurrent admin edits from another machine are handled by the pull-rebase. New `/api/retry-push-permissions` endpoint re-attempts the push without rewriting the file.
- **Push status surfaced in admin UI.** Successful save shows "saved and pushed to GitHub at <timestamp>". Failed push leaves the local edit in place, shows the error, and offers a **Retry Push** button. Save-flow falls back to download-as-file if the admin server itself is unreachable (existing behaviour, preserved).
- README "How permissions sync works" section + `PROSPECT_PERMISSIONS_URL` documented.

### Changed
- The MCP server's permissions hot-reload (5s in-process TTL) now refreshes via the new three-layer loader rather than a direct file read. Refreshes are non-blocking — tool calls always read the in-memory snapshot. Initial startup awaits the first load (capped at 5s by the fetch timeout) so the server's tool descriptions are built against live permissions. Admin-portal edits now propagate by: admin pushes to GitHub on save → every plugin fetches from GitHub on next Claude Desktop restart. The previous file-on-NAS path no longer applies (and was already brittle in practice — each user had their own stale plugin-install copy).

## [1.2.12] - 2026-05-07
### Fixed
- README install instructions: replaced the NAS-UNC-path command (`\\192.168.1.155\sfm_data\prospect-mcp\scripts\setup-user.cmd`) with a download-and-run-from-GitHub PowerShell snippet that fetches `setup-user.ps1` to `%TEMP%`, runs `Unblock-File` to strip the Mark-of-the-Web zone identifier, executes via `-ExecutionPolicy Bypass`, and cleans up. The previous UNC path was blocked in practice by execution policy / network zone restrictions even when invoked via the `.cmd` launcher. The NAS path is now documented as a fallback only for users who can't reach GitHub. Same pattern documented for `update-plugin.ps1` in the Updates section. Docs-only patch — no script changes.

## [1.2.11] - 2026-05-07
### Added
- Comprehensive `setup-user.ps1` (with `.cmd` launcher) that wraps the full team-rollout install in one script: registers the marketplace via Claude Code CLI, installs the plugin's local files, runs `npm install --omit=dev` for runtime dependencies, wires up the `prospect-crm` connector entry in `claude_desktop_config.json` (preserving other `mcpServers` entries), and writes credentials to `%USERPROFILE%\.prospect-crm\config.json`. `-CredentialsOnly` flag refreshes the PAT without re-running the full install.
- `update-plugin.ps1` / `update-plugin.cmd` for ongoing version updates: runs `claude plugin update` and refreshes `npm install --omit=dev`.
- `.cmd` launchers next to both `.ps1` files invoke `powershell -NoProfile -ExecutionPolicy Bypass -File ...` so first-time installs don't bounce off the default Windows execution policy.
- README "Prerequisites" subsection (Claude Desktop, Node 18+, Claude Code CLI, `claude login`) and an "Updates" subsection.

### Changed
- README install flow collapsed to: run `setup-user.cmd` → do the Cowork-UI marketplace add → restart Claude Desktop. The previous separate credential-setup step is folded into the comprehensive script.

## [1.2.10] - 2026-05-07
### Fixed
- Versa Maintenance Contracts skill: Step 3 merger now detects source values dynamically from the template instead of relying on Wimbledon Park reference values being present. Prevents silent leakage of a previous customer's details when the most recent Versa Maintenance Contract.docx on the connector belongs to a different customer.
