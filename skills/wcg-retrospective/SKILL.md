---
name: wcg-retrospective
description: >
  Session retrospective and skill generator for Westcountry Group (WCG) workflows. Use this skill at the end of any Cowork or Claude in Chrome session to analyse what happened, capture learnings, and update an existing skill (or create a new one) in the WCG plugin repo so the improvement deploys to the whole team. Trigger whenever the user says "retrospective", "retro", "what did you learn", "create a skill from this", "lessons learned", "session review", or any variation of asking Claude to reflect on a completed task and produce a reusable skill from it. Also trigger if the user asks Claude to improve an existing workflow skill based on a session that just happened.
---

# WCG Session Retrospective

You are a meta-skill. Your job is NOT to do the task itself — it has already been done. Your
job is to analyse the session that just happened, extract every useful learning, and then
update (or create) a task-specific skill in the WCG plugin repo so that every WCG user gets
the improvement on their next quote.

This skill is designed for **team deployment**. The output of a retrospective is a
self-contained **Claude Code prompt** that the user pastes into their Claude Code session
running in the plugin repo. Claude Code does the file edits, version bump, commit, push, tag,
and GitHub Release in one go. **This skill never writes SKILL.md or plugin.json directly — it
always produces a Claude Code prompt instead.**

## Deployment model

This skill runs inside Cowork (no direct repo write access) and produces a Claude Code prompt
that the user pastes into their Claude Code session running in the plugin repo. Claude Code
does the deployment.

Why this split:
- Cowork has the session context and the cached plugin source (via the `.remote-plugins`
  mount) — so it can compose precise edits.
- Claude Code has direct repo write access + git + gh CLI — so it can deploy in one go.

The user keeps a Claude Code instance open in the plugin repo (e.g. `dale-ctrl/prospect-mcp`).
At the end of the retrospective, this skill outputs a self-contained prompt the user pastes
into that Claude Code instance.

## Prerequisites for this skill

- The session has the WCG plugin loaded (so the cached plugin source is readable via
  `/sessions/<session>/mnt/.remote-plugins/`)
- The user has Claude Code installed and an instance open in the plugin repo
  (e.g. `dale-ctrl/prospect-mcp`)
- The user has `gh` CLI authenticated for the GitHub repo (for the Release step) — fall back
  to the web URL if not

## Step 1: Analyse the session

Review the entire conversation from this session. Extract and organise:

### What went right
- Steps that succeeded without correction
- Tools, APIs, or approaches that worked as expected
- Any shortcuts or efficiencies discovered

### What went wrong
- Every point where the user had to correct or redirect you
- Errors, wrong clicks, incorrect assumptions, failed API calls
- Misunderstandings about how a tool or system works
- Steps that took multiple attempts

### Why it went wrong
- For each failure, identify the root cause — wrong UI assumption, missing domain knowledge,
  incorrect API parameter, timing issue, etc.
- Pay special attention to corrections where the user explained *why* something was wrong,
  not just *that* it was wrong — those explanations are the most valuable content for the skill

### What the user had to explain
- Domain knowledge, business rules, system quirks the user provided during the session
- Naming conventions, field mappings, navigation paths, workarounds for system limitations
- These MUST go into the skill — Claude wouldn't know them without being told

## Step 2: Find the target plugin and skill

1. **Identify the cached plugin source** under `/sessions/<session>/mnt/.remote-plugins/`.
   Each `plugin_*` folder contains `.claude-plugin/plugin.json` and a `skills/` directory.
   Read each `plugin.json` via bash to find the one whose `name` matches the user's mental
   model (e.g. "prospect-crm").

2. **Check for an existing skill** that covers this workflow:
   - List `skills/` inside the matched plugin folder
   - Read each candidate's SKILL.md frontmatter `description` to confirm it covers the workflow

3. **Decide:**
   - **Existing skill matches** → go to Step 3a (Update)
   - **No match** → go to Step 3b (Create)
   - **Ambiguous** → ask the user explicitly: "I found `<existing-skill>` which partly covers
     this — update that one, or create a separate skill called `<proposed-new-name>`?"

## Step 3a: Update an existing skill

1. **Read the current SKILL.md** via bash from the cached plugin location at
   `/sessions/<session>/mnt/.remote-plugins/<plugin>/skills/<skill-name>/SKILL.md`. This
   ensures your proposed edits match the real text byte-for-byte.

2. **Compose the updated version:**
   - **Preserve everything that still works.** Do not rewrite sections that are accurate and
     weren't involved in any problems during this session.
   - **Add new learnings** from this session — new steps, warnings, edge cases, corrections.
     Place them in context next to the relevant existing instructions.
   - **Amend incorrect instructions** if the session revealed an existing instruction was
     wrong or incomplete.
   - **Strip anything customer / supplier / product-specific** that crept in — that lives in
     `save_quoting_lesson` / `save_product_note`, not the skill. The skill is generic.
   - **Add a changelog entry** at the bottom with today's date and a brief summary of changes.

3. **Show the user the proposed changes in chat.** Either render the full updated SKILL.md or
   the key sections you've added/changed, plus the changelog entry. Be specific about what's
   new vs unchanged.

4. **Ask the user to approve.** Don't generate the deployment prompt yet. Wait for explicit
   confirmation ("looks good", "ship it", "yes go ahead", etc.).

5. **On approval, generate a single self-contained Claude Code prompt** and present it to the
   user. The prompt MUST:
   - Be runnable in the plugin repo root with no prior context from this conversation
   - Include the precise file edits — either explicit `Edit` operations with verbatim
     `old_string` / `new_string`, OR a full `Write` of the new file. Pick whichever is more
     readable for the change set: surgical edits for small targeted changes; full `Write` when
     the change restructures large sections
   - Include the plugin.json MINOR version bump instruction (Claude Code reads current,
     increments, writes back)
   - Include the git commit + push + tag commands
   - Include the GitHub Release step (`gh release create` command preferred, with the web URL
     as fallback if the user's `gh` is not authenticated)
   - End with a verification step (re-read changed files; show the user the changelog top
     entry and the new version in plugin.json)

   Save the prompt to the outputs folder as `<skill-name>-deploy-prompt.md` via `Write`. Also
   paste the prompt inline in chat so the user can grab it from either place. Present the file
   via `present_files`.

6. **Tell the user about teammate propagation:**
   - After the Release is published, Customize → Plugins → `<plugin-name>` shows an enabled
     Update button. Teammates click it, then fully restart Cowork (quit via system tray + Task
     Manager check, not just close the window), and the new content appears.
   - **Before the Release is published**, the Update button is greyed out — the commit on
     `main` is invisible to teammates' Cowork installs regardless of the tag's existence.

## Step 3b: Create a new task-specific skill

1. **Decide the skill name** (kebab-case, descriptive — e.g. `prospect-crm-quote-followup`,
   `dimensions-credit-note`). The name becomes the folder name.

2. **Generate the SKILL.md** following this structure:

```markdown
---
name: [skill-name]
description: >
  [What this skill does, when to trigger it, which WCG systems are involved.
  Be specific with trigger conditions so Claude activates it whenever a matching task comes up.]
---

# [Skill Title]

## WCG Environment Context
[Only the systems/tools relevant to this specific workflow — not the whole environment.]

## Prerequisites
[What needs to be open, logged in, or available before starting.]

## Workflow Steps
[Numbered steps with explicit detail. Each step includes:]
1. **What to do** — the action
2. **How to do it** — specific clicks, navigation paths, field names, API calls
3. **Watch out for** — known pitfalls inline, where they apply

## Known Pitfalls
[Dedicated section for things that WILL trip Claude up if not warned about.
Write them as explicit warnings.]

## Business Rules
[Domain logic, naming conventions, calculation rules, WCG-specific requirements.]

## Verification
[How to confirm the task completed correctly.]

## Changelog
- [Today's date]: Initial skill created from session retrospective
```

3. **Show the user the full proposed SKILL.md in chat.** Ask for review.

4. **On approval, generate a single self-contained Claude Code prompt** and present it to the
   user. The prompt MUST:
   - Be runnable in the plugin repo root with no prior context from this conversation
   - Create the new `skills/<new-skill-name>/SKILL.md` file with the exact content via `Write`
   - Include the plugin.json MINOR version bump (Claude Code reads current, increments,
     writes back)
   - Include the git commit + push + tag commands (commit must add the new skill folder + the
     plugin.json bump together)
   - Include the GitHub Release step (`gh release create` preferred, web URL fallback)
   - End with a verification step (re-read created file; show changelog and new version)

   Save the prompt to the outputs folder as `<new-skill-name>-deploy-prompt.md` via `Write`
   AND paste it inline in chat. Present via `present_files`.

5. **Tell the user about teammate propagation** — same as Step 3a step 6.

## Step 4: Capture session-level knowledge that doesn't belong in the skill

Some learnings are too specific for a generic skill but still valuable. Capture them via the
appropriate knowledge tools BEFORE ending the session:

- **Customer-specific facts** → `save_quoting_lesson(category='customer-<account>', lesson=...)`
- **Supplier-specific facts** → `save_quoting_lesson(category='supplier-<name>', lesson=...)`
- **Product-specific facts** → `save_product_note(productName=..., note=...)` (or
  `save_quoting_lesson(category='product-<sku>', ...)`)
- **Pricing rules / exceptions** → `save_quoting_lesson(category='pricing', lesson=...)`
- **Process or configuration learnings that don't quite warrant a skill edit** →
  `save_quoting_lesson(category='process'|'configuration', lesson=...)`

These are retrieved at Step 1 of the relevant skill workflow via `get_quoting_knowledge()`.

## Step 5: Hand-off summary

End the retrospective with a clean summary in chat:

1. **What changed** — bullet list of the new/updated sections in the skill, plus any
   knowledge-tool entries saved.
2. **The Claude Code prompt** — linked file (present_files) + inline preview (already
   produced in Step 3a/3b).
3. **Teammate impact** — one line on what others will see and when.

Example:

> Done. Four changes captured:
>
> 1. **Skill updated** — `skills/prospect-crm-create-quote/SKILL.md`
>    - Added Pitfall 9: cannot change SKU on existing line
>    - Reinforced Pitfall 1 with concurrent-edit duplicate-line case
>    - Changelog dated 2026-05-18
>
> 2. **Plugin version bump** — `.claude-plugin/plugin.json` MINOR bump prepared
>
> 3. **Knowledge saved** — `product-NC18052601` note (DBD-140-80-N qty rule),
>    `supplier-lee-plumpton` lesson (defunct, 8 SKUs affected).
>
> 4. **To deploy**, paste the Claude Code prompt below into your Claude Code session running
>    in the plugin repo. The prompt does the file edits, version bump, commit, push, tag,
>    and GitHub Release in one go.
>
>    [link to outputs/prospect-crm-create-quote-deploy-prompt.md]
>    [inline preview]
>
> Teammates: after the Release is published, Customize → Plugins → prospect-crm → Update
> button becomes enabled. Click it, restart Cowork, the new content appears.

---

## Guiding Principles for Skill Writing

When writing or updating task-specific skills, follow these principles:

1. **Be specific, not generic.** "Click the three-dot menu" beats "navigate to the menu". Include
   exact button names, field labels, navigation paths.

2. **Warn before the mistake, not after.** Put pitfall warnings immediately before the step where
   they apply, not in a separate section the reader might skip.

3. **Include the "why" behind corrections.** "Don't click the filter icon because it opens the
   New Company form" is much more useful than "Don't click the filter icon".

4. **Record exact error messages and their solutions.** If Claude hit a specific error during
   the session, record both the error and the fix.

5. **Capture UI state assumptions.** If a step only works when a particular panel is open or a
   certain mode is active, state that explicitly.

6. **Write for amnesia.** The Claude reading this skill in a future session has zero memory of
   the session that generated it. Everything needed must be in the file.

7. **Keep the skill generic.** Customer / supplier / product / pricing specifics live in
   `save_quoting_lesson` / `save_product_note`, NOT in the skill. The skill should work for any
   customer / supplier / product on the WCG tenant.

## Changelog

- **2026-05-21 (v4)** — Switched deployment model. This skill no longer needs the plugin repo
  mounted as a Cowork directory and no longer writes SKILL.md or plugin.json directly. It now
  composes the edits, gets user approval, and outputs a single self-contained **Claude Code
  prompt** that the user pastes into a Claude Code instance running in the plugin repo. Claude
  Code does the file writes, version bump, commit/push/tag, and GitHub Release in one go.
  Removed "First-time setup" and "Fallback" sections — superseded by the new model. Step 3a
  and Step 3b both now output a deployment prompt instead of writing files. Discovered when
  Dale flagged that Claude Code was already pointed at the repo and a prompt was easier than
  the git copy-paste flow.
- **2026-05-18 (v3)** — Added GitHub Releases to the deployment sequence. Cowork's plugin install
  mechanism detects new versions via GitHub **Releases**, NOT just tags — without a published
  Release, teammates' Update button stays greyed out and changes are invisible to them. Step 3a
  step 6/7 and Step 3b step 5/6 now print a four-part deployment sequence (plugin.json bump +
  commit/push + tag + Release) instead of a single git command. Step 5 example updated to show
  the full sequence including the Release URL. Discovered during a multi-hour debug of why v1.9.0
  didn't propagate to Cowork after a clean tag + push — the missing Release step was the entire
  issue.
- **2026-05-18 (v2)** — Major rewrite for team deployment. Skill writes SKILL.md updates
  directly to the mounted WCG plugin repo and prints a git command for the user to paste in
  their terminal. Added Step 4 covering knowledge-tool capture for customer/supplier/product-
  specific learnings. Added first-time-setup section.
- **(prior)** — Initial version: retrospective saved updated SKILL.md to workspace folder for
  manual replacement via Customize → Skills.
