#!/usr/bin/env node
/**
 * ProspectCRM MCP Server
 *
 * Exposes Prospect365 CRM quote management tools to Claude Desktop / Cowork
 * via the Model Context Protocol (stdio transport).
 *
 * Usage in claude_desktop_config.json:
 * {
 *   "mcpServers": {
 *     "prospect-crm": {
 *       "command": "node",
 *       "args": ["path/to/prospect-mcp/dist/index.js"],
 *       "env": {
 *         "PROSPECT_PAT": "your_token",
 *         "PROSPECT_BASE_URL": "https://crm-odata-v1.prospect365.com"
 *       }
 *     }
 *   }
 * }
 */
export {};
//# sourceMappingURL=index.d.ts.map