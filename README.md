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

### Recommended — plugin install (1.1.0+)

This repo is a Claude Code plugin. From inside Claude Code or Claude Desktop:

1. Add the marketplace and install the plugin:

   ```
   /plugin marketplace add dale-ctrl/prospect-mcp
   ```

2. Install the plugin from that marketplace:

   ```
   /plugin install prospect-crm@wcg-prospect
   ```

   The MCP server runs from the plugin's bundled `dist/`, and the [`versa-maintenance-contracts-bulk`](skills/versa-maintenance-contracts-bulk/SKILL.md) skill auto-loads with the plugin — no copying into `~/.claude/skills/`.

3. **Enable auto-updates** so future versions land on app restart without manual update commands. Download and run the helper script:

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

   Restart Claude Desktop after running. From then on, every restart pulls the latest plugin version automatically — no `/plugin update` commands needed.

   The script just sets `autoUpdate: true` on the `wcg-prospect` entry in `~/.claude/plugins/known_marketplaces.json`. Anthropic has an [open feature request](https://github.com/anthropics/claude-code/issues/10265) for a built-in CLI/UI alternative, so this script may become unnecessary in a future Claude Desktop release.

You still need to set the `PROSPECT_PAT` (and optionally `PROSPECT_PROFILE_ID`) environment variable in your Claude Code/Desktop env. See [Required environment](#required-environment) below.

### Migrating from a 1.0.x `mcpServers` install

If you previously added a `prospect-crm` block to your `claude_desktop_config.json` under `mcpServers`, **remove it before installing the plugin**. Claude Desktop treats two MCP servers with the same name as a duplicate and the plugin's server won't load. After removing the old block, restart Claude Desktop, then run the install steps above.

### Legacy / fallback — raw `mcpServers` entry

For Claude Desktop versions that don't yet support `/plugin` commands, the original install path still works. You miss skill auto-loading (you have to copy [`skills/versa-maintenance-contracts-bulk/`](skills/versa-maintenance-contracts-bulk/) into `%USERPROFILE%\.claude\skills\` or `~/.claude/skills/` yourself), but the MCP tools function identically.

1. Clone or sync this repo locally (e.g. on the NAS share).
2. `npm install && npm run build`.
3. Generate a Prospect PAT in ProspectCRM: **Settings > Integrations > API > Personal Access Tokens**. Keep it safe — treat it like a password.
4. Edit your `claude_desktop_config.json`:
   - **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
   - **Mac:** `~/Library/Application Support/Claude/claude_desktop_config.json`

   Add to `mcpServers`:

   ```json
   {
     "mcpServers": {
       "prospect-crm": {
         "command": "node",
         "args": ["\\\\SYNOLOGY-NAS\\IT\\prospect-mcp\\dist\\index.js"],
         "env": {
           "PROSPECT_PAT": "your_personal_access_token",
           "PROSPECT_BASE_URL": "https://api-v1-westeurope.prospect365.com"
         }
       }
     }
   }
   ```

   Replace the UNC path with the actual location of this repo on your NAS. If Node isn't on PATH, use the full path to `node.exe` (`where node`).
5. Restart Claude Desktop.

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

Add to `.env`:

```
PROSPECT_PAT=<your_personal_access_token>
PROSPECT_BASE_URL=https://api-v1-westeurope.prospect365.com
```

`PROSPECT_PROFILE_ID` is resolved automatically on first request via `GET /Info()`. You only need to set it manually if that auto-fetch is blocked (e.g. running offline against a fixture). `PROSPECT_LOCALE` defaults to `en-GB`.

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
