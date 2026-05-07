# ProspectCRM MCP Server

Connects Claude (Desktop, Code, or web via a compatible client) to Prospect365 CRM for quote management at WCG.

## What it does

Gives Claude the ability to:
- **Search quotes** by company, contact, salesperson, status, or date
- **View full quote details** including all line items, margins, and totals
- **Create new quotes** linked to a contact
- **Add, update, and remove quote lines** with products, prices, and discounts
- **Search contacts, companies, and products** in the CRM catalogue
- **Email a quote** to its primary contact using the tenant's default email template, and download the rendered PDF (opt-in, see **Quote Messaging** below)

## Install

### Recommended (Claude plugin install — 1.2.0+)

1. In Claude Desktop, open **Customize → Personal plugins → +**.
2. Add marketplace: paste `dale-ctrl/prospect-mcp`.
3. Click **Install** on `prospect-crm`.
4. Run the one-time credential setup.

   **Windows (recommended):** from PowerShell, run the script straight off the NAS share:

   ```powershell
   \\192.168.1.155\sfm_data\prospect-mcp\scripts\setup-user.ps1
   ```

   It pre-flights Node + Claude Desktop, prompts for your CRM user code (e.g. `DL`, `ML`) and your `PROSPECT_PAT` (hidden input), and writes `%USERPROFILE%\.prospect-crm\config.json` with current-user-only ACLs. It also detects and warns about any leftover `prospect-crm` entry in `claude_desktop_config.json` (left over from v1.2.0); see [Migrating](#migrating-from-a-connector-based-install-v10x--v11x) below if you need to remove one.

   **Mac / Linux / cross-platform fallback:** Node-based equivalent — works anywhere Node 18+ is on PATH:

   ```bash
   curl -O https://raw.githubusercontent.com/dale-ctrl/prospect-mcp/main/scripts/setup.cjs
   node setup.cjs
   ```

   Both scripts write the same `~/.prospect-crm/config.json` and prompt for the same fields (`PROSPECT_PAT`, `PROSPECT_BASE_URL`, `PROSPECT_USER_ID`). Run once per machine; future plugin updates pick the credentials up automatically. Re-run any time your PAT changes — the previous file is backed up with a timestamp suffix.

5. Restart Claude Desktop.

The MCP server runs from the plugin's bundled `dist/`, and the [`versa-maintenance-contracts-bulk`](skills/versa-maintenance-contracts-bulk/SKILL.md) skill auto-loads with the plugin — no copying into `~/.claude/skills/`.

### Optional — enable auto-updates

So future plugin versions land on app restart without manual `/plugin update` commands. Download and run the helper script:

**Windows (PowerShell):**

```powershell
Invoke-WebRequest https://raw.githubusercontent.com/dale-ctrl/prospect-mcp/main/scripts/enable-autoupdate.cjs -OutFile enable-autoupdate.cjs
node enable-autoupdate.cjs
```

**Mac/Linux:**

```bash
curl -O https://raw.githubusercontent.com/dale-ctrl/prospect-mcp/main/scripts/enable-autoupdate.cjs
node enable-autoupdate.cjs
```

Restart Claude Desktop after running. The script sets `autoUpdate: true` on the `wcg-prospect` entry in `~/.claude/plugins/known_marketplaces.json`. Anthropic has an [open feature request](https://github.com/anthropics/claude-code/issues/10265) for a built-in CLI/UI alternative.

### Migrating from a connector-based install (v1.0.x / v1.1.x)

If you previously installed via an `mcpServers` entry in `claude_desktop_config.json`:

1. Open `%APPDATA%\Claude\claude_desktop_config.json` (Windows) or `~/Library/Application Support/Claude/claude_desktop_config.json` (Mac).
2. Remove the `prospect-crm` entry from the `mcpServers` object — Claude Desktop treats two MCP servers with the same name as a duplicate and the plugin's server won't load if both exist.
3. Save the file.
4. Run the credential setup (above) to migrate your credentials into `~/.prospect-crm/config.json` — `setup-user.ps1` on Windows, `node setup.cjs` everywhere else.
5. Restart Claude Desktop.

The legacy `mcpServers` install path still works for one more release as a fallback, but new installs should use the plugin path. The `PROSPECT_PAT` env var continues to take precedence over the config file when both are set, so power users / CI can still drive the connector via environment variables.

### First-time API smoke test (any install path)

```
set PROSPECT_PAT=your_token_here
npm run test:api
```

You should see quote statuses, recent quotes, and a product count. 401 = token wrong or expired.

## Usage examples

In any Claude chat with the connector enabled, try:

- *"Search for quotes for Exeter University"*
- *"Show me quote 12345 with all the line items"*
- *"Create a new quote for contact Sarah Jones with description 'Office furniture fitout'"*
- *"Add 10x whiteboard panels at £85 each to quote 12345"*
- *"Update the delivery postcode on quote 12345 to EX1 2AB"*
- *"Find product code WB-PANEL in the catalogue"*
- *"Search for contacts at Plymouth Council"*

## Bundled skills

Skills under `skills/` capture multi-step workflows on top of the connector's tools. **On the plugin install path they auto-load** — no manual copy required. On the legacy `mcpServers` install path, copy each `skills/<skill-name>/` folder into `%USERPROFILE%\.claude\skills\` (Windows) or `~/.claude/skills/` (Mac/Linux).

Currently shipped:

- [`versa-maintenance-contracts-bulk`](skills/versa-maintenance-contracts-bulk/SKILL.md) — produces single or bulk Versa Maintenance Contracts (docx + PDF) by client-side merging from a Wimbledon-style template, bypassing Prospect's `MergeData` ContactNotSet error.

## Quote Messaging (send PDF by email)

Two tools replicate the 7-call flow Prospect's own UI runs when you hit "Send Email":

- **`send_quote_email({ quoteId, to?, cc?, bcc?, subject?, messageBody?, emailTemplateCode?, quoteTemplateCode?, attachPdf? })`** — renders the email subject+body from `_EMLQC` by default, renders the user's signature, creates a `_QUOTE` PDF attachment shell, stages the attachment, and fires `SendMessage`. `to` defaults to the quote's primary contact email. Overrides are optional — every parameter except `quoteId` has a sensible default. Returns the DocumentId of the sent-email record + the DocumentId of the PDF attachment (feed that to `get_merge_output`).
- **`get_merge_output({ documentId, saveTo? })`** — fetches the source document via `GET /Documents({id})/Raw()` (typically a DOCX). Pass `saveTo` (file path or directory) to write to disk and get back only metadata; omit it to receive base64 bytes inline. Real quote documents are 40–100 KB, so `saveTo` is strongly preferred.

> ⚠️ **`send_quote_email` fires a REAL email on every call.** It's gated behind a separate `messaging` permission module that is **off by default for all users — including admins with `writeAllow: "*"`**. You must opt in explicitly.

### Required environment

The MCP client at startup resolves credentials in this order:

1. **Process env vars** — `PROSPECT_PAT`, `PROSPECT_BASE_URL`, `PROSPECT_USER_ID`, `PROSPECT_PROFILE_ID`, `PROSPECT_LOCALE`. CI / power users can keep using these.
2. **Config file** at `~/.prospect-crm/config.json` (created by `scripts/setup-user.ps1` on Windows or `scripts/setup.cjs` cross-platform). Plugin users typically only have this.
3. **Built-in defaults** for `PROSPECT_BASE_URL` (= `https://api-v1-westeurope.prospect365.com`) and `PROSPECT_LOCALE` (= `en-GB`).

If neither env nor file supplies a `PROSPECT_PAT`, the MCP server fails fast at startup with an actionable error pointing at the setup script. `PROSPECT_PROFILE_ID` is auto-resolved via `GET /Info()` on first request when not set explicitly.

For local development against a checked-out repo:

```
# .env
PROSPECT_PAT=<your_personal_access_token>
PROSPECT_BASE_URL=https://api-v1-westeurope.prospect365.com
PROSPECT_USER_ID=<your-3-char-user-code-e.g.-DL>
```

**Do not use the public-docs host** `crm-odata-v1.prospect365.com` — it's a read-only shim on which `SendMessage` silently returns `value: 0`.

### Opt-in walkthrough

1. Edit `config/permissions.json` and grant your user `messaging.send`:

    ```json
    "DL": {
      "name": "Dale Liesching",
      "writeAllow": "*",
      "permissions": {
        "messaging": { "send": true }
      }
    }
    ```

2. Rebuild: `npm run build`.
3. Restart Claude Desktop (or any MCP host holding this server) so the updated tool description is picked up.

### Live smoke test

```
PROSPECT_PAT=<pat> npm run test:send-message -- <QuoteId>
```

Sends a real email to the quote's primary contact and saves the source DOCX to `./smoke-test-output/`. Only run against a quote whose primary contact is an address you own.

Implementation details + why earlier approaches silently no-opped: [src/tools/MESSAGING-NOTES.md](src/tools/MESSAGING-NOTES.md).

## Development

Code lives on the NAS share. To make changes:

1. Open the project folder in Claude Code (via mapped drive)
2. Edit source files in `src/`
3. Run `npm run build` to recompile
4. Restart Claude Desktop to pick up changes

For live development, run `npm run dev` to watch for changes and auto-recompile.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "PROSPECT_PAT environment variable is required" | PAT not set in claude_desktop_config.json env block |
| 401 Unauthorized | PAT token expired or revoked — regenerate in CRM |
| 429 Too Many Requests | Rate limited (1200 req/10min). Server auto-retries. Wait if persistent. |
| 404 Not Found | Wrong entity ID or entity name. Check QuoteId/LineId exists. |
| Tools not showing in Claude | Restart Claude Desktop. Check config JSON syntax. Check node path. |
| "Cannot find module" errors | Run `npm run build` — TypeScript hasn't been compiled |

## File structure

```
prospect-mcp/
├── CLAUDE.md              # Full project spec for Claude Code
├── README.md              # This file
├── package.json
├── tsconfig.json
├── .env.example           # Template for env vars
├── src/
│   ├── index.ts           # MCP server entry point
│   ├── client.ts          # OData HTTP client
│   ├── test-api.ts        # API connectivity test
│   ├── tools/
│   │   ├── quotes.ts          # Quote header CRUD
│   │   ├── quote-lines.ts     # Quote line add/update/delete
│   │   ├── quote-messaging.ts # send_quote_email + get_merge_output
│   │   ├── MESSAGING-NOTES.md # v2 roadmap & API investigation trail
│   │   └── lookups.ts         # Contact, product, division search
│   └── types/
│       └── prospect.ts    # TypeScript interfaces from OData metadata
├── skills/                # Bundled workflow skills — copy into ~/.claude/skills/ to use
│   └── versa-maintenance-contracts-bulk/
│       └── SKILL.md
└── dist/                  # Compiled JS (after npm run build)
```
