# Changelog

All notable changes to this plugin will be documented in this file.

The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## [Unreleased]

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
