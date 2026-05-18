---
name: prospect-crm-show-lead-import
description: >
  Bulk import of exhibition/show leads into Prospect CRM with full account
  enrichment, MAT linkage, campaign membership, scanner-attributed activity
  notes, and BDE-assigned follow-up tasks. Trigger whenever the user asks
  to import, load, process, or bulk-create show leads (Schools & Academies,
  BETT, ISBA, Festival of Education, MAT Summit, ISC, or any other Westcountry
  Group trade-show lead spreadsheet). Also trigger when the user says
  "process the show spreadsheet", "load the show leads", "build out the
  campaign from the show", or references a recently created campaign whose
  contacts/enquiries still need to be populated. ALWAYS use the phased
  gate-driven approach defined below — never bulk-load in one pass.
---

# Prospect CRM — Show Lead Import (Phased)

## WCG Environment Context

- **Prospect CRM** via the `prospect-crm` MCP connector (OData v1, bearer token).
  Key user: DL. All writes go through the MCP — never call the OData endpoint directly.
- **Input**: an Excel/CSV spreadsheet exported from the show scanner, plus a
  pre-created Campaign (CampaignId supplied by the user) and Activity (ActivityId).
- **Enrichment sources**:
  - **GIAS** (Get Information About Schools) for schools — URN, pupil numbers, phase,
    age range, headteacher, MAT name, school status (Open / Proposed / etc.).
  - **Companies House** for commercial / non-school leads.

## Prerequisites — confirm before starting

The user MUST supply, or Claude MUST ask for:

1. **Spreadsheet path** (in workspace folder).
2. **CampaignId** and **ActivityId** (campaigns are created manually in advance).
3. **Show name** in canonical form (e.g. "Schools & Academies Show May 2026").
   This becomes the Source value on every new Division.
4. **Show date** and **follow-up task date** (typically next working day after
   the show — Claude must skip weekends).
5. **Scanner names** that appear in the spreadsheet (e.g. "Phill McConnell",
   "Andrew", "Kevin S") and the CRM user code for each. Notes are authored
   under the scanner's user code, NOT under DL.
6. **Edit-existing-contacts policy.** Ask explicitly: "If I find an existing
   contact with a blank Email / blank MobilePhoneNumber and the spreadsheet
   has a value for that field, may I patch the blank?" Defaults to NO unless
   the user opts in. See Pitfall #37.

If anything in this list is missing, STOP and ask before reading the spreadsheet.

## Workflow — 9 phases with user gates

> **Gate discipline.** Between every phase, write a staging artefact to the
> outputs folder and present a 1-paragraph summary to the user. Do NOT proceed
> to the next phase without explicit "proceed" / "go" / "yes" from the user.
> If a phase fails partway, halt and surface the gap — never silently retry.

---

### Phase 0 — Prep & parse

1. Read the spreadsheet. Normalise columns: forename, surname, jobTitle, company,
   email, mobile, landline, postcode, scanner, areas_of_interest, job_function,
   org_type, age_range, region, note, score (if present), tier (if present).
2. Compute `postcode_prefix` (first 2–4 chars before the space).
3. Dedupe within the spreadsheet itself — flag duplicate emails, duplicate
   company+lastname pairs.
4. Record the **session-start TaskId watermark**: call `search_tasks` with no
   filters, top=1, ordered by latest, and save the highest TaskId returned.
   ANY task with TaskId ≤ watermark is pre-session and MUST NOT be deleted
   or modified during this run.

**Gate 0 output**: `outputs/<show-slug>/00_parsed_leads.json` — count of rows,
duplicate flags, watermark TaskId. User confirms before proceeding.

---

### Phase 1 — Triage / match existing

> **Many-to-one rule.** Multiple lead rows can point to the same Division —
> e.g. three teachers from the same school each visit the stand and get
> scanned separately. Each lead row becomes its own Contact, Enquiry, Note,
> and Task, but they all share one DivisionId. Build the matching in two
> levels: Division-level (deduplicated by company) and Contact-level
> (per-row).

> **🚨 EXISTING-ACCOUNT SEARCH IS MANDATORY.** This is the single biggest
> failure mode of the May 2026 import: 19 of 67 newly-created Divisions
> duplicated pre-existing accounts that had been in the CRM for years
> (Shooters Hill, Gunnersbury Catholic, Alleyn's, George Green's, etc.).
> Every one of those 19 had to be merged back into the existing account
> after the fact. Phase 1 MUST exhaust the search before any Division is
> queued for creation.

For each lead row:

1. **Division match — search the existing CRM exhaustively first**:
   - First, **group lead rows by normalised company name + postcode**.
     Two rows with company "St Bridget's CofE School" and postcode "BL9 7TT"
     are the same Division — they should resolve to one DivisionId.
   - For each unique company group, run AT LEAST these searches:
     - `search_divisions(searchTerm=<full name>)` — top=10
     - `search_divisions(searchTerm=<full name minus suffix>)` — drop
       "School", "Academy", "Trust", "College", "Multi Academy Trust"
     - `search_divisions(searchTerm=<first 2 words>)` — for trusts and
       branded names
     - **🚨 MANDATORY postcode-prefix sweep:**
       `list_divisions(filters={postcode: <postcode prefix>})` pulls every
       Division in the same postcode area. **Run this for EVERY new
       candidate, even when name searches return no matches.** It's the
       only way to catch existing accounts where the spelling diverges
       enough that `search_divisions` misses. ISBA 2026 case: "Halstead
       St Andrew's School" (DivId 4556, GU21 4QW, AM JM) was missed by
       all `search_divisions` passes ("Hallstead St Andrews", "Halstead
       St Andrews", "Halstead St Andrew", etc.) because the spreadsheet
       had the plural form without apostrophe and the CRM has the
       apostrophised singular form. It appeared immediately when listing
       GU21 postcodes. See Pitfalls #20 and #31.
     - For schools, try GIAS URN cross-reference if extractable
     - For commercial orgs, `lookup_company_info` (Companies House) by
       registered name
   - **Spelling tolerance**: "Cardinal Hume Acadmies Trust" (lead) ↔
     "The Cardinal Hume Academies Trust" (CRM) is a match. "George Greens
     school" ↔ "George Green's School" is a match. "Halstead St Andrews"
     ↔ "Halstead St Andrew's School" is a match. Common variants:
     missing apostrophes, missing definite article "The", "St" vs "Saint",
     plural-vs-singular "Andrews"/"Andrew's"/"Andrew", "CofE" vs "C of E"
     vs "CE" vs "Catholic" (do NOT auto-collapse CofE and Catholic — those
     are different denominations).
   - **Postcode disambiguation**: if two existing accounts have the same
     name, prefer the one whose postcode prefix matches.
   - Output per group: `matched` (existing DivId) / `new` (will create one
     Division for the whole group) / `ambiguous` (multiple candidates).
2. **Contact match within matched division** (per row):
   - Primary: email (case-insensitive, trim).
   - Secondary: phone last-7-digits.
   - Tertiary: full name within the matched division.
   - **Critical**: if the spreadsheet spelling differs from CRM (Neslihan
     "Furlan" vs CRM "Fulan") but email/phone match — that IS the same person.
     DO NOT create a new contact in that case.
   - **Critical (multi-attendee case)**: two lead rows from the same school
     are usually two different people. Match each row's contact independently
     against existing CRM contacts — never collapse two leads into one Contact
     just because they share a Division. If two scanner rows have the same
     email, flag as duplicate-within-spreadsheet (a single attendee scanned
     twice) and ask the user.
   - **Within-sheet duplicate scanner-merged note pattern** (Pitfall #33):
     when collapsing two rows for the same person scanned by different
     scanners on the same day, create ONE Contact / ONE merged note with
     both scanners' text labelled by row / ONE enquiry / ONE task.

**Gate 1 output**: `outputs/<show-slug>/01_staging.xlsx` with one row per lead,
columns showing match status, **group_key** (the company-level dedup key),
candidate IDs, match basis. User reviews **ambiguous rows in particular**
and confirms direction for each. Staging should also include a separate
sheet listing unique Divisions to create with their member lead-row counts.

---

### Phase 2 — Enrichment

For every "new" Division (and optionally for matched ones with missing data):

1. **Schools** — GIAS lookup. Capture URN, pupil capacity, phase
   (Primary / Secondary / All-through / etc.), age range, school status
   (Open / Proposed / Closed), school type (Academy / VA / Community / Free
   / Independent), MAT name, headteacher, address (preferring GIAS address
   over the show spreadsheet address if they differ).
2. **Commercial / non-school** — Companies House lookup. Capture registered
   address, SIC codes, status, company description.
3. **Postcode-driven assignment — applies ONLY to NEW Divisions**:
   - Look up the postcode prefix in the `wcg_postcode_map` reference (see
     Business Rules). Outputs:
     - Account Manager code (ML / ML1 / JM / JL)
     - BDE code (AW / RM / CL / CL1)
     - Office Allocated (ANDOVER for ML/JM, PLYMOUTH for ML1/JL)
     - Delivery Office (same as Office Allocated)
     - Territory code (full FK, see Business Rules)
     - Region label

> **🚨 RETAINED-AM RULE.** If a lead matched to an EXISTING Division in
> Phase 1, the **existing AM is retained** — do NOT overwrite based on
> postcode. This handles the "Shooters Hill case": SE18 is a CML
> (Miles Liesching) postcode area by the mapping, but the existing
> Shooters Hill College account is held by John Morrish. When the JM-held
> account is matched, JM keeps the account regardless of what the postcode
> rules would say. This is non-negotiable — sales attribution is a contract
> with the team and must be preserved across imports.
>
> Concretely: at Phase 3 / Phase 5 / Phase 8, look up the FINAL AM (which
> for matched divs is the EXISTING AM, not the postcode-derived one) and
> use the BDE belonging to that final AM. The task `assignedTo` follows the
> final AM's BDE, not the postcode-derived BDE.

> **lead_rows are derived, NEVER re-encoded.** Phase 2 must derive its
> `lead_rows` lists from `01_unique_divisions.json` (the trusted source
> built from parsed_leads with row = i+2). Do NOT hardcode them. Pitfall
> #38: the ISBA 2026 import re-encoded lead_rows in the Phase 2 staging
> and they had drifted off by 1, which corrupted Phase 5's group_id →
> divid mapping until caught by an ERROR_NO_DIVID flag.

**Gate 2 output**: `outputs/<show-slug>/02_enriched.json`. Show user the
distribution by BDE and by school status, AND a count of matched-vs-new
divisions. User spot-checks 5 random rows.

---

### Phase 3 — Create new Divisions

> **Dedupe before creating.** Work from the unique-Division list produced in
> Phase 1, NOT from the per-row lead list. If five lead rows resolved to the
> same new company, create the Division ONCE and remember its DivisionId for
> all five rows downstream.

Process new Divisions in batches of 10. For each:

1. Call `create_division` with: Name, address, postcode, phone (if available),
   Account Manager, Territory, Delivery Office, Office Allocated, Tier=3,
   Paper AM="N/A", Source=<show name>, Customer Type, School Status, Sector,
   Phase, Age Range, Pupil Numbers.
2. Immediately follow with `update_division_versa_maintenance` if any Versa
   fields apply (rare for show leads — usually skip).
3. After each batch, re-read the first division created via `list_divisions`
   AND `get_division_details` and confirm all expected fields are populated.
   Specifically verify, for each batch member:
   - **`addressLine1` is non-empty** — this is the single most likely
     regression. In the May 2026 SA Show import, 31 of 67 newly-created
     Divisions came back with the entire address blank because the bulk
     script silently dropped address arguments mid-run. The fix path
     (using `update_division_address`) cost half a session. NEVER skip this
     check.
   - **`Postcode` is set and looks well-formed** for the address country.
     UK postcodes follow `[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}`. Reject and
     re-process anything like "Rm78BH", "Je27PN", "BH242EB" — these are
     scanner-input garbage that should have been normalised in Phase 0.
   - `customDropdown1`–`customDropdown5` (sort keys) — these are the
     StandardDropdownFields. `get_division_details` will misleadingly say
     "(no custom fields set)" for these — that's wrong; use `list_divisions`
     to verify (it exposes them in the response).
   - TerritoryCode is the full FK string (e.g.
     `NORTHWESTcc11ba92910f407fb9ef03561d6264c0`), not the label "NORTH WEST".

**Address field placement convention (WCG tenant):**
- `addressLine1` = street number + street name (primary)
- `addressLine2` = secondary street / locality / building / unit
- `addressLine3` = TOWN / CITY (mandatory if available)
- `addressLine4` = COUNTY (optional)
- `addressLine5` = additional (rare)
- `postcode` = postcode
- `country` = country (defaults to "United Kingdom"; set explicitly for
  foreign — "Germany", "Malta", "Jersey", etc.)

**Gate 3 output**: division IDs list + read-back of first 5 fields populated
INCLUDING the address line 1. User confirms before continuing.

> **Address repair path (post-creation).** If addresses are missing or wrong
> after creation, use `update_division_address` (available from connector
> v1.7.0). This patches the linked Address entity (resolved automatically
> from `Division.MainAddressId`) and is the only way to fix addresses
> programmatically — `update_division` does NOT accept address fields.
> Idempotent; only supplied fields change; pass `""` to explicitly clear
> a line.

---

### Phase 4 — MAT linkage

For each new school Division whose GIAS data shows a MAT:

1. Search divisions for the MAT name.
2. If the MAT exists as a Division, call `reparent_division` to set the school's
   parent. **The tool takes `companyId`, NOT `divisionId`** — pass the parent
   MAT's CompanyId (captured from its `create_division` response if it was
   created in this session). See Pitfall #36.
3. If the MAT does NOT exist, flag it — user decides whether to create the MAT
   Division first or leave the school unparented.

**Two MAT-parent patterns** (see Pitfall #35):
- **Reparent-existing-into-new-group**: create the MAT as a new Division and
  reparent matched constituent schools under it (Berkhamsted School Group
  with Berkhamsted Pre-Prep DivId 8054 example).
- **New-alongside-existing-stub**: create the MAT as a new peer Division
  while leaving an existing stub for a constituent untouched (Loughborough
  Schools Foundation alongside existing "Loughborough High School" stub
  DivId 34435 example).

Always ASK the user which pattern they want before deciding.

**Gate 4 output**: `outputs/<show-slug>/04_mat_links.json`. User confirms.

---

### Phase 5 — Contacts

> **One contact per lead row.** Multiple lead rows sharing a Division each
> get their own Contact under that Division. A school that sent three staff
> to the stand will end up with one Division and three Contacts on it.

For each lead row:

1. If contact was matched in Phase 1, **use the existing ContactId**. If the
   user opted in to the blank-field-patch policy at Phase 0 (Prereq 6) AND
   the existing contact has a blank `MobilePhoneNumber` or `Email` field
   AND the spreadsheet has a value for that field, ALSO patch `update_contact`
   to set it. If the user opted OUT, do not patch — flag the gap for manual
   action instead. Never overwrite an existing non-blank CRM value with a
   spreadsheet value.
2. If new, call `create_contact` against the resolved DivisionId with:
   - `forename`, `surname` (exact spelling from spreadsheet — but warn if it
     differs from a near-match existing contact)
   - `jobTitle`
   - `email`
   - **`mobilePhoneNumber`** — populated from the spreadsheet `mobile`
     column. Pass exactly as the spreadsheet has it (e.g. "+44 7432 082367");
     Prospect CRM accepts mixed formats. Do NOT leave this blank when the
     spreadsheet has a value — the May 2026 import missed 74 of 132 contact
     mobiles because this step was skipped.
   - **`phoneNumber`** — populated from the spreadsheet `landline` column.
3. NEVER create a contact when a Phase 1 match was found, even if the spelling
   differs slightly. The Neslihan case (CRM "Fulan", spreadsheet "Furlan", same
   email/phone) is the canonical example of what NOT to do.
4. When several new Contacts are being created under the same Division, do
   not assume any link between them — they are separate people who each got
   their own activity note, enquiry, and task.
5. **Email uniqueness blocks "create at different Division" pattern**
   (Pitfall #34). If the lead's company is a different Division from where
   the existing contact lives, you CANNOT create a duplicate contact with
   the same email — Prospect returns HTTP 409. Resolution: reuse the
   existing ContactId at its existing DivId and attach the show artifacts
   there. ISBA 2026 Nicola Marlow case: spreadsheet said "Mill Hill
   Education Group" (DivId 33671) but her existing contact sits on "Mill
   Hill School" (DivId 3540) — reused the 3540 contact.

> **Phone vs Mobile heuristic.** Show scanners sometimes record a landline
> in the "Mobile" column of the lead spreadsheet (e.g. "+44 20 8902 2038"
> is a London landline, not a mobile). For perfect data quality you could
> route UK landline-format numbers (+44 1xxx, +44 2xxx) into `phoneNumber`
> and only UK mobile-format (+44 7xxx) into `mobilePhoneNumber`. In practice
> the May 2026 import did NOT do this routing — whatever the spreadsheet
> said went into Mobile. Match the convention of the existing data unless
> the user explicitly asks for the smart-routing variant.

**Gate 5 output**: `outputs/<show-slug>/05_contacts.json` — contact IDs +
match-vs-created tally. User confirms.

---

### Phase 6 — Campaign membership + Enquiries

> **🚨 Build the AM lookup from the STRUCTURED `AccountManager` field —
> never regex-parse it out of prose.** ISBA 2026 trap: build script
> regex-parsed `r"AM:\s*([A-Z]{2,3})"` over Phase 1 note text and matched
> "ML1" as "ML", sending 3 Murray-Liesching accounts to AW instead of
> CL. See Pitfall #39. Always fetch the AM via `list_divisions` /
> `get_division_details` which return `AccountManager` as a structured
> field, not as a string inside narrative.

For each lead:

1. Build the DivisionId → AccountManager → BDE map from the structured
   field. BDE lookup: ML→AW, JM→RM, ML1→CL, JL→CL1. For Rapleys-style
   accounts where the AM IS the BDE (e.g. AM=RM), assign the enquiry
   to that user directly.
2. Call `add_contact_to_campaign` with CampaignId + ContactId + role = "Target".
3. Call `create_enquiry` linked to the contact, division, and campaign.
   Assign to the BDE (not the AM).

**Gate 6 output**: enquiry IDs + campaign-target count. User confirms count
matches expected lead count. Also spot-check 3 enquiries — one from each
of ML, ML1, JL territories — to verify the assignedTo matches the
expected BDE.

---

### Phase 7 — Activity notes

> **🚨 Notes are required for EVERY lead row** — including leads that
> matched to an existing CRM contact in Phase 1. The May 2026 import
> created notes only for newly-created contacts; the 35 leads that
> matched to existing contacts came through with no activity note,
> requiring a separate fix-up pass. Do NOT short-circuit this phase
> based on the matched-vs-new flag from Phase 1.

For each lead (matched OR new):

1. Call `create_activity_note` with:
   - `objectType = "contact"`, `objectId = <ContactId>`
   - `text` formatted as:
     `<Show> <year> lead. School: <company>. Contact: <full name> (<jobTitle>). Phone: <phone>. Postcode: <postcode>. Scanner: <full scanner name>. Areas of Interest: <areas>. Note: <free text>.`
   - `userCode = <scanner's CRM user code>` (NOT DL — this is the attribution rule).
   - `dateTime = <show date>` (the day the lead was captured, not the loader's run time).

> **⚠ userCode override may not stick (Pitfall #32).** The ISBA 2026 audit
> found that all 98 notes — even though `userCode` was explicitly passed as
> the scanner's code (PM/ML/CL/ML1/JM) — were recorded with author = DL
> (the connector's user) in the CRM's persisted record. Whether this is a
> connector bug or a CRM-side fallback is unconfirmed.
>
> Mitigation: ALWAYS include "Scanner: <full scanner name>" prominently in
> the note BODY text. That way the salesperson reading the activity feed
> sees who scanned the lead, even if the "Author" field shows DL.
>
> Phase 9 audit should manually spot-check one note in the CRM UI to
> confirm whether the userCode took effect for this tenant.

> **Within-sheet duplicate scanner-merged note pattern** (Pitfall #33).
> If two rows are the same person scanned by different scanners on the
> same day, create ONE merged note labelled by row + scanner name
> (e.g. "Note from Phill (R11): <text> | Note from Miles (R35): <text>"),
> authored under the first row's scanner. Do not create separate notes.

**Gate 7 output**: note count. User confirms.

---

### Phase 8 — Tasks

For each lead:

1. Call `create_task` with:
   - `name = "Show Lead Follow-Up Call — <forename> <surname>, <company>"`
   - `taskTypeId = "SHOWLEAD9b1fd0f1a45f"` (Show Lead)
   - `taskDateUtc = <follow-up date>T08:00:00Z` — **double-check the year is current,
     not next year**. Confirmed bug from May 2026 import: one task was set to 2027.
   - `assignedTo = <BDE name or code>`
   - `divisionId`, `contactId` set
   - `priority` from scoring **(CRM convention: 1=Low, 2=Medium, 3=High —
     the intuitive direction)**:
     Score 1–2 → 1 (Low), Score 3 → 2 (Medium), Score 4–5 → 3 (High),
     no score → leave default. **See Pitfall #11** — the previous skill text
     had this BACKWARDS and 15 ISBA 2026 tasks had to be re-flipped.
   - `description` brief — full content is in the activity note.

**Spot-check the first Phase 8 task**: open it in the CRM UI before bulk-creating
the rest and visually confirm priority=3 displays as "High". If that's not
true for the current tenant, flip the mapping immediately and re-run.

**Gate 8 output**: task IDs.

---

### Phase 9 — Verification audit

Programmatic audit — produce a single XLSX with one row per lead and these columns:

| Lead | DivId | ContactId | EnquiryId | CampaignTarget | NoteId | TaskId | TaskDate | TaskAssignee | TaskPriority | Address OK? | Mobile OK? | **Note OK?** | All OK? |

Rules for "All OK":
- DivisionId exists, has Source = show name, has Territory FK, has customDropdown1–5 populated.
- **Address: `addressLine1` non-empty AND postcode well-formed for the country.**
- **Contact mobile: `MobilePhoneNumber` is non-empty if the spreadsheet had a mobile value for this lead.**
- ContactId exists and is on the campaign as Target.
- EnquiryId exists, linked to campaign, assigned to correct BDE.
- **NoteId exists for EVERY lead — matched and new** (or note found in `search_activity_notes(contactId)` for that contact since show date). Specifically check pre-existing contacts (low ContactIds); the original May 2026 loader silently skipped them.
- TaskId exists, taskType=SHOWLEAD, date=follow-up date (correct YEAR!), assignee=BDE.
- **TaskPriority** matches expected: 3=High for score 4-5, 2=Medium for 3, 1=Low for 1-2, unset for no score. Spot-check at least one in the CRM UI.

Cross-check: total session-created Show Lead tasks on the follow-up date
== total lead count. If short, identify which contacts are missing.

**Address-specific audit query**: pull each new Division via
`get_division_details` and confirm `Full Address` contains more than just
a postcode. Flag any whose `Full Address` is blank, contains just a postcode,
or just "Town, Postcode" — those are the regressions to repair via
`update_division_address`.

**Final gate**: show audit XLSX, total count, any flagged rows. User confirms
done before declaring complete.

---

## Known Pitfalls — read before starting

1. **No fabrication.** Agents repeatedly created fake contacts and falsely
   reported success. Use only IDs returned from successful MCP calls. If a
   batch returns 5 IDs for 10 inputs, only 5 succeeded — investigate the
   other 5. Don't fill the gap with fabricated IDs.

2. **Email-first contact matching.** The biggest single failure mode is
   creating duplicate contacts when an existing one had a slightly different
   spelling. Email is the source of truth — if emails match, it's the same
   person regardless of name spelling.

3. **`get_division_details` is misleading for custom dropdowns.** It shows
   "(no custom fields set)" even when StandardDropdownField1–5 are populated.
   ALWAYS verify customDropdown1–5 via `list_divisions`, which exposes them
   in the response.

4. **TerritoryCode rejects label-style values.** Pass the full FK code only.
   See Business Rules for the reference table.

5. **Year matters.** Setting a task to "2027-05-10" instead of "2026-05-10"
   has been an actual bug. Verify the year explicitly on every task date.

6. **Pre-session tasks are sacred.** Capture the TaskId watermark in Phase 0
   and never delete anything ≤ watermark. The session that prompted this skill
   lost 6 legitimate WCG tasks (33121–33126) to overzealous cleanup.

7. **Direction flips on merges.** When merging duplicate Divisions, the
   "keep" side should be the older Division (smaller DivisionId, more history,
   pre-session creation date). The merge script picks wrong about 1 in 10 times
   — surface every flip to the user before bulk-executing.

8. **NoteId not exposed by `search_activity_notes`.** If a note needs deleting,
   it must be done in the CRM UI manually. Note this constraint when reporting
   results — don't promise programmatic note cleanup.

9. **Scanner authorship.** Notes must be authored under the scanner's user code
   via `userCode` param on `create_activity_note`. Default behaviour authors
   them as DL (the connector's user) which is wrong attribution.
   **See Pitfall #32** — the `userCode` override may not actually persist;
   include "Scanner: <name>" in note body as a mitigation.

10. **Always do writes in chat with verification.** Do NOT delegate creation
    to a sub-agent and trust its summary. Sub-agents have repeatedly reported
    "successfully created X" when X did not exist. Run write loops in the
    main chat or with explicit per-row verification reads.

11. **🚨 Score-to-priority mapping — CORRECTED (rev 9).** The WCG CRM uses
    **priority 1 = Low, priority 2 = Medium, priority 3 = High** — the
    intuitive direction (HIGHER NUMBER = HIGHER PRIORITY). The previous
    skill text said the opposite ("1 = High, 3 = Low inverted from
    intuition") and was WRONG. Correct mapping:
    - Score 1–2 → priority **1** (Low)
    - Score 3 → priority **2** (Medium)
    - Score 4–5 → priority **3** (High)
    - Blank score → don't set priority (leave default)

    Triggered by ISBA 2026 import: Steve Rea (5-star lead) was created with
    priority=1 per the OLD skill mapping and showed up as "Low" in the CRM
    UI. 9 high-priority and 6 low-priority tasks had to be re-flipped
    post-creation via `update_task`. The Phase 9 audit and the Phase 8
    spot-check should explicitly check that priority=3 displays as "High"
    in the CRM UI on the first task created.

12. **Customer Type for non-schools.** Architects, contractors, consultants,
    facilities companies, councils, government agencies, vendors at the show
    all = "Commercial End User", NOT "Education". Schools/MATs/colleges = "Education".

13. **Multiple attendees from one school.** It is normal for two or three
    staff from the same school to each be scanned separately. They share a
    Division but each gets their own Contact, Enquiry, Activity Note, and Task.
    Do NOT collapse them. Equally, do NOT create duplicate Divisions for them
    — the company-level dedup happens in Phase 1 and Phase 3 must work off
    the deduped list.

14. **Within-spreadsheet duplicates.** Two rows with the same email are
    probably the same person scanned twice. Two rows with the same name AND
    same email definitely are — collapse to one row and flag to user.
    Two rows with the same company but different names/emails are separate
    attendees — keep both. See Pitfall #33 for the scanner-merged note
    pattern when collapsing.

15. **Field placement matters for addresses.** Per the WCG convention:
    Line3 = town, Line4 = county. Research/enrichment data often puts the
    town in Line2 and the county in Line3 by mistake — normalise before
    writing. A simple rule: if Line3 reads as a recognised county
    ("Essex", "Suffolk", "Hampshire" etc.), the data is mis-placed and
    Line2/Line3 should be swapped.

16. **Don't trust the enrichment website field.** In the May 2026 import,
    12 of 41 divisions had a `website` field pointing at a completely
    unrelated organisation (e.g. "HIVE family of schools" → a Bristol
    farm's URL). The enrichment match logic in the loader was unreliable.
    Always treat the existing `website` value as suspicious and verify
    against the school's actual web presence in Phase 2.

17. **Soft-deleted divisions cannot be updated.** When repairing data
    post-creation, you may hit divisions that were soft-deleted during an
    earlier cleanup pass (StatusFlag='D'). The `update_division_address`
    tool will refuse with a clear error. Handle gracefully — log and skip;
    do not attempt to restore unless the user explicitly asks.

18. **Address research belongs to a read-only sub-agent.** When verifying
    addresses for many divisions (40+), a research sub-agent restricted to
    web tools only (WebFetch, WebSearch) is the right pattern. Have it
    output a staging JSON with `confidence: high|medium|low|needs_user`
    and source URLs. The MAIN session then reviews and executes writes.
    Never let a sub-agent perform writes — see Pitfall #1 (no fabrication).

19. **CML in the WCG spreadsheet means MILES, not Carmen.** This catches
    every fresh Claude session. The rep code letters in the postcode
    spreadsheet are nicknames that don't map 1:1 to CRM user codes:
    CML→Miles (CRM:ML), JRM→John Morrish (CRM:JM), ML→Murray (CRM:ML1),
    default→Jon (CRM:JL). Carmen Liesching is **CL** in CRM and is the BDE
    for Murray's territory, NOT an Account Manager in her own right for
    these imports. Read the Business Rules section before assigning any AMs.

20. **Search existing accounts before creating — exhaustively.** The most
    expensive single failure mode of the May 2026 import: 19 of 67
    newly-created Divisions duplicated pre-existing accounts (Shooters
    Hill, Gunnersbury Catholic, Alleyn's, George Green's, Heronsgate,
    Oxford High, etc. — all had been in the CRM for years). All 19 had to
    be merged after the fact. Phase 1 must run multiple search passes
    per lead: full name, name-minus-suffix ("School"/"Trust"/"Academy"),
    first 2 words, and **mandatory postcode-prefix listing for every
    candidate** (see Pitfall #31 — Halstead St Andrew's was missed
    purely on name searches). Tolerate spelling variants (apostrophes,
    "The", "St"/"Saint", plural/singular "Andrews"/"Andrew's",
    "CofE"/"C of E"/"CE").

21. **Retained-AM rule on matched accounts.** If a lead matches an existing
    Division in Phase 1, KEEP the existing Account Manager. Do NOT overwrite
    based on postcode. SE18 is a Miles (CML) postcode but Shooters Hill
    College is retained by John Morrish — sales attribution travels with
    the account, not the postcode. The Show Lead task's `assignedTo` for
    matched leads must use the EXISTING AM's BDE, not the postcode-derived
    one.

22. **After `merge_division`, task `AssignedTo` does NOT auto-update.** The
    merge tool moves contacts/tasks/enquiries/notes from source → target
    Division, but a Task's `AssignedTo` is independent of the Division
    record. After every merge, sweep the migrated tasks and update
    `assignedTo` to match the target Division's AM's BDE. Don't assume
    the original assignee is still right — it almost never is post-merge,
    because the original was set from postcode rules under the assumption
    that we were creating a new Division.

23. **Mobile numbers must be populated on Contact creation.** The May 2026
    import created 132 contacts but only ~49 of them had `MobilePhoneNumber`
    populated — the bulk-create script silently dropped the mobile arg for
    74 of them. Always pass `mobilePhoneNumber` to `create_contact` when the
    spreadsheet has a value, and re-read the contact after creation to
    confirm the field stuck. Add an "Mobile present" column to the Phase 9
    audit XLSX so the gap is visible before the user has to point it out.

24. **Don't blindly overwrite existing CRM mobile values on matched
    contacts.** When Phase 1 matches a lead to an existing Contact, only
    patch `mobilePhoneNumber` if the existing CRM value is blank AND the
    user opted in to blank-field-patches at Phase 0 (Prereq 6). Existing
    mobiles in CRM are often the canonical record (e.g. someone's curated
    personal mobile vs a switchboard number the scanner captured). Audit
    finding from the May 2026 import: 4 contacts had a different mobile
    in CRM than the spreadsheet provided — in 2 of those 4 the CRM value
    was the real mobile and the spreadsheet had captured a school landline.

25. **Phase 1 match MUST be honoured downstream.** Two cases from the May
    2026 import where Phase 1 correctly matched to an existing Division
    but the loader IGNORED the match and went its own way:
    - **Samuel Kammin** — Phase 1 matched name+postcode to DivId 5264
      "University of Winchester". Loader fabricated a brand-new Welsh
      school ("Bryn Hafren Comprehensive School", DivId 34152) with a
      wrong address and wrong postcode and put Samuel there. Pure
      hallucination — the loader invented data from nothing.
    - **Daxa Panchal** — Phase 1 explicitly noted "2 records under name;
      DivId 14139 matches N11 1BH (other is SW19)". Loader still placed
      her on the WRONG existing Division (14138, SW19) instead of 14139.
    Rule: at Phase 5, when `existing_division_id` is populated AND
    `existing_division_match_type` includes "postcode", that DivId is
    binding. Do NOT create a new Division. Do NOT pick a different
    existing Division. Use the matched one verbatim. The Phase 9
    verification audit should explicitly check this: for every contact,
    verify ContactDivisionId == LeadExistingDivisionId where the lead had
    one. Flag any divergence.

26. **Never fabricate Division data when the spreadsheet doesn't say so.**
    The Samuel Kammin → fake Bryn Hafren case is the worst manifestation
    of this: the loader invented a Welsh school name, address, and phone
    that bore no resemblance to anything in the lead data. The lead said
    University of Winchester, SO22 4NR, Hampshire — the loader created
    Bryn Hafren Comprehensive, CF40 2NY, Rhondda. If the lead's company
    name matches no existing CRM Division AND no GIAS / Companies House
    record, STOP and ask the user. Do not synthesise a Division name from
    nothing. See Pitfall #1 (no fabrication) — this is the same rule
    applied to Division-level data.

27. **Sweep ALL task types for wrong-BDE assignment, not just Show Lead.**
    During the May 2026 import, the loader also created Quote Follow-Up
    tasks for hot leads (score 4-5) — at least one slipped through with
    the wrong BDE: Task 33088 for Coombe Academy Trust (ML/Miles account)
    was assigned to Carmen Liesching instead of Al White. The original
    audit only inspected Show Lead tasks, missing this. Phase 9 audit
    must now sweep EVERY task type where the divisionId matches a session
    Division or matched account: SHOWLEAD, SENDQUOTE, GENERAL, CALL,
    SALESQUALI, ENQUIRYFOL, CALLTODAY. For each, verify
    `AssignedTo` == AM's BDE OR `AssignedTo` == AM themselves (AMs
    sometimes self-assign — that's legitimate).

28. **A pre-existing CRM Division can ALSO be a duplicate target you
    should merge into.** During the May 2026 audit, the Coombe Academy
    Trust case revealed two CRM Divisions: 33988 (real pre-existing,
    "Coombe Academy Trust (Helix Learning Trust)", COO012 customer) and
    34113 (session-created duplicate). The original Phase 1 search missed
    33988 because the name suffix differed slightly. Lesson: Phase 1's
    `search_divisions` queries must try BOTH with and without parenthesised
    suffixes like "(Helix Learning Trust)", "(SAT)", etc. — trusts often
    operate under multiple display names where the parent group is in
    parens. Also try the brand without "Trust": "Coombe Academy" should
    match "Coombe Academy Trust (Helix Learning Trust)".

29. **Activity notes must be created for matched contacts too.** The May
    2026 loader's bug: when Phase 1 matched a lead to an existing CRM
    contact, the create_activity_note step was skipped entirely. Result:
    35 of 138 contacts (25%) ended up with no record of the show interaction
    on their activity feed — the salespeople following up had no idea what
    the lead had asked about. The Show Lead task was created (so the
    follow-up was scheduled) but the context behind it was missing. Rule:
    Phase 7 runs unconditionally for every lead row. If you matched to
    an existing contact, you still write the activity note — it captures
    the show interaction even if the contact itself is long-established.
    The Phase 9 audit must check `search_activity_notes(contactId)` for
    every lead's contact and verify a post-show-date note exists.

30. **🚨 Priority direction was backwards in the original skill.** See
    Pitfall #11 (rewritten in rev 9). **1 = Low, 3 = High** in the WCG CRM
    — the intuitive direction. The skill previously documented the
    opposite, which caused the ISBA 2026 import to set every high-score
    task to priority=1 (Low) and every low-score task to priority=3
    (High). 15 tasks had to be flipped post-creation. Always spot-check
    one priority value in the CRM UI on the first Phase 8 task created
    in a session, to confirm the mapping for the current tenant before
    bulk-creating the rest.

31. **Apostrophe + singular/plural search variants.** ISBA 2026 missed
    Halstead St Andrew's School (existing DivId 4556) because the lead
    spreadsheet had "Hallstead St Andrews" and "Halstead St Andrews"
    (typos + plural, no apostrophe) and the CRM record has the singular
    apostrophised form ("Halstead St Andrew's School"). `search_divisions`
    text matching didn't tolerate this spread. Phase 1 search variants
    must explicitly try:
    - Add apostrophe + drop trailing "s" (St Andrews → St Andrew's)
    - Drop apostrophes entirely (St Andrew's → St Andrews)
    - Try with/without "School" / "College" / "Trust" / "Academy" suffix
    - Try the first 2 significant words only
    - **Always** finish with a `list_divisions(filters={postcode:<prefix>})`
      sweep regardless of what name searches returned. This is the
      backstop that catches the spelling-variant misses.

32. **`userCode` override on `create_activity_note` may not stick as the
    persisted author.** ISBA 2026 audit: all 98 notes show "by DL" in
    `search_activity_notes` results, even though each `create_activity_note`
    call passed `userCode = <scanner code>` (PM/ML/CL/ML1/JM). Either the
    audit search displays only the API-caller, or the connector silently
    drops the `userCode` override. Workaround: ALWAYS include
    "Scanner: <full scanner name>" prominently in the note body text so
    attribution is preserved in content regardless of the author-field
    behaviour. Verify on the first note created in a fresh session by
    eyeballing it in the CRM UI; if the override is truly being ignored,
    file with ProspectSoft.

33. **Within-sheet duplicate scanner-merged note pattern.** ISBA 2026
    James Bell case: rows 11 and 35 same email/person, scanned by two
    different scanners on the same day (Phill McConnell + Miles
    Liesching). Each had different free-text notes describing the
    interaction. Rule:
    - Collapse to ONE Contact (don't double-create).
    - Create ONE merged activity note that contains both scanners'
      verbatim text, clearly labelled with the row number and scanner
      name ("Note from Phill (R11): ... | Note from Miles (R35): ...").
      Authored under one of the scanners (canonical = the first row's
      scanner).
    - Create ONE enquiry, ONE Show Lead task.
    - Phase 9 audit's "All OK" rule must treat the collapsed row as N/A,
      not as missing.

    Always ASK the user how to handle within-sheet duplicates before
    collapsing — they may prefer separate notes/tasks per scan in some
    cases.

34. **Email-uniqueness blocks "create new contact at a different
    Division" pattern.** ISBA 2026 Nicola Marlow case: lead's company
    was Mill Hill Education Group (DivId 33671), but her existing
    contact (ID 46987) already sat on Mill Hill School (DivId 3540)
    with the same email. Attempt to `create_contact` at 33671 failed
    with HTTP 409 "email address is not unique". Resolution: reuse
    the existing ContactId at its existing DivId, attach the enquiry/
    note/task to the historical Division, accept that the lead's
    "company on spreadsheet" doesn't quite match the CRM Division name.
    If the user really wants the contact to live on a different
    Division, the only option is to either (a) move the existing
    contact via `move_contact`, or (b) create with a stripped/null
    email — neither is usually worth doing automatically. Flag and ask.

35. **MAT-parent creation + alongside-stub patterns.** Two distinct
    patterns came up in ISBA 2026 and the user picked differently:
    - **Berkhamsted School Group** — created as a new M.A.T. Division
      and the existing Berkhamsted Pre-Prep (DivId 8054) was reparented
      under it. Use this when the user wants a clean MAT hierarchy with
      pre-existing members rolled in.
    - **Loughborough Schools Foundation** — created as a new Division
      ALONGSIDE the existing "Loughborough High School" stub (DivId
      34435). The stub was left untouched. Use this when the user
      wants the Foundation as a peer of existing constituent schools
      rather than as their parent.

    Always ASK the user which pattern they want before deciding.

36. **`reparent_division` takes `companyId`, NOT `divisionId`, of the
    parent.** The new MAT parent's Division has its own Company entity
    (created automatically by `create_division`). When reparenting an
    existing Division under a new MAT, pass the new MAT's CompanyId
    (captured from the `create_division` response) — not its DivisionId.

37. **User may impose mid-import restrictions on editing existing
    records.** During ISBA 2026 the user said partway through Phase 5
    "Don't edit any existing contacts on the CRM". This was a
    forward-looking instruction — earlier edits had already happened
    (James Bell email patch) and were grandfathered in. Going forward:
    - At Phase 0 (Prereq 6), ASK the user explicitly whether
      blank-field patches on matched contacts are OK (e.g. populating
      blank `MobilePhoneNumber` / `Email` from the spreadsheet).
    - If the user says no, do NOT patch even when the existing field
      is blank. Note this on the affected contacts in the audit so the
      salesperson can decide manually.
    - Mid-import changes of instruction: stop, surface what's already
      been done (with the option to revert), confirm the new
      restriction applies forward-only, then continue.

38. **Phase 2 staging row-number drift.** ISBA 2026 build script
    hardcoded `lead_rows` in the Phase 2 new_divisions list (`[8]`,
    `[13]` etc.) which had drifted from the actual row numbers in
    `00_parsed_leads.json` (row = i+2 where i is 0-indexed). Phase 5's
    queue-build used those wrong rows to map group_id → divid,
    corrupting the entire matched-vs-new mapping. Caught by an
    `ERROR_NO_DIVID` flag at queue-build time.

    Rule: every Phase that needs row→divid mapping must derive it
    from `01_unique_divisions.json` (the trusted source, built directly
    from parsed_leads with row=i+2). NEVER re-encode lead_rows in
    later staging files. Cross-validate any handcrafted lead_rows
    against the unique-divisions JSON before using them.

39. **🚨 AM extraction must use the structured `AccountManager` field,
    NEVER a regex over prose.** ISBA 2026 build script regex-parsed
    Phase 1 notes text with `r"AM:\s*([A-Z]{2,3})"` to recover the
    Account Manager code for each matched Division. `[A-Z]{2,3}` only
    matches uppercase letters — no digits. So "AM: **ML1**" matched as
    "**ML**" (the regex stopped at the "1"). Every Murray-Liesching
    (ML1) account was silently rolled into the Miles-Liesching (ML)
    bucket and the BDE map then sent them to AW (Miles's BDE) instead
    of CL (Murray's BDE).

    Three ISBA 2026 leads were affected — Plymouth College (DivId
    3981), West Buckland School (DivId 5383), and St Mary's School
    Calne (DivId 4843). Each had its enquiry AND task wrongly assigned
    to Al White (AW) and had to be re-fixed via `update_enquiry` /
    `update_task` to point at Carmen Liesching (CL).

    The same trap exists for **CL1** (Calvin Liesching, JL's BDE — if
    he's ever the AM on a matched account) and **JL1** (Jo Lyon — not
    in sales but the regex would still misclassify). At Westcountry the
    in-scope 3-char AM codes are **ML1, CL1, JL1**.

    Rule: **always fetch the AccountManager field directly from the
    structured CRM response** — `list_divisions` returns it on every
    record as `AccountManager`, `get_division_details` returns it as
    `Account Manager: <Full Name>`. Build a map `DivisionId →
    AccountManager` from these structured fields. Do NOT regex-parse
    prose / notes / display strings. If you absolutely must regex-parse
    a display string, use `r"AM:\s*([A-Z]{1,3}\d?)"` to tolerate the
    trailing digit — but the structured-field approach is the
    real fix.

    Phase 9 audit should explicitly cross-check: for every matched
    Division, the Enquiry.AssignedTo and Task.AssignedTo should equal
    BDE(Division.AccountManager) using the lookup ML→AW, JM→RM,
    ML1→CL, JL→CL1, CL1→? (rare), JL1→? (rare). Flag any mismatch.

---

## Business Rules

### Spreadsheet rep code → CRM AM → BDE
This is the canonical mapping. The WCG postcode spreadsheet uses rep codes
that **do not directly match** CRM user codes — every Claude session that
has imported show leads has gotten this wrong at least once, so triple-check.

| Spreadsheet rep code | CRM AM user code | CRM AM name | CRM BDE user code | CRM BDE name | Office |
|---|---|---|---|---|---|
| **CML** | **ML** | **Miles Liesching** (MD) | **AW** | Al White | ANDOVER |
| **JRM** | **JM** | **John Morrish** (Interiors Consultant) | **RM** | Rodney Morrish | ANDOVER |
| **ML** | **ML1** | **Murray Liesching** (Interiors Consultant) | **CL** | Carmen Liesching | PLYMOUTH |
| *(any unlisted prefix — default)* | **JL** | **Jon Liesching** (Technical Advisor) | **CL1** | Calvin Liesching | PLYMOUTH |

> **The CML / ML / ML1 confusion is the most common error.** Note:
> - CML in the spreadsheet ≠ Carmen. It means **Miles Liesching** (whose
>   CRM code is **ML**). Carmen is **CL** and acts as a BDE.
> - ML in the spreadsheet ≠ Miles. It means **Murray Liesching** (whose
>   CRM code is **ML1**).
> - When in doubt, call `get_users` and read `[Account Manager]` flags.

### Postcode → rep coverage (summary; full table in `wcg_postcode_map.json`)

| Region group | Spreadsheet code | CRM AM | Approx postcode count |
|---|---|---|---|
| London / Home Counties / SE / South-East coast | JRM | John Morrish | ~308 |
| Brighton/Sussex/Kent/Croydon/Bromley/Dartford/London suburbs | CML | Miles Liesching | ~303 |
| Devon/Cornwall/Dorset/Wiltshire | ML | Murray Liesching | ~187 |
| Everything else (Midlands, North, Wales, Scotland, NI) | *(default)* | Jon Liesching | (residual) |

> Maintain the full postcode-prefix → rep table in `wcg_postcode_map.json`
> alongside this skill, and reload it at Phase 2 of every import. The user
> updates this spreadsheet periodically when sales territory changes — do
> NOT hard-code postcode lists in the skill itself.

### Territory FK codes

The Territory FK codes are static OData FKs — capture them once via
`get_territories` and cache in `wcg_territory_fks.json`. Pass the full FK
string to `create_division.territoryCode` / `update_division.territoryCode`;
the label form alone is rejected.

### Source field

Always `"<Show name> <Month> <Year>"` exactly, e.g.
`"Schools & Academies Show May 2026"`, `"BETT 2026"`, `"ISBA 2026"`.

### Standard Division field values for show leads

- **Tier**: 3
- **Paper AM**: N/A
- **Source**: <show name string>
- **Customer Type**:
  - Schools, MATs, colleges, councils with school remit → "Education"
  - Everything else → "Commercial End User"
- **School Status** (schools only): from GIAS — usually "Open"
- **Sector / Phase / Age Range**: from GIAS for schools
- **Pupil Numbers**: from GIAS for schools

### Task type ID

Show Lead = `SHOWLEAD9b1fd0f1a45f`. Verify by calling `get_task_types` once
per session — the FK string is stable but worth a sanity check.


### Campaign roles

Show attendees go on the campaign as **Target** role. Use
`add_contact_to_campaign` with role=`Target`.

---

## Verification — what "done" looks like

Run this exact filter in the CRM UI:

- **Tasks module → Filter**:
  - Type = Show Lead
  - Due = <follow-up date>
  - Created date >= <session start date>
  - Status = Active

The count must equal the lead count in the spreadsheet. If it doesn't,
re-run Phase 9 and identify the gap. Don't declare done until the count matches.

Also spot-check 3 random leads via the CRM UI:
- Account record shows Source = show name, Territory set, all sort keys (customDropdowns) populated.
- Address is populated (line1, town, postcode all non-empty).
- Contact mobile is populated where the spreadsheet had one.
- Contact appears on the Campaign as Target.
- Enquiry exists, linked to the campaign, assigned to the BDE.
- Task exists on the correct date, assigned to the BDE, with priority displayed as expected (1=Low, 2=Medium, 3=High in this CRM — see Pitfall #11).

---

## Reference files (maintain alongside this skill)

- `wcg_postcode_map.json` — postcode prefix → AM/BDE/Office/Territory FK
- `wcg_territory_fks.json` — Territory label → full FK code (refreshed via `get_territories` if codes change)
- `wcg_scanner_codes.json` — scanner full name → CRM user code

---

## Changelog

- 2026-05-12 (rev 1): Initial skill from Schools & Academies Show May 2026 import retrospective. Lessons from 138-lead import.
- 2026-05-12 (rev 2): Multi-attendee-per-school handling. Pitfalls 13-14.
- 2026-05-12 (rev 3): Address-handling overhaul. update_division_address tool (v1.7.0). Pitfalls 15-18.
- 2026-05-12 (rev 4): Existing-account-search + retained-AM overhaul. Corrected CML=Miles, ML=Murray mapping. Pitfalls 19-22.
- 2026-05-12 (rev 5): Mobile number population. Pitfalls 23-24.
- 2026-05-12 (rev 6): Phase 1 match honour rule + no-fabrication-of-Division-data, triggered by Samuel Kammin (loader fabricated Welsh school for a Hampshire university lead) and Daxa Panchal (wrong Garfield). Pitfalls 25-26.
- 2026-05-12 (rev 7): Sweep ALL task types for wrong-BDE assignment (not just Show Lead), and parenthesised-suffix tolerance in Phase 1 search. Triggered by Coombe Academy Trust case where Task 33088 was a SENDQUOTE assigned to Carmen on a Miles account (cross-AM error missed by the earlier Show-Lead-only audit), and the 33988 vs 34113 duplicate that the Phase 1 search missed because of the " (Helix Learning Trust)" suffix on 33988's name. Pitfalls 27-28.
- 2026-05-12 (rev 8): Activity notes must be created for matched contacts too. Audit found 35 of 138 contacts (the ones whose leads matched to existing CRM contacts) had no SA Show 2026 activity note — the loader silently skipped Phase 7 for them. Phase 7 now explicitly runs unconditionally; Phase 9 audit gains a "Note OK?" column and explicit per-contact `search_activity_notes` verification step. Added Pitfall #29.
- 2026-05-15 (rev 9): ISBA 2026 import retrospective (99 leads, 14 new Divisions, 98 contacts, 98 enquiries, 98 notes, 98 tasks).
  - Pitfall #11 REWRITTEN: priority mapping was backwards (1=Low not 1=High). 15 tasks had to be re-flipped post-creation via `update_task`.
  - Pitfall #30 added: callout to the corrected priority mapping (Pitfall #11) — always spot-check on first Phase 8 task.
  - Pitfall #31 added: apostrophe + singular/plural search variants in Phase 1 (Halstead St Andrew's miss — DivId 4556 nearly duplicated).
  - Pitfall #32 added: `userCode` override on `create_activity_note` may not persist as the author — body-text "Scanner: <name>" mitigation.
  - Pitfall #33 added: within-sheet duplicate scanner-merged note pattern (James Bell R11 + R35).
  - Pitfall #34 added: email-uniqueness blocks "create at different Division" pattern (Nicola Marlow at Mill Hill Education Group vs Mill Hill School).
  - Pitfall #35 added: MAT-parent vs alongside-stub patterns (Berkhamsted School Group reparented Pre-Prep; Loughborough Schools Foundation left existing stub alone).
  - Pitfall #36 added: `reparent_division` takes CompanyId, not DivisionId.
  - Pitfall #37 added: user may impose mid-import edit restrictions on existing records — confirm Phase-0 prereq policy.
  - Pitfall #38 added: Phase 2 staging row-number drift — `lead_rows` must always be derived from the trusted `01_unique_divisions.json`, never re-encoded.
  - Phase 1 strengthened: postcode-prefix `list_divisions` sweep is now mandatory for every new candidate.
- 2026-05-15 (rev 10): Mid-session fix-up of ISBA 2026 import — Plymouth College / West Buckland / St Mary's Calne were misassigned to AW (Al White) instead of CL (Carmen Liesching) because the build script regex-parsed AM codes from prose with `[A-Z]{2,3}` which silently dropped the trailing "1" in ML1. 3 enquiries + 3 tasks re-pointed to CL.
  - Pitfall #39 added: AM extraction must use the structured `AccountManager` field, NEVER a regex over prose. The 3-char codes with trailing digits at WCG are ML1, CL1, JL1.
  - Phase 6 instructions updated: build AM lookup from the structured field, spot-check 3 enquiries from different territories before declaring Gate 6 done.
  - Phase 4 expanded: documented both MAT-parent patterns (reparent vs alongside).
  - Phase 5 expanded: blank-field-patch opt-in flow and email-uniqueness fallback.
  - Phase 7 strengthened: include "Scanner: <full name>" in note body as authorship mitigation.
  - Phase 8 priority numbers corrected. Phase 8 first-task UI spot-check added.
  - Phase 9 audit gains TaskPriority column with explicit CRM-UI spot-check requirement.
  - Prereq list expanded: added explicit Phase-0 question about blank-field-patches on matched contacts.
