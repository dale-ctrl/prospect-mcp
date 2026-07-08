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

- **Equipment string format.** Always spell out **"Wall Pocket"** in
  full when the item is a wall pocket — never abbreviate to just
  "Pocket". Space the `x` on both sides, and pluralise "Pocket"/"Table"
  only when the quantity isn't 1: `"1 x Double Wall Pocket"`,
  `"2 x Double Wall Pockets"`, `"1 x Mobile Table"`,
  `"9 x Mobile Tables"`. Default descriptors: `"N x Mobile Table(s)"`,
  `"N x Single Wall Pocket(s)"`, `"N x Double Wall Pocket(s)"`,
  `"N x Triple Wall Pocket(s)"`, `"N x Quad Wall Pocket(s)"`. If the
  user specifies a brand (Benchmark, Spaceright, or Sico), include it
  in the string, e.g. `"9 x Versa Benchmark Tables"`. Pricing is the
  same for any Mobile Table brand. For mixed equipment on one site, put
  each quantity/description on its **own line** (newline-separated, NOT
  comma-separated):

  ```
  5 x Mobile Tables
  2 x Single Wall Pockets
  ```

  i.e. join items with `\n` — `"5 x Mobile Tables\n2 x Single Wall Pockets"`.
  This lands as separate lines in the CRM Versa field AND as separate
  lines inside the contract's equipment cell (see Step 2 + Step 3 for
  the wire formats).
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

### 0. Mount the Downloads folder (FIRST STEP, every run)

Files written from the sandbox into the cowork session outputs path
(`local_*/outputs`) inherit Linux-side ownership only. Adobe Acrobat
refuses to open them with "There was an error opening this document.
Access denied." Edge silently fails to render them. The same happens
with any other Windows app strict about file ACLs.

Fix: at the very start of every run, call
`mcp__cowork__request_cowork_directory({ path: "~/Downloads" })`
directly — do NOT open the folder picker for this skill. WCG always
runs Versa Maintenance Contracts out of the user's Downloads folder;
that's where the existing `Versa Maintenance Contracts` archive and
all prior per-school contracts already live, and passing the path
directly skips a picker prompt the user doesn't want for this
workflow. `~/Downloads` expands per-user, so this still contains no
hardcoded username and works for any user without edits.

After the folder is connected, use the mount path returned by
`request_cowork_directory` as the project root, and create
`<mount>/<project-name>/` as the output subfolder. Save both the
docx and pdf there. Never save the deliverable inside the cowork
session outputs path.

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

### 1c. Pre-merge data quality check (for every Division)

Before computing totals or writing fields, run `get_division_details` and
sanity-check the data that will land in the contract. Surface any of these
to the user before proceeding:

- **Phone number malformed.** UK landlines should have ≥9 digits when
  non-digits are stripped. The Westcountry Interiors run found `"696300"`
  (6 digits — missing the `01752` STD code). Rule:
  ```python
  if len(re.sub(r'\D', '', phone or '')) < 9:
      flag(f"Phone '{phone}' on {name} looks short — expected ≥9 digits for a UK landline.")
  ```
  Tell the user; they can update the Division phone in CRM before the contract
  is generated, or proceed knowingly.
- **Address lines missing.** The contract template has 5 address rows. If
  fewer are populated, the empty rows render blank in the merged docx — fine,
  but flag if the postcode field is empty (that always looks wrong on the
  contract).
- **No primary contact email.** The "Email address" row on the contract is
  blank by design (the template doesn't pull from contacts) — but if the user
  wants an email recipient on the contract face, the Division must have a
  primary contact set first.

### 2. Compute the per-site total and write Versa fields

Apply the price list from "Pricing — non-negotiable" above. The maths
is fixed; do not ask the user to confirm any of it.

```python
# Look up the per-unit rate from the price list above
subtotal = sum(quantity * per_unit_rate for each equipment type)
total_value = max(subtotal, 336.00)
```

**Pre-update conflict check.** Before calling
`update_division_versa_maintenance`, fetch the Division's existing Versa
fields via `get_division_details` and compare to what you're about to
write. If the existing fields are non-empty AND different from the new
figures, surface the conflict to the user:

```
Division 5380 (Westcountry Interiors Ltd) already has:
  Equipment: 9 x Mobile Tables
  Total:     378.00

About to overwrite with:
  Equipment: 14 x Mobile Tables
  Total:     588.00

Proceed? (yes / keep existing / cancel)
```

This catches accidental overwrites of an active contract. Do not silently
overwrite — the previous contract may still be in force, and the user may
want to keep both records or chase the existing contract first.

If the existing values match what you'd write, no need to ask — just proceed.

Then call:

```
update_division_versa_maintenance({
  divisionId: <id>,
  equipmentMaintained: "5 x Mobile Tables\n2 x Single Wall Pockets",   # newline-joined multi-line string
  totalMaintenanceValue: "X.00"                                  # STRING, 2dp, no currency symbol
})
```

**`equipmentMaintained` must be the newline-joined multi-line string**
(items separated by `\n`, not commas) so each quantity/description lands
on its own line in `DivisionXtra.StandardTextField5`. The CRM textarea
preserves the `\n`s as visible line breaks. For a single-item contract,
pass a single line with no trailing newline, e.g. `"9 x Mobile Tables"`.

### 3. Produce the merged docx (client-side)

**Get a template:**

```
search_documents({ description: "Versa Maintenance Contract", top: 1 })
get_merge_output({ documentId: <hit>, saveTo: "/tmp/versa_template.docx" })
```

This gives you a docx with all WCG branding/styles already applied — only
the per-school data needs swapping.

**Detect source values dynamically — do NOT hardcode them.**

The template that comes back from `search_documents` + `get_merge_output`
is whatever Versa Maintenance Contract document is most recent on the
connector — Wimbledon today, somebody else tomorrow. Extract the source
values from the template's own table cells + cost textbox at runtime,
then use those as the find-and-replace sources. Hardcoding strings like
"Wimbledon Park Primary School" / "Havana Road" / "378.00" silently
breaks the moment the most-recent doc is a different customer's merge:
the find-and-replace simply doesn't match, and the previous customer's
details leak through into the output.

Where each value lives in the unzipped docx:

- Client name — `table[0]` cell `[0,1]`
- Site address (multi-line) — `table[0]` cell `[1,1]`, split on
  newlines into N address strings (4 or 5 lines depending on the
  source school)
- Tel No — `table[0]` cell `[2,1]`
- Equipment to be maintained — `table[0]` cell `[4,1]`
- Cost — the contents of the single `<w:txbxContent>` textbox in
  `word/document.xml`, e.g. `"£378.00 ex VAT"` — extract the numeric
  portion (`"378.00"`) for replacement

**Important:** the cost lives in a Word textbox, not a paragraph.
python-docx's `.paragraphs` iteration won't see it. Use raw XML on
`word/document.xml` and `str.replace()` on the unzipped XML — the
cost string only occurs once in the document.

```python
import re
import zipfile
from docx import Document

COST_RE = re.compile(r'£?\s*(\d+(?:\.\d{2})?)\s*(?:ex\s*VAT)?', re.IGNORECASE)

def detect_source_values(template_path):
    """
    Read source values out of whatever Versa Maintenance template comes
    back from the connector. Returns a dict the caller hands to
    build_replacements() alongside the target dict.
    """
    doc = Document(template_path)
    t0 = doc.tables[0]
    address_cell = t0.cell(1, 1).text
    address_lines = [line.strip() for line in address_cell.split('\n') if line.strip()]

    # Cost lives in the body XML's single textbox, not in a paragraph.
    # Read the unzipped document.xml and pull the numeric portion.
    with zipfile.ZipFile(template_path) as zf:
        body_xml = zf.read('word/document.xml').decode('utf-8')
    txbx = re.search(r'<w:txbxContent>(.*?)</w:txbxContent>', body_xml, re.DOTALL)
    if not txbx:
        raise SystemExit('template has no <w:txbxContent> textbox — cost source missing')
    txbx_text = re.sub(r'<[^>]+>', '', txbx.group(1))
    cost_match = COST_RE.search(txbx_text)
    if not cost_match:
        raise SystemExit(f'could not extract numeric cost from textbox: {txbx_text!r}')

    return {
        'client_name':   t0.cell(0, 1).text.strip(),
        'address_lines': address_lines,           # list, length 4 or 5
        'tel_no':        t0.cell(2, 1).text.strip(),
        'equipment':     t0.cell(4, 1).text.strip(),
        'cost':          cost_match.group(1),     # e.g. "378.00"
    }

def build_replacements(detected, target):
    """
    Build the ordered (src -> dst) list. Order matters: longer/more
    specific strings first, so a substring collision (e.g. detected
    client name appearing inside an address line) can't bite later
    replacements.

    The equipment value is XML-encoded with in-paragraph Word line breaks
    (</w:t><w:br/><w:t>) for each newline so multi-item contracts render
    as separate lines inside the equipment cell. See the callout below.
    """
    pairs = [
        (detected['client_name'], target['client_name']),    # MUST be first
        (detected['equipment'],   target['equipment'].replace(
            '\n', '</w:t><w:br/><w:t>')),
        (detected['tel_no'],      target['tel_no']),
        (detected['cost'],        f"{target['total_value']:.2f}"),
    ]
    # Address lines: pair detected against target, padding the shorter side
    # with '' so leftover source lines get blanked rather than left in.
    src_addr = detected['address_lines']
    dst_addr = list(target['address_lines'])
    while len(dst_addr) < len(src_addr):
        dst_addr.append('')
    pairs.extend(zip(src_addr, dst_addr))
    return pairs
```

**Equipment cell — inject `<w:br/>` for each line, NOT a bare `\n`.**
The equipment value lands in `table[0]` cell `[4,1]` — a single Word
table cell. The target string from Step 2 is multi-line
(`"5 x Mobile Tables\n2 x Single Wall Pockets"`), but **a bare `\n` inside an
XML `<w:t>` text node will NOT produce a visible line break in the
rendered docx** — to Word it's just whitespace. The cell will collapse
both items onto one line with a space between them.

Word's in-paragraph line break is the `<w:br/>` element, which has to
sit BETWEEN run-text elements: close the source `<w:t>`, emit `<w:br/>`,
reopen `<w:t>`. The equipment-pair line in `build_replacements()` above
does exactly that — each `\n` becomes `</w:t><w:br/><w:t>` before the
string is fed into `xml.replace(old, new, 1)`. The final inserted run
ends up looking like:

```
<w:t>5 x Mobile Tables</w:t><w:br/><w:t>2 x Single Wall Pockets</w:t>
```

which Word renders as two lines inside the same paragraph (and the same
cell). Only the **equipment** replacement needs this transform — every
other detected/target pair (client name, tel, address lines, cost) is
single-line plain text and stays as-is.

**Watch for transient duplicates in REPLACEMENTS.** Some detected
source strings appear twice in the XML *until* an earlier replacement
runs. The classic example: the detected client name may also appear
as a word in one of the address lines (a Wimbledon-style template has
"Wimbledon" in BOTH the school name and the address). If you
sanity-check all REPLACEMENTS counts upfront, the count for the
overlap word is 2 and any `if count != 1` check fails the run.

The fix is to count *per-step*, after each prior replacement has run,
not all upfront. `build_replacements()` above orders the client name
first, so by the time the address lines are processed the client-name
copy is already gone:

```python
detected = detect_source_values('/tmp/versa_template.docx')
target = {
    'client_name':   new_client_name,
    'equipment':     new_equipment,             # e.g. "9 x Mobile Tables"
    'tel_no':        new_tel_no,
    'address_lines': new_address_lines,         # list of 4 or 5 strings
    'total_value':   new_total_value,           # float, e.g. 378.00
}
replacements = build_replacements(detected, target)

with zipfile.ZipFile(template_path) as zf:
    xml = zf.read('word/document.xml').decode('utf-8')

for old, new in replacements:
    if not old:                  # skip empty detected lines (shorter source address)
        continue
    cnt = xml.count(old)
    if cnt < 1:
        raise SystemExit(f"missing {old!r} in template — layout may have changed")
    xml = xml.replace(old, new, 1)   # replace one at a time
```

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
The merger itself doesn't care which prior merge is used as the
template — only the structural layout matters: `table[0]` rows
0/1/2/4 in column index 1, plus a single `<w:txbxContent>` textbox
for the cost. As long as that layout is preserved, any prior merge
on the connector works as a template source; `detect_source_values()`
will pull the right strings out of it.

### 4. Trim the empty paragraphs between signature and footer

The Wimbledon template has 19-20 empty paragraphs between "Please sign and
return" and the version-date footer (e.g. "Sept 2025 (2)"). Without
trimming, the contract gets a blank trailing page. Trim them down to 1,
keeping the version footer on the same page as the signature block.

**Critical:** these are NOT trailing paragraphs (they are not at the very
end of the body — the version footer comes after them). A naive
"remove trailing empty paragraphs after sectPr" approach trims zero. And
a "collapse every run of N+ empty paragraphs to 1" approach over-trims:
several mid-document runs (between "THIS CONTRACT ANNUAL COST" and the
signature block) reserve vertical space behind the floating cost textbox
and must be left alone.

Use this targeted trim — find "Please sign and return", find the next
version-date footer line (matches `(Jan|Feb|...|Sept|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}`),
and remove only the empty paragraphs between them:

```python
W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
T_TAG = f'{{{W_NS}}}t'
P_TAG = f'{{{W_NS}}}p'

def text_of(el):
    if el.tag != P_TAG:
        return ''
    return ''.join((t.text or '') for t in el.iter(T_TAG)).strip()

def is_empty_para(el):
    return el.tag == P_TAG and not text_of(el)

root = etree.fromstring(xml.encode('utf-8'))
body = root.find(f'{{{W_NS}}}body')
children = list(body)

sign_idx = None
footer_idx = None
for i, el in enumerate(children):
    txt = text_of(el)
    if txt == 'Please sign and return':
        sign_idx = i
    elif sign_idx is not None and footer_idx is None and re.match(
            r'(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{4}', txt):
        footer_idx = i
        break

# Keep ONE empty paragraph after sign_idx, remove the rest up to footer_idx
if sign_idx is not None and footer_idx is not None and footer_idx - sign_idx > 2:
    for el in children[sign_idx + 2 : footer_idx]:
        if is_empty_para(el):
            body.remove(el)

# Serialise body back to XML for re-zipping
xml = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True).decode('utf-8')
```

After trim, the typical paragraph count drops from ~124 to ~105.

### 5. Verify each merged output

Re-open and grep for: all target values present, all template-source
residue gone, paragraph count ~105 (in the range 100–110 — significantly
above 110 means the trim didn't run and the PDF will have a blank trailing
page; significantly below 100 means the trim was too aggressive and may
have collapsed the spacing for the floating cost textbox).

**Expected page count: 3 pages** (not 2). The Wimbledon-template structure
is:
- Page 1: client + address + intro + works/services included
- Page 2: terms, exclusions, parts, "THIS CONTRACT ANNUAL COST £X.00 ex VAT"
- Page 3: signature block + "Please sign and return" + "Sept 2025 (2)" footer

If the PDF comes out as 4 pages, the trim probably didn't run. If it comes
out as 2 pages, something has compacted the layout — investigate before
shipping (the cost textbox may have moved up under the terms block).

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

Save outputs under `<mount>/<project-name>/` (the mount path returned
by Step 0's `request_cowork_directory` call), numbered in master row
order. Both the .docx (editable) and .pdf (sendable) live side-by-side.
Present the PDFs to the user via `mcp__cowork__present_files` (fall
back to plain markdown `computer://` links if it errors on the path
layout — paths with spaces or non-ASCII characters often trip it). The
docx files are kept as backups in case any contract needs hand-editing
later.

Never save deliverables under the cowork session outputs path
(`local_*/outputs`). Files written there cannot be opened by Adobe
Acrobat — see Step 0.

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
4. **Empty paragraphs to trim are NOT trailing** — they sit between
   "Please sign and return" and the "Sept 2025 (2)" version footer. Use
   the targeted-trim snippet in Step 4. A trailing-only or "collapse every
   run" approach will be wrong.
5. **REPLACEMENTS transient duplicates** — "Wimbledon" appears in both the
   school name and the address line; count per-step, not upfront, and
   replace longer-and-more-specific strings first (see Step 3).
6. **Existing Versa fields silently overwritten** — always `get_division_details`
   first, surface a conflict if the existing data differs from what's
   about to be written (see Step 2).
7. **Truncated phone numbers in CRM** — UK landlines under 9 digits suggest
   the STD code is missing. Flag pre-merge so the user can fix the CRM
   record (see Step 1c).
8. **`create_division` orphans CompanyId** — every call creates a fresh
   Company. Manual merge in UI required.
9. **`customDropdown2` resolver** — UI label only, despite schema saying FK
   codes work.
10. **Address line count varies** — Wimbledon template has 5 lines, most
    schools have 4. Merger replaces all 5; 5th becomes empty if school has
    fewer.
11. **`present_files` may reject paths** — fall back to plain markdown
    `computer://` links. Most likely on paths with spaces or non-ASCII
    characters.
12. **£336 means two different things** — both the standard per-visit minimum
    for live contracts AND the non-service visit charge in the contract terms.
    Don't conflate.
13. **Three LibreOffice rendering quirks must be patched in normalise_anchors**:
    column-anchored images overshoot right margin; behindDoc=0 logos break
    the top page-frame border; v:shape with mso-height-percent stretches
    across pages and leaks bottom edge on page 2. All three fixes are baked
    into the merger above — don't strip them.
14. **Cowork session outputs path has wrong Windows ACLs.** Files written
    via the sandbox to `local_*/outputs` cannot be opened by Adobe Acrobat
    ("Access denied") and Edge fails to render them. Always use Step 0's
    `request_cowork_directory` mount instead. Never hardcode user-specific
    paths like `C:\Users\<name>\...` — the skill must work for any user.

## Verification checklist

- [ ] User-owned output folder mounted via `request_cowork_directory`
      at the start of the run (not the cowork session outputs path)
- [ ] All sites matched to DivisionIds (or new ones created)
- [ ] Pre-merge data quality checked: phone ≥9 digits, address populated,
      missing data flagged to user
- [ ] Existing Versa fields checked before overwrite; conflicts surfaced
      to user
- [ ] Per-site total computed correctly (rate × quantity, with the £336
      minimum applied)
- [ ] Versa fields populated on every Division (`get_division_details` shows
      them under "Versa Maintenance" section)
- [ ] All docx files produced under `<mount>/<project>/`
- [ ] Targeted trim ran: paragraph count in 100–110 range
- [ ] All docx converted to PDF in the same folder via LibreOffice
- [ ] PDF page count = 3 (page 1 client/intro, page 2 terms/cost,
      page 3 signature/footer)
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

- 2026-07-08 (v1.33.0): Two tightenings from a Treleigh Community
  Primary School run. (a) Step 0 now mounts `~/Downloads` directly via
  `request_cowork_directory({ path: "~/Downloads" })` instead of opening
  the folder picker — WCG always works Versa Maintenance Contracts out
  of Downloads, where the existing contract archive lives. (b) Equipment
  string format now always spells out "Wall Pocket" in full (never just
  "Pocket") and spaces the `x` on both sides — `"1 x Double Wall
  Pocket"`, `"2 x Double Wall Pockets"`, `"9 x Mobile Tables"` — updated
  in the Business rules bullet plus the matching Step 2/Step 3 code
  examples and comments for consistency.
- 2026-06-26: Equipment formatting switched from comma-separated to
  one-line-per-item. Two layers, must be kept in sync:
  (a) **CRM side** — `equipmentMaintained` passed to
  `update_division_versa_maintenance` is now a newline-joined multi-line
  string (`"5x Mobile Tables\n2x Single Pockets"`), so each item lands on
  a separate line in `DivisionXtra.StandardTextField5`. The CRM textarea
  preserves `\n` as a visible line break.
  (b) **Contract docx side** — the equipment cell is `table[0]` cell
  `[4,1]`, a single Word table cell. A bare `\n` inside a `<w:t>` XML
  text node is just whitespace, NOT a line break, and would collapse
  multi-item equipment onto one line. `build_replacements()` in Step 3
  now converts each `\n` in `target['equipment']` to the in-paragraph
  Word line-break sequence `</w:t><w:br/><w:t>` (close run text, emit
  `<w:br/>`, reopen) so multiple items render as separate lines within
  that single cell. Only the equipment pair gets this transform — every
  other replacement stays plain text. Pricing rules (£42 / £81–140 /
  £336 minimum) unchanged.
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
- 2026-05-07 (later same session): Added Step 0 (mount a user-owned output
  folder via `request_cowork_directory`) and made it the first action of
  every run. Discovered during the Westcountry Interiors run: PDFs written
  to the cowork session outputs path (`local_*/outputs`) inherit Linux-side
  ACLs only, and Adobe Acrobat refuses to open them ("There was an error
  opening this document. Access denied."), Edge silently fails. Files
  written into a user-mounted folder inherit proper Windows ACLs and open
  cleanly. The skill must NOT hardcode any user-specific path — it must
  work for any user without edits, so the user picks the destination at
  the start of each run.
- 2026-05-07 (Westcountry Interiors retro): Five tightenings folded in after
  the single-site Westcountry Interiors run.
  (a) Step 4 trim now has an explicit implementation snippet — earlier
  versions described it in prose, leading to two wrong attempts: a
  "trailing-only" trim that removed zero paragraphs, and a "collapse every
  run of 4+ empties" that over-trimmed the floating-cost-textbox spacing.
  Targeted-trim locates "Please sign and return" and the next version-date
  footer, then removes only the empties between them.
  (b) Step 3 now warns about REPLACEMENTS transient duplicates (e.g.
  "Wimbledon" appears in both the school name and the address line) and
  requires per-step counts rather than an upfront pass.
  (c) Step 2 now mandates a pre-update conflict check via
  `get_division_details` before overwriting non-empty Versa fields. The
  Westcountry Interiors run silently overwrote 9x/£378 with 14x/£588 — fine
  in this case, but the skill should never silently clobber an active
  contract.
  (d) Step 1c added: pre-merge data quality check, including a UK-landline
  digit-count rule (≥9 digits when stripped of non-digits). Westcountry
  Interiors had `"696300"` — 6 digits, missing the 01752 STD code; the
  contract went out short.
  (e) Step 5 verification now states the expected page count is 3, not 2,
  to head off over-trimming attempts aimed at a 2-page result.
- 2026-05-07 (template-source robustness): Step 3 now detects source
  values dynamically from the template's own `table[0]` cells and the
  `<w:txbxContent>` cost textbox, rather than hardcoding Wimbledon Park
  reference values (Wimbledon Park Primary School / Havana Road / 020
  8946 4925 / 9 x Versa Benchmark Tables / 378.00) as the
  find-and-replace sources. Earlier versions hardcoded those because
  the most recent Versa Maintenance Contract.docx in CRM happened to
  be Wimbledon-style. As soon as a different customer's merge becomes
  the most recent doc on the connector, the hardcoded sources stop
  matching and the script silently leaves the previous customer's
  details in the output. Step 3 now uses a `detect_source_values(
  template_path)` helper that returns a dict, plus a
  `build_replacements(detected, target)` helper that emits the ordered
  (src -> dst) map with the client name first so substring collisions
  (detected client name appearing inside an address line) can't bite
  later address-line replacements.
