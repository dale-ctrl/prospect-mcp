---
name: versa-maintenance-contracts-bulk
description: >
  Produce Versa Maintenance Contracts for one or many WCG customers by populating
  the Versa Maintenance fields on each Division and generating the merged contract
  docx + PDF. Trigger whenever the user asks to create, generate, produce, send,
  batch, or split Versa Maintenance Contracts — especially in bulk (e.g. "produce
  maintenance contracts for all the schools in this trust", "create a Versa
  Maintenance Contract for Beacon Academy"), or whenever a master multi-site
  contract spans multiple sites that need splitting into per-site agreements.
  Also trigger on requests to fill in the Versa Maintenance tab on a Division
  record, since that is the data backing the contract.
---

# Versa Maintenance Contracts (Bulk)

This skill produces individual Versa Maintenance Contracts for WCG customers.
It bypasses Prospect's `MergeData` API entirely (which has a server-side contact
requirement that cannot be satisfied from the OData surface) by client-side
merging from a known-good docx template, then converts each docx to PDF for
sending.

## Pricing — non-negotiable

This skill applies a single fixed price list. Do NOT ask the user
to confirm rates. Do NOT offer pricing alternatives. The figures
below are the only valid ones for this skill.

| Equipment | Rate (ex VAT) |
|---|---|
| Mobile Table (Benchmark, Spaceright, Sico — any brand) | £42 each |
| Wall Pocket — Single | £81 each |
| Wall Pocket — Double | £105 each |
| Wall Pocket — Triple | £125 each |
| Wall Pocket — Quad | £140 each |

**Minimum charge: £336 per visit. Applies on every contract,
no exceptions.**

To compute a contract total:

```
subtotal    = sum(quantity × per_unit_rate) for each equipment type
total_value = max(subtotal, 336.00)
```

Worked examples (illustrative — apply the rules above to any input):

- 9× Mobile Tables: subtotal = 9 × 42 = 378. max(378, 336) = **378.00**
- 3× Mobile Tables: subtotal = 3 × 42 = 126. max(126, 336) = **336.00**
- 1× Single Pocket: subtotal = 1 × 81 = 81. max(81, 336) = **336.00**
- 5× Mobile Tables + 2× Double Pockets: subtotal = (5×42) + (2×105) = 210 + 210 = 420. max(420, 336) = **420.00**

Do not deviate from these rates. Do not consult `search_quoting_lessons`,
`get_product_pricing`, or any other tool to "verify" the price — these
rates are this skill's source of truth.

## WCG Environment Context

- **Prospect CRM** (prospect365.com / OData v1 at crm-odata-v1.prospect365.com).
- **prospect-crm MCP connector** — Westcountry's custom MCP. Key tools:
  `update_division_versa_maintenance`, `merge_division_document`,
  `update_division`, `create_division`, `create_contact`, `search_divisions`,
  `list_divisions`, `get_division_details`, `inspect_division_categorisation_panel`,
  `search_documents`, `get_merge_output`, `list_quote_templates`.
- **Versa Maintenance Contract template code: `23caad`** — registered as a
  quote-PDF template. The UI button "Create Versa Maintenance Contract"
  (top-right three-dot menu on a Division view) triggers this template via the
  server-side merge path that we cannot replicate from the API.

## CRITICAL: do not invoke server-side merge

**DO NOT call `merge_division_document` or any tool that hits Prospect's
`MergeData` action. The merge MUST be done client-side via `python-docx` +
raw XML editing — see Step 3 of the workflow.** This is non-negotiable for
this skill: every API path into `MergeData` returns
`HTTP 500 {"message":"ContactNotSet","source":"Budgeting"}` and there is no
parameter you can add to fix it.

If you find yourself reaching for `merge_division_document`, stop and go to
Step 3. Do not retry with different `contactId` values, do not pre-create a
contact, do not set `HiddenContactId` first — none of these change the
outcome. The action signature has no contact parameter (confirmed in
`$metadata`), Wimbledon's working merges have `HiddenContactId` null, and
the same 500 fires on Divisions that already have contacts. The requirement
cannot be satisfied from the OData surface; client-side merging is the
only path.

CRM-side data still gets written via `update_division_versa_maintenance`
(Step 2). That's the OData writer, not `MergeData`, and is fine to call.

## Field mapping (verified)

| UI Label | Backing Field |
|---|---|
| Quantity and Equipment Maintained | `DivisionXtra.StandardTextField5` |
| Total Maintenance Value | `DivisionXtra.StandardTextField6` (stored as TEXT) |

Reference live record: **Wimbledon Park Primary School (DivisionId 30479)** —
both fields populated, 20+ existing merged contracts on file.

## Business rules

- **Equipment string format.** Default to generic descriptors:
  `"Nx Mobile Tables"`, `"Nx Single Pockets"`, `"Nx Double Pockets"`,
  `"Nx Triple Pockets"`, `"Nx Quad Pockets"`. If the user specifies a
  brand (Benchmark, Spaceright, or Sico), include it in the string,
  e.g. `"Nx Versa Benchmark Tables"`. Pricing is the same for any
  Mobile Table brand. For mixed equipment on one site, comma-separate:
  `"5x Mobile Tables, 2x Single Pockets"`.
- **Total value format.** Pass to MCP as a STRING with two decimal places,
  e.g. `"294.00"`. JSON serialisation drops trailing zeros if you pass a
  number (`280` becomes `"280"`, not `"280.00"`).
- **One contract per Division.** If the master spans multiple sites,
  split into per-school contracts numbered in master row order so re-orderings
  are spottable.
- **Multiple campuses = multiple Divisions.** A single Academy operating
  across two sites needs two Division records and two contracts. Mirror the
  primary site's Division settings (AM, Territory, Customer Type, Relationship)
  when creating the second.

## Workflow

### Tools you MUST NOT call

- **`merge_division_document`** — hits `MergeData`, returns 500
  ContactNotSet on every call. Use the client-side merger in Step 3.
- **Any tool path that triggers Prospect's server-side merge for template
  `23caad`.** The Prospect UI button "Create Versa Maintenance Contract"
  also routes through `MergeData` — do not try to script that path either.
- **`send_quote_email` / any tool that emails the customer directly.**
  The MCP overrides `emailTo` to the API user by design. Always hand the
  PDF to the user; let them forward from their own mail client. See
  "emailTo safety gate" below.

### Tools you DO call

- `search_divisions`, `list_divisions`, `get_division_details` — find sites.
- `create_division`, `create_contact` — only when a site is missing from CRM.
- `update_division_versa_maintenance` — populates the Versa fields on the
  Division (the OData writer, not `MergeData`; this is fine).
- `search_documents` + `get_merge_output` — fetch the Wimbledon-style docx
  template that Step 3 merges client-side.

### 1. Match every site to a CRM DivisionId

Use `search_divisions` by name. For ambiguous matches, filter by:

- AM matches the trust's AM (look up the parent trust's account manager
  via a sibling Division)
- Territory consistent with trust footprint (regional cluster of
  sibling Divisions)
- Relationship is "Prospect" or matches the existing pattern

Bulk `list_divisions` with `filters.postcode` is useful for finding misspelled
or alternatively-named schools. If a site isn't in CRM, ask the user for the
address before creating.

### 1b. Create missing Divisions (only if needed)

`create_division` mirroring the trust pattern:

- `accountManager`: trust AM code
- `territoryCode`: pass the FK code from a sibling Division
- `relationship`: "Prospect"
- Address: `addressLine1` (street), `addressLine3` (town), `addressLine4`
  (county), `postcode`

**WARNING:** `create_division` always creates a fresh CompanyId. To link the
new Division into an existing company group, the user must merge Companies in
the Prospect UI. Tell them which CompanyId was created so they can do it.

**WARNING:** `customDropdown2` (Customer Type) only accepts the UI label, not
the FK code, despite the schema saying both work. If unsure, omit it and ask
the user to set Customer Type in the UI.

### 2. Compute the per-site total and write Versa fields

Apply the price list from "Pricing — non-negotiable" above. The maths
is fixed; do not ask the user to confirm any of it.

```python
# Look up the per-unit rate from the price list above
subtotal = sum(quantity * per_unit_rate for each equipment type)
total_value = max(subtotal, 336.00)
```

Then call:

```
update_division_versa_maintenance({
  divisionId: <id>,
  equipmentMaintained: "Nx Mobile Tables",   # or appropriate equipment string
  totalMaintenanceValue: "X.00"               # STRING, 2dp, no currency symbol
})
```

### 3. Produce the merged docx (client-side)

**Get a template:**

```
search_documents({ description: "Versa Maintenance Contract", top: 1 })
get_merge_output({ documentId: <hit>, saveTo: "/tmp/versa_template.docx" })
```

This gives you a docx with all WCG branding/styles already applied — only
the per-school data needs swapping.

**Detect the source values from the template:**

- Table 0 cell [0,1] — Client name
- Table 0 cell [1,1] — Site address (newline-separated lines)
- Table 0 cell [2,1] — Tel No
- Table 0 cell [4,1] — Equipment to be maintained
- Inside a `<w:txbxContent>` Word textbox — Total cost (e.g. `"378.00"`)

**Important:** the cost lives in a Word textbox, not a paragraph. python-docx's
`.paragraphs` iteration won't see it. Use raw XML on `word/document.xml` and
`str.replace()` on the unzipped XML — the cost string only occurs once in the
document.

**Three layout fixes that MUST be applied to each merged docx for clean PDF
output via LibreOffice.** All three can be implemented inside a single
`normalise_anchors(xml)` step that runs between the text-replacement and the
empty-paragraph-trim:

```python
LEFT_MARGIN_CM = 2.75    # from the template's sectPr
RIGHT_MARGIN_CM = 19.00  # 21cm page width minus 2cm right margin
EMU_PER_CM = 360000

def _fix_anchor(block):
    # Fix 1: column-relative -> page-relative absolute, clamped to right margin.
    # Without this, the right-side VERSO logo overshoots the page-frame border
    # by ~0.6cm because LibreOffice interprets column-relative offsets differently
    # from Word.
    horiz = re.search(
        r'(<wp:positionH[^>]*relativeFrom=")(\w+)("[^>]*>.*?<wp:posOffset>)(-?\d+)(</wp:posOffset>)',
        block, re.DOTALL)
    if horiz and horiz.group(2) == 'column':
        extent = re.search(r'<wp:extent cx="(\d+)" cy="(\d+)"', block)
        if extent:
            page_offset = int(LEFT_MARGIN_CM * EMU_PER_CM) + int(horiz.group(4))
            right_margin = int(RIGHT_MARGIN_CM * EMU_PER_CM)
            if page_offset + int(extent.group(1)) > right_margin:
                page_offset = right_margin - int(extent.group(1))
            new_horiz = horiz.group(1) + 'page' + horiz.group(3) + str(page_offset) + horiz.group(5)
            block = block[:horiz.start()] + new_horiz + block[horiz.end():]

    # Fix 2: behindDoc="1" so the page-frame top horizontal border draws OVER
    # the WCG logo instead of being broken at the logo's position.
    if 'behindDoc="0"' in block:
        block = block.replace('behindDoc="0"', 'behindDoc="1"', 1)
    else:
        opening = re.search(r'<wp:anchor[^>]*>', block)
        if opening and 'behindDoc=' not in opening.group(0):
            block = re.sub(r'<wp:anchor', '<wp:anchor behindDoc="1"', block, count=1)
    return block

def _fix_vshape(block):
    # Fix 3: strip mso-height-percent / mso-height-relative / mso-width-relative
    # from the cost-display textbox and clamp height to 30pt. Word interprets
    # mso-height-percent:200 one way; LibreOffice stretches the textbox across
    # two pages, leaking its bottom edge as a stray horizontal line above the
    # page-frame's bottom border on page 2.
    sty = re.search(r'style="([^"]+)"', block)
    if not sty:
        return block
    style = sty.group(1)
    style = re.sub(r'mso-height-percent:[^;"]+;?', '', style)
    style = re.sub(r'mso-height-relative:[^;"]+;?', '', style)
    style = re.sub(r'mso-width-relative:[^;"]+;?', '', style)
    style = re.sub(r'height:[\d.]+pt', 'height:30pt', style)
    style = re.sub(r';;+', ';', style).strip(';')
    return block.replace(sty.group(0), 'style="' + style + '"', 1)

def normalise_anchors(xml):
    xml = re.sub(r'<wp:anchor[^>]*>.*?</wp:anchor>',
                 lambda m: _fix_anchor(m.group(0)), xml, flags=re.DOTALL)
    xml = re.sub(r'<v:shape\s.*?</v:shape>',
                 lambda m: _fix_vshape(m.group(0)), xml, flags=re.DOTALL)
    return xml
```

If the WCG branding template ever gets updated (different margins, new
logos, additional anchored shapes), re-derive `LEFT_MARGIN_CM` and
`RIGHT_MARGIN_CM` from the new template's `sectPr` element and re-run.

### 4. Trim trailing empty paragraphs

The Wimbledon template has 19-20 empty paragraphs between "Please sign and
return" and the version-date footer (e.g. "Sept 2025 (2)"). These cause a
blank page at the end. Trim them down to 1, keeping the version footer on the
same page as the signature block.

### 5. Verify each merged output

Re-open and grep for: all target values present, all template-source residue
gone, paragraph count <= ~110 (otherwise blank trailing page).

### 6. Convert every docx to PDF

PDFs are the deliverable WCG sends to customers — keep the docx as editable
backups but always produce PDFs alongside.

LibreOffice is available in the sandbox. Convert all docx in one go:

```bash
libreoffice --headless --convert-to pdf --outdir <output_dir> <output_dir>/*.docx
```

This processes a whole batch in one process invocation (much faster than one
file at a time). Each contract converts in ~1 second; 22 take ~25 seconds
end-to-end. The PDFs land alongside the docx in the same folder.

If LibreOffice isn't available, fall back to `docx2pdf` (Windows/Mac with
Word installed) or `unoconv` — but in the standard Claude Code sandbox
`libreoffice --headless` is the reliable path.

### 7. Reconcile to master contract total

For multi-site master contracts: sum per-school totals must equal the
master grand total exactly. Do not proceed with sending if maths
doesn't reconcile.

### 8. Hand the PDF files to the user

Save outputs under `outputs/<project-name>/` numbered in master row order.
Both the .docx (editable) and .pdf (sendable) live side-by-side. Present the
PDFs to the user via `mcp__cowork__present_files` (fall back to plain
markdown `computer://` links if it errors on the path layout). The docx
files are kept as backups in case any contract needs hand-editing later.

## emailTo safety gate

The MCP unconditionally overrides `emailTo` to the API user on both
`send_quote_email` and `merge_division_document`. By design — PAT-authenticated
callers cannot directly email customers. Workflow is always:

1. Produce the document (locally for this skill, server-side for quotes)
2. Retrieve via `get_merge_output` if needed
3. User forwards from their own mail client

## Known pitfalls

1. **MergeData ContactNotSet** — bypass via client-side merge (see top).
2. **`totalMaintenanceValue` 2dp** — pass as string `"X.00"`, not a number.
3. **Cost in Word textbox** — needs raw XML manipulation, not python-docx
   `.paragraphs`.
4. **Source template trailing empty paragraphs** — trim 19 of 20 between
   "Please sign and return" and the version footer.
5. **`create_division` orphans CompanyId** — every call creates a fresh
   Company. Manual merge in UI required.
6. **`customDropdown2` resolver** — UI label only, despite schema saying FK
   codes work.
7. **Address line count varies** — Wimbledon template has 5 lines, most
   schools have 4. Merger replaces all 5; 5th becomes empty if school has
   fewer.
8. **`present_files` may reject paths** — fall back to plain markdown
   `computer://` links.
9. **£336 means two different things** — both the standard per-visit minimum
   for live contracts AND the non-service visit charge in the contract terms.
   Don't conflate.
10. **Three LibreOffice rendering quirks must be patched in normalise_anchors**:
    column-anchored images overshoot right margin; behindDoc=0 logos break
    the top page-frame border; v:shape with mso-height-percent stretches
    across pages and leaks bottom edge on page 2. All three fixes are baked
    into the merger above — don't strip them.

## Verification checklist

- [ ] All sites matched to DivisionIds (or new ones created)
- [ ] Per-site total computed correctly (rate × quantity, with the £336
      minimum applied)
- [ ] Versa fields populated on every Division (`get_division_details` shows
      them under "Versa Maintenance" section)
- [ ] All docx files produced under `outputs/<project>/`
- [ ] All docx converted to PDF in the same folder via LibreOffice
- [ ] Sample PDF spot-checked: page-frame border continuous on top and sides
      of every page, cost textbox doesn't leak a stray line on page 2
      bottom-right, VERSO logo sits inside frame on page 1 top-right
- [ ] Per-contract values verified against the master contract
- [ ] Sum of per-contract totals = master grand total exactly
- [ ] Newly-created Divisions flagged for the user to merge into the parent
      CompanyId
- [ ] Schools with missing data (no phone, no contacts) flagged so the user
      can fill in before sending
- [ ] PDFs (not docx) presented as the primary deliverable to the user

## Changelog

- 2026-05-06: Initial skill from session retrospective. Captured the
  contact-bypass pivot ("I just want the requirement to have a contact
  removed completely from this exercise"), the Wimbledon-template-as-source-
  of-truth pattern, the field mapping (StandardTextField5/6), the WCG
  standard rate card (£42 mobile / £81-140 wall pockets / £336 minimum), the
  customer-specific override pattern (Wellspring at £40, no per-site
  minimum), and the multi-site Phoenix Park split convention.
- 2026-05-06 (later same session): Added PDF as a required final step. The
  user explicitly wants PDFs as the deliverable, not docx. Added the
  LibreOffice batch-conversion pattern (`libreoffice --headless --convert-to
  pdf --outdir ... *.docx`) and updated the verification checklist.
- 2026-05-06 (third revision same session): Added image-anchor normalisation
  (column->page conversion + right-margin clamp) so the right-side VERSO
  logo doesn't overshoot the page-frame border in the PDF.
- 2026-05-06 (fourth revision same session): Added two more cross-renderer
  fixes alongside the column->page anchor conversion. (a) Set
  behindDoc="1" on all anchored images so the page-frame top horizontal
  border draws cleanly across the top, instead of being broken at the WCG
  logo. (b) Strip mso-height-percent / mso-height-relative / mso-width-relative
  from the cost-display v:shape and clamp its height to 30pt — LibreOffice
  interpreted mso-height-percent:200 as 200% of margin and stretched the
  textbox across two pages, leaking its bottom edge as a stray line on
  page 2. All three layout fixes now applied together in
  normalise_anchors().
- 2026-05-07: Hard-coded the price list and removed all override / negotiated-
  rate pathways. Earlier versions had a Wellspring worked example using £40
  per Mobile Table, which the model was extracting as evidence that pricing
  was variable. The price list is now stated as non-negotiable, the Wellspring
  example is removed, and Step 2 has no "ask the user" branch. If a future
  umbrella deal needs non-standard pricing, document it in the chat for that
  batch run — not in the skill.
