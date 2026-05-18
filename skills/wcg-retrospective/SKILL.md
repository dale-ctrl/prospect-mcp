---
name: wcg-retrospective
description: >
  Session retrospective and skill generator for Westcountry Group (WCG) workflows. Use this skill
  at the end of any Cowork or Claude in Chrome session to analyse what happened, capture learnings,
  and update an existing skill (or create a new one) directly in the WCG plugin repo so the
  improvement deploys to the whole team. Trigger whenever the user says "retrospective", "retro",
  "what did you learn", "create a skill from this", "lessons learned", "session review", or any
  variation of asking Claude to reflect on a completed task and produce a reusable skill from it.
  Also trigger if the user asks Claude to improve an existing workflow skill based on a session
  that just happened.
---

# WCG Session Retrospective

You are a meta-skill. Your job is NOT to do the task itself — it has already been done. Your
job is to analyse the session that just happened, extract every useful learning, and then
update (or create) a task-specific skill IN THE WCG PLUGIN REPO so that every WCG user gets
the improvement on their next quote.

This skill is designed for **team deployment**. The output of a retrospective is a git-tracked
change to the team's plugin repository — not a local-only file install. The user reviews the
proposed change in chat, approves it, and pastes one git command to push.

## Plugin repo expectation

This skill expects the **WCG plugin repo to be mounted as a Cowork directory** so Claude can
write directly to it. The repo follows the standard Claude plugin layout:

```
<plugin-repo>/
  .claude-plugin/
    plugin.json          ← plugin manifest
  skills/
    <skill-name>/
      SKILL.md           ← the skill file you'll be editing or creating
  ... (mcp, hooks, etc. as needed)
```

**Before running this skill for the first time:** the user must mount the plugin repo. See
"First-time setup" at the bottom of this file.

If no plugin repo is mounted when this skill runs, FALL BACK to the legacy workspace-folder
workflow and tell the user to mount the repo for next time.

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

## Step 2: Find the target plugin repo and skill

1. **Identify the mounted plugin repo.** Look at the connected folders Cowork has access to.
   The plugin repo is the one containing `.claude-plugin/plugin.json` AND a `skills/` directory.
   If multiple plugin repos are mounted, ask the user which one this learning belongs to.

2. **Read the plugin manifest** at `<plugin-repo>/.claude-plugin/plugin.json` to confirm you've
   got the right repo (the plugin's `name` should match the user's mental model — e.g.
   "prospect-crm", "wcg-skills").

3. **Check for an existing skill** that covers this workflow:
   - List `<plugin-repo>/skills/` and look for a matching skill-name folder
   - Read each candidate's SKILL.md frontmatter `description` to confirm it covers the workflow

4. **Decide:**
   - **Existing skill matches** → go to Step 3a (Update)
   - **No match** → go to Step 3b (Create)
   - **Ambiguous** → ask the user explicitly: "I found `<existing-skill>` which partly covers
     this — update that one, or create a separate skill called `<proposed-new-name>`?"

## Step 3a: Update an existing skill

1. **Read the current** `<plugin-repo>/skills/<skill-name>/SKILL.md`.

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

4. **Ask the user to approve.** Don't write yet. Wait for explicit confirmation
   ("looks good", "ship it", "yes go ahead", etc.).

5. **On approval, write directly to the plugin repo:**

   ```
   Write(<plugin-repo>/skills/<skill-name>/SKILL.md, <updated content>)
   ```

   This overwrites the live skill file in the user's repo. No outputs folder, no manual
   "Customize → Skills → Replace" step.

6. **Bump the plugin's version** in `<plugin-repo>/.claude-plugin/plugin.json`. A skill content
   change is a MINOR bump (X.Y.Z → X.(Y+1).0). Cowork uses the plugin version + a GitHub Release
   together to detect updates — both must reflect the new version, or teammates won't see the
   change.

   ```
   Edit(<plugin-repo>/.claude-plugin/plugin.json, '"version": "X.Y.Z"', '"version": "X.(Y+1).0"')
   ```

7. **Print the full deployment sequence** for the user to paste in their terminal — commit,
   push, tag, AND (critically) the GitHub Release URL:

   ```
   # Commit + push the change
   git -C "<plugin-repo>" add skills/<skill-name>/SKILL.md .claude-plugin/plugin.json
   git -C "<plugin-repo>" commit -m "Update <skill-name>: <one-line summary of what was learned>"
   git -C "<plugin-repo>" push

   # Tag this version (must match the new plugin.json version)
   git -C "<plugin-repo>" tag -a vX.Y.Z -m "vX.Y.Z — <one-line summary>"
   git -C "<plugin-repo>" push origin vX.Y.Z
   ```

   **Then — CRITICAL — create a GitHub Release for the tag.** A tag alone is not enough:
   Cowork's plugin install mechanism detects new versions via GitHub **Releases**, not just
   tags. Without this step, teammates' Update button stays greyed out and the change is
   invisible to them.

   Two ways to create the Release:

   - **Web UI** (easiest — the URL pre-selects the tag and pre-fills the title):

     ```
     https://github.com/<owner>/<repo>/releases/new?tag=vX.Y.Z&title=vX.Y.Z
     ```

     Add brief notes in the description. Tick "Set as the latest release". Click "Publish release".

   - **gh CLI** (if installed):

     ```
     gh release create vX.Y.Z --notes "<one-line summary>" --latest
     ```

8. **Tell the user what teammates need to do** to get the update:
   - **After the Release is published**, Customize → Plugins → `<plugin-name>` shows an enabled
     Update button. Teammates click it, then fully restart Cowork (quit via system tray + Task
     Manager check, not just close the window), and the new content appears.
   - **Before the Release is published**, the Update button is greyed out — the commit on `main`
     is invisible to teammates' Cowork installs regardless of the tag's existence.

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

4. **On approval, write directly to the plugin repo:**

   ```
   Write(<plugin-repo>/skills/<new-skill-name>/SKILL.md, <new skill content>)
   ```

5. **Bump the plugin's version** in `<plugin-repo>/.claude-plugin/plugin.json` — adding a brand
   new skill is also a MINOR bump (X.Y.Z → X.(Y+1).0). Both the version field and a matching
   GitHub Release are required for Cowork to surface the new skill to teammates.

   ```
   Edit(<plugin-repo>/.claude-plugin/plugin.json, '"version": "X.Y.Z"', '"version": "X.(Y+1).0"')
   ```

6. **Print the full deployment sequence** for the user to paste in their terminal:

   ```
   # Commit + push (new skill folder + plugin.json bump)
   git -C "<plugin-repo>" add skills/<new-skill-name>/ .claude-plugin/plugin.json
   git -C "<plugin-repo>" commit -m "Add skill: <new-skill-name> — <one-line description>"
   git -C "<plugin-repo>" push

   # Tag this version
   git -C "<plugin-repo>" tag -a vX.Y.Z -m "vX.Y.Z — add <new-skill-name>"
   git -C "<plugin-repo>" push origin vX.Y.Z
   ```

   **Then create a GitHub Release for the tag** — see Step 3a step 7 for the URL format and
   the `gh release create` alternative. This is the trigger that makes teammates' Update button
   work; without it the new skill is invisible to them.

7. **Tell the user about teammate propagation** — same as Step 3a step 8.

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
2. **The git command** — ready to paste in the user's terminal (already shown in 3a/3b).
3. **Teammate impact** — one line on what others will see and when.

Example:

> Done. Four changes captured:
>
> 1. **Skill updated** — `<plugin-repo>/skills/prospect-crm-create-quote/SKILL.md`
>    - Added Pitfall 9: cannot change SKU on existing line
>    - Reinforced Pitfall 1 with concurrent-edit duplicate-line case
>    - Changelog dated 2026-05-18
>
> 2. **Plugin version bumped** — `.claude-plugin/plugin.json` 1.9.0 → 1.10.0
>
> 3. **Knowledge saved** — `product-NC18052601` note (DBD-140-80-N qty rule), `supplier-lee-plumpton`
>    lesson (defunct, 8 SKUs affected).
>
> 4. **To push to the team**, paste this in your terminal:
>
>    ```
>    git -C "C:\Users\<you>\Repos\prospect-mcp" add skills/prospect-crm-create-quote/SKILL.md .claude-plugin/plugin.json
>    git -C "C:\Users\<you>\Repos\prospect-mcp" commit -m "Update prospect-crm-create-quote: add Pitfall 9 + reinforce Pitfall 1"
>    git -C "C:\Users\<you>\Repos\prospect-mcp" push
>    git -C "C:\Users\<you>\Repos\prospect-mcp" tag -a v1.10.0 -m "v1.10.0 — Pitfall 9 + Pitfall 1 reinforcement"
>    git -C "C:\Users\<you>\Repos\prospect-mcp" push origin v1.10.0
>    ```
>
>    **Then publish a GitHub Release** for the tag (REQUIRED — without it teammates can't update):
>
>    ```
>    https://github.com/dale-ctrl/prospect-mcp/releases/new?tag=v1.10.0&title=v1.10.0
>    ```
>
>    Add brief notes. Tick "Set as the latest release". Click "Publish release".
>
>    Teammates: after the Release is published, Customize → Plugins → prospect-crm → Update
>    button becomes enabled. Click it, restart Cowork, the new content appears.

## First-time setup

If running this skill for the first time after install, the plugin repo probably isn't mounted
yet. Tell the user:

> "I can't see your plugin repo as a mounted folder. To set up team deployment:
>
> 1. Identify your plugin repo path (e.g. `Z:\prospect-mcp-plugin`).
> 2. In Cowork, click the folder icon / "Select a folder" prompt and pick that folder.
>    Cowork will remember it across future sessions.
> 3. Re-run me (`/wcg-retrospective`) and I'll write directly to the repo.
>
> For this session, I'll fall back to saving the updated SKILL.md to your workspace outputs
> folder — you can copy it into the repo manually."

(Then fall back to the legacy workspace-folder save and the manual Customize → Skills → Replace
instructions.)

## Fallback: no plugin repo mounted

If the user declines to mount the plugin repo (or it doesn't exist as a folder on this machine),
follow the legacy workflow:

1. Save updated/new SKILL.md to `<workspace>/outputs/<skill-name>/SKILL.md`.
2. Tell the user: *"To apply locally for testing: Customize → Skills → [skill-name] →
   three-dot menu (⋯) → Replace → select the SKILL.md from your workspace folder. To deploy to
   the team, copy that file into your plugin repo's `skills/<skill-name>/` folder and push via
   your normal git workflow."*

The team-deployment path is harder without the mount, but the skill still works.

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

- **2026-05-18 (v3)** — Added GitHub Releases to the deployment sequence. Cowork's plugin install
  mechanism detects new versions via GitHub **Releases**, NOT just tags — without a published
  Release, teammates' Update button stays greyed out and changes are invisible to them. Step 3a
  step 6/7 and Step 3b step 5/6 now print a four-part deployment sequence (plugin.json bump +
  commit/push + tag + Release) instead of a single git command. Step 5 example updated to show
  the full sequence including the Release URL. Discovered during a multi-hour debug of why v1.9.0
  didn't propagate to Cowork after a clean tag + push — the missing Release step was the entire
  issue. The cache structure at `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/` is
  populated only on a successful Release-triggered install.
- **2026-05-18 (v2)** — Major rewrite for team deployment. Skill now writes SKILL.md updates
  directly to the mounted WCG plugin repo and prints a one-line git command for the user to
  paste in their terminal. Removed the manual "Customize → Skills → Replace" step from the
  happy path (retained as fallback when no plugin repo is mounted). Added Step 4 covering
  knowledge-tool capture for customer/supplier/product-specific learnings that don't belong in
  the generic skill. Added first-time-setup section. Added generic-skill principle.
- **(prior)** — Initial version: retrospective saved updated SKILL.md to workspace folder for
  manual replacement via Customize → Skills.
