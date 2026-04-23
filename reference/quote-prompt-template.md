# Prospect CRM — Quote Creation Prompt Template

Save this template somewhere handy (OneNote, a .txt file on your desktop, wherever). When you need to create a quote, copy the template, fill in the details, and paste the whole thing into Claude Desktop in the **ProspectCRM** project. Claude will create the opportunity and quote in one shot with no back-and-forth questions.

---

## How to Use

1. Copy the **Blank Template** below
2. Fill in every `<<FILL IN>>` section
3. Delete any lines that don't apply
4. Paste into Claude Desktop
5. Claude does everything and returns the quote link

---

## Blank Template

```
Create a new opportunity and quote for the following:

CUSTOMER
- Account / School name: <<FILL IN — e.g. Abbey Park School>>
- Postcode (to disambiguate): <<FILL IN — e.g. PE7 8EN>>
- Contact name: <<FILL IN — e.g. Conor Adderley>>
- (If contact doesn't exist: include their full details — Title, First name, Surname, Job title, Email, Phone)

OPPORTUNITY
- Description (generic, e.g. "Wall Pockets" or "Benchmarks"): <<FILL IN>>
- Type: <<FILL IN — one of: Acoustic / Breakout Furniture / Classroom Furniture / Design Fees / Dining Furniture (Non Versa) / Early Years / FF&E / IT Furniture / Lab/Food Tech / Library / Office Furniture / Outdoor / Reception-Staffroom / Refurb Works / Seating / Storage / Versa and Interiors / Versa Dining Furniture / Versa Maintenance / Washroom Refurb / Workspace Project>>
- Status: <<FILL IN — one of: Potential / Developing / Qualified / Awaiting Download / Design / Quoting>>
- Size (estimated value): <<FILL IN — one of: Up to 1k / 1k-5k / 5k-15k / 15k-30k / 30k-50k / 50k-100k / 100k-250k / 250k-500k / 500k+ / Unknown>>
- Margin Band: <<FILL IN — same scale as Size>>
- Source: <<FILL IN — one of: Sales Person / Existing Client / Website / Exhibition / Recommendation / Telemarketing / E-Shot / LinkedIn / NBS / Direct Mail / WG Driver>>
- Source activity (only if Source = Exhibition): <<FILL IN or DELETE — e.g. "Schools and Academies Show Nov 2026">>

QUOTE CONTENTS
- Products requested (describe in plain English, one per line):
  - <<FILL IN — e.g. 2x double 14ft wall pockets>>
  - <<FILL IN — e.g. 4x 12ft benchmark tables>>

QUOTE OPTIONS
- Groups / Options layout: <<FILL IN — "Single group" or "Multiple options with subtotals">>
- VERSAPLY required (only for wall pockets): <<Yes / No / DELETE IF NOT APPLICABLE>>
- Itemised or non-itemised: <<Itemised / Non-itemised>>
- Margin: <<Standard / Bespoke X%>>
- Salesperson: <<FILL IN — or "Use my default">>

Please create everything and give me the quote link with the recommended template to merge with.
```

---

## Filled-In Examples

### Example 1 — Simple single-group wall pocket quote

```
Create a new opportunity and quote for the following:

CUSTOMER
- Account / School name: Abbey Park School
- Postcode: PE7 8EN
- Contact name: Conor Adderley

OPPORTUNITY
- Description: Wall Pockets
- Type: Versa and Interiors
- Status: Quoting
- Size: 15k-30k
- Margin Band: 5k-15k
- Source: Sales Person

QUOTE CONTENTS
- Products requested:
  - 2x double 14ft against wall Wall Pockets (Secondary height)

QUOTE OPTIONS
- Groups / Options layout: Single group
- VERSAPLY required: Yes
- Itemised or non-itemised: Itemised
- Margin: Standard
- Salesperson: Use my default

Please create everything and give me the quote link with the recommended template to merge with.
```

### Example 2 — Multi-option quote (wall pockets vs benchmarks)

```
Create a new opportunity and quote for the following:

CUSTOMER
- Account / School name: Shireland Collegiate Academy Trust
- Postcode: B66 4ND
- Contact name: Sarah Mills

OPPORTUNITY
- Description: Wall Pockets & Benchmarks
- Type: Versa and Interiors
- Status: Developing
- Size: 30k-50k
- Margin Band: 15k-30k
- Source: Exhibition
- Source activity: Schools and Academies Show Nov 2026

QUOTE CONTENTS
- Products requested:
  - Option 1: 2x double 14ft against wall Wall Pockets (Secondary height)
  - Option 2: 6x 12ft benchmark tables

QUOTE OPTIONS
- Groups / Options layout: Multiple options with subtotals (one group per option)
- VERSAPLY required: Yes (for the Wall Pockets option)
- Itemised or non-itemised: Itemised
- Margin: Bespoke 30%
- Salesperson: Use my default

Please create everything and give me the quote link with the recommended template to merge with.
```

### Example 3 — Benchmark-only quote

```
Create a new opportunity and quote for the following:

CUSTOMER
- Account / School name: The Globe Primary Academy
- Postcode: E2 0PX
- Contact name: James Holt

OPPORTUNITY
- Description: Benchmarks
- Type: Versa Dining Furniture
- Status: Quoting
- Size: 5k-15k
- Margin Band: 2k-5k
- Source: Existing Client

QUOTE CONTENTS
- Products requested:
  - 8x 12ft benchmark tables (Secondary height)

QUOTE OPTIONS
- Groups / Options layout: Single group
- Itemised or non-itemised: Non-itemised
- Margin: Standard
- Salesperson: Use my default

Please create everything and give me the quote link with the recommended template to merge with.
```

### Example 4 — New contact that doesn't exist yet

```
Create a new opportunity and quote for the following:

CUSTOMER
- Account / School name: Oakwood Primary School
- Postcode: TQ14 8BD
- Contact (new — doesn't exist yet):
  - Title: Mr
  - First name: Michael
  - Surname: Thompson
  - Job title: Business Manager
  - Email: m.thompson@oakwood.devon.sch.uk
  - Phone: 01626 888777

OPPORTUNITY
- Description: Wall Pockets
- Type: Versa and Interiors
- Status: Qualified
- Size: 15k-30k
- Margin Band: 5k-15k
- Source: Recommendation

QUOTE CONTENTS
- Products requested:
  - 1x double 14ft against wall Wall Pocket (Primary height)
  - 1x single 12ft against wall Wall Pocket (Primary height)

QUOTE OPTIONS
- Groups / Options layout: Single group
- VERSAPLY required: Yes
- Itemised or non-itemised: Itemised
- Margin: Standard
- Salesperson: Use my default

Please create everything and give me the quote link with the recommended template to merge with.
```

---

## Tips

- **Delete any fields that don't apply** — e.g. skip "Source activity" if source isn't Exhibition, skip VERSAPLY if not quoting wall pockets
- **Be specific about heights** for wall pockets and benchmarks (Primary / Secondary / Infant)
- **List products clearly** — Claude expands "2x double 14ft wall pockets" into the full 7-component configuration automatically
- **For multi-option quotes**, number them as "Option 1:", "Option 2:" etc. so Claude creates separate groups
- **If you want a bespoke margin**, specify the percentage — e.g. "Bespoke 35%"
- **"Use my default" for salesperson** will use whoever is set as your CRM user
