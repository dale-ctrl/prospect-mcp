# Changelog

All notable changes to this plugin will be documented in this file.

The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## [Unreleased]

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
