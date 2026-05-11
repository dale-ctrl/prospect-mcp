# Changelog

All notable changes to this plugin will be documented in this file.

The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## [Unreleased]

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
