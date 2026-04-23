# ProspectCRM MCP Server

Connects Claude Desktop / Cowork to Prospect365 CRM for quote management at WCG.

## What it does

Gives Claude the ability to:
- **Search quotes** by company, contact, salesperson, status, or date
- **View full quote details** including all line items, margins, and totals
- **Create new quotes** linked to a contact
- **Add, update, and remove quote lines** with products, prices, and discounts
- **Search contacts, companies, and products** in the CRM catalogue

## Setup (first time)

### 1. Install dependencies

Open a terminal in this folder (or via mapped drive) and run:

```
npm install
```

### 2. Build

```
npm run build
```

This compiles TypeScript into the `dist/` folder.

### 3. Get your Prospect PAT token

In ProspectCRM: **Settings > Integrations > API > Personal Access Tokens**

Generate a new token. Keep it safe — treat it like a password.

### 4. Test API connectivity

```
set PROSPECT_PAT=your_token_here
npm run test:api
```

You should see quote statuses, recent quotes, and a product count. If you get a 401, your token is wrong or expired.

### 5. Configure Claude Desktop

Edit your `claude_desktop_config.json`:

- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **Mac:** `~/Library/Application Support/Claude/claude_desktop_config.json`

Add this to the `mcpServers` section:

```json
{
  "mcpServers": {
    "prospect-crm": {
      "command": "node",
      "args": ["\\\\SYNOLOGY-NAS\\IT\\prospect-mcp\\dist\\index.js"],
      "env": {
        "PROSPECT_PAT": "your_personal_access_token",
        "PROSPECT_BASE_URL": "https://crm-odata-v1.prospect365.com"
      }
    }
  }
}
```

> **Note:** Replace `\\\\SYNOLOGY-NAS\\IT\\prospect-mcp` with the actual UNC path to this folder on the NAS. If Node isn't on your system PATH, use the full path to `node.exe` (run `where node` to find it).

### 6. Restart Claude Desktop

Close and reopen Claude Desktop. The ProspectCRM tools should appear in your connector/tools list.

## Usage examples

In Claude Desktop (Chat or Cowork), try:

- *"Search for quotes for Exeter University"*
- *"Show me quote 12345 with all the line items"*
- *"Create a new quote for contact Sarah Jones with description 'Office furniture fitout'"*
- *"Add 10x whiteboard panels at £85 each to quote 12345"*
- *"Update the delivery postcode on quote 12345 to EX1 2AB"*
- *"Find product code WB-PANEL in the catalogue"*
- *"Search for contacts at Plymouth Council"*

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
│   │   ├── quotes.ts      # Quote header CRUD
│   │   ├── quote-lines.ts # Quote line add/update/delete
│   │   └── lookups.ts     # Contact, product, division search
│   └── types/
│       └── prospect.ts    # TypeScript interfaces from OData metadata
└── dist/                  # Compiled JS (after npm run build)
```
