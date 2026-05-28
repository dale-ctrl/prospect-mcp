---
name: dimensions-supplier-matcher
description: >
  Reconcile free-text Supplier values on Prospect CRM QuoteLines against the
  Dimensions supplier master and produce a colour-coded Excel review
  spreadsheet showing the Dimensions code, supplier name, confidence score,
  ambiguity flag, and the top alternative candidates for each line. Trigger
  whenever the user asks to match, reconcile, fix, clean up, or check supplier
  codes / supplier names on a quote, order, or batch of quote lines — especially
  any mention of "Supplier doesn't come across to Dimensions", "supplier code
  missing", "Supplier is free text", "match supplier to Dimensions", or any
  variation of needing the CRM Supplier field to align with the Dimensions
  supplier master (codes like ARRW001 mapped to names like "Arrow Group Global
  Ltd."). Also trigger when a Dimensions supplier export and a CRM extract are
  attached together.
---

# Dimensions Supplier Matcher

## What this skill does

In Prospect CRM, the `Supplier` QuoteLine custom field is free text. When a
quote is converted to an order and pushed to Access Dimensions, Dimensions
needs the **supplier code** (e.g. `ARRW001`), not the free-text name (e.g.
`Arrow`). If the codes are wrong or missing, supplier purchase orders, cost
reconciliation and reporting all break.

This skill closes that loop: it takes the **Dimensions supplier master**
(code + name) and a **set of QuoteLines** with their free-text Supplier
values, and produces an Excel review spreadsheet showing for every line:

- the most likely Dimensions code + name
- a confidence score (0–100)
- a status (`EXACT` / `CONFIDENT` / `AMBIGUOUS` / `REVIEW` / `NO MATCH` / `MISSING`)
- up to 2 alternative candidates
- a suggested action (`Apply` / `Review` / `New supplier?`)

Dale (or whoever is running the workflow) reviews the spreadsheet and fixes
the QuoteLine `Supplier` field in Prospect by hand for any line that needs
updating. The skill does NOT write back to Prospect CRM — writing the matched
`Supplier Code` to the QuoteLine custom field makes no difference to how a
quote converts across to Dimensions, so it would be effort with no payoff.
The review spreadsheet is the deliverable.

## When to trigger

- "Match the suppliers on this quote against Dimensions"
- "The supplier code didn't come through to Dimensions for quote 12345"
- "I've got the Dimensions supplier export — clean up the suppliers on quote X"
- "Reconcile the QuoteLine Supplier text with the supplier list"
- Any mention of supplier code / supplier name reconciliation between Prospect
  and Dimensions

## Inputs

1. **Dimensions supplier master** — a CSV or XLSX with at minimum:
   - a code column (header containing "code" or "ref" — e.g. `Supplier Code`)
   - a name column (header containing "name" or "supplier" — e.g. `Supplier Name`)

2. **QuoteLines** — either:
   - a CSV/XLSX export of QuoteLines with a Supplier column, **or**
   - a Prospect CRM quote ID (the skill will pull the QuoteLines via the MCP
     and build the input CSV on the fly).

If the user hasn't supplied one or the other, ask via `AskUserQuestion`.

## How the matching works

The matcher (`scripts/match_suppliers.py`) normalises both sides — lowercase,
strip punctuation, strip legal suffixes (`Ltd`, `Limited`, `Plc`, `LLP`, `Inc`,
`GmbH`, `Company`, etc.) — and then scores each candidate using rapidfuzz's
`WRatio` (a composite scorer that handles prefixes, length mismatches, and
typos sensibly).

**Important**: words like `Group`, `Global`, `International`, `Holdings`, `UK`,
`Furniture` are **NOT** stripped — they are often the only thing distinguishing
two suppliers ("Arrow Group" vs "Arrow Furniture"). Do not add them to the
suffix list.

Confidence bands (defaults, tuneable via `--threshold` / `--ambiguity-gap`):

| Status     | Score range          | Gap to 2nd-best | Action          |
|------------|----------------------|-----------------|-----------------|
| EXACT      | the user typed the code itself (e.g. `ARRW001`) | n/a | Apply |
| CONFIDENT  | >= 90                | >= 10           | Apply           |
| AMBIGUOUS  | >= 90                | < 10            | Review          |
| REVIEW     | 70 – 89              | any             | Review          |
| NO MATCH   | < 70                 | any             | New supplier?   |
| MISSING    | empty/blank field    | n/a             | Add supplier text |

The two flags Dale specifically asked for:
- **Ambiguous** when two suppliers tie within 10 points (e.g. "Arrow" alone
  scores 90 against both `Arrow Group Global Ltd.` and `Arrow Furniture
  Solutions Ltd.`).
- **No match** when nothing in the master scores above 70 — surfaces as a
  potential new supplier to set up in Dimensions.

## Workflow

### Step 1 — Get the Dimensions supplier list

Ask Dale for the Dimensions supplier master export (CSV or XLSX). Suggested
SQL if exporting fresh from Dimensions:

```sql
-- Adjust for the actual Dimensions supplier table in this tenant
SELECT SupplierCode, SupplierName
FROM PLSupplier
WHERE Active = 1
ORDER BY SupplierCode;
```

Save under `inputs/` in the outputs folder (or wherever Dale points).

### Step 2 — Get the QuoteLines

Two routes:

**(a) From Prospect CRM via MCP** — preferred when Dale gives a quote ID:

```
get_quote(quoteId=<id>)            -> quote header + line summary
# For each line, pull the QuoteLineXtras to read the Supplier free-text field:
get_xtra_fields(entityType='QuoteLineXtras', parentId=<lineId>)
```

Build a CSV with at least these columns:
- `QuoteId`, `LineId`, `ProductCode`, `Description`, `Supplier`

**(b) From an export file** — user provides directly. Just verify the file
has a column whose header contains "supplier".

### Step 3 — Run the matcher

```bash
python scripts/match_suppliers.py \
    --suppliers   inputs/dimensions_suppliers.csv \
    --quotelines  inputs/quotelines.csv \
    --out         outputs/supplier_matches.xlsx
```

Optional flags:
- `--threshold 85` to lower the confidence bar (default 90)
- `--ambiguity-gap 5` to tighten ambiguity flagging (default 10)
- `--supplier-col "Supplier Name"` if the free-text column has an unusual header

The script prints a summary like:
```
Match summary:
  EXACT      1
  CONFIDENT  8
  AMBIGUOUS  1
  REVIEW     2
  NO MATCH   0
  MISSING    1
```

### Step 4 — Present the spreadsheet

Use `mcp__cowork__present_files` to share `supplier_matches.xlsx`. The
spreadsheet has two sheets:
- **Matches** — one row per quote line, colour-coded by status (green = exact,
  blue = confident, amber = ambiguous/review, red = no match, grey = missing).
- **Summary** — count by status.

## Pitfalls

1. **Don't strip distinguishing words.** If two suppliers share a base name
   (Arrow Group vs Arrow Furniture), the distinguishing word IS the data.
   Resist the urge to add "Group", "Global", "Holdings", "UK", "Furniture"
   to the suffix list — you'll collapse them into a single bucket and
   manufacture ambiguity.
2. **An EXACT match is the user typing the code itself** (`ARRW001`), not
   typing the supplier name. Don't conflate these.
3. **Dimensions code casing** — codes are uppercase in Dimensions; the
   matcher uppercases on lookup, so users can type `arrw001` and still hit.
4. **Empty Supplier values** are flagged `MISSING`, not `NO MATCH`. A no-match
   means there WAS text, it just doesn't resemble any supplier. Treat these
   differently — `MISSING` means "go ask the salesperson what supplier this
   is", `NO MATCH` means "this might be a new supplier we need to set up in
   Dimensions".
5. **Don't re-run the matcher with a stale Dimensions export.** If new
   suppliers have been added in Dimensions in the last week, re-export before
   matching, otherwise legitimate suppliers will show up as `NO MATCH`.
6. **Don't write the supplier code back to Prospect CRM.** Earlier drafts of
   this skill included an "Apply" step that called `update_quote_line_xtra`
   to set `Supplier Code` on confident matches. Dale confirmed this makes no
   difference to how a quote converts to Dimensions — the Dimensions side
   does not consume the QuoteLine custom field — so the write-back is effort
   with zero payoff. The deliverable is the review spreadsheet; the human
   updates Prospect by hand where they want to.

## Future extensions (not built yet)

- **Run-against-all-open-quotes mode** — sweep every open quote and produce
  one consolidated review file.
- **Live Dimensions SQL** — query Dimensions directly instead of relying on
  a CSV export. Needs DB credentials configured for the session.
- **Learning loop** — when the user manually corrects an AMBIGUOUS or REVIEW
  match, record it in `quoting_knowledge` (`save_quoting_lesson` with
  `category='supplier-<name>'`) so the next run gets it right automatically.

## Files in this skill

- `SKILL.md` — this file
- `scripts/match_suppliers.py` — the fuzzy matcher
- `test_suppliers.csv` — sample Dimensions supplier master (for regression)
- `test_quotelines.csv` — sample QuoteLines including the Arrow ambiguity,
  an exact-code hit, an empty value, and a no-match
- `test_output.xlsx` — expected output of running the matcher against the
  test inputs (useful for sanity-checking after script changes)

## Changelog

- **2026-05-28** — Initial skill. Built from a Cowork session where Dale
  identified that the Prospect CRM `Supplier` QuoteLine custom field is free
  text, and the Dimensions purchase ledger needs the supplier code (e.g.
  `ARRW001`) rather than a typed name (e.g. `Arrow`). The matcher uses
  rapidfuzz `WRatio` and a deliberately conservative suffix-strip list — only
  legal/incorporation tokens (Ltd, Plc, LLP, GmbH, Inc, Company, etc.) — to
  preserve distinguishing words like Group, Global, International, Holdings,
  UK, Furniture. Confidence bands and ambiguity-gap logic were tuned against
  a regression set including "Arrow" (ambiguous), "arrow group global ltd"
  (confident), "ARRW001" (exact code), an empty value (missing), and an
  unknown supplier "Brightline Furniture" (review). Dale also confirmed mid-
  session that writing the matched supplier code back to Prospect via
  `update_quote_line_xtra` does NOT influence the quote-to-Dimensions
  conversion, so the write-back step was removed from the workflow before
  shipping. The review spreadsheet is the only deliverable.
