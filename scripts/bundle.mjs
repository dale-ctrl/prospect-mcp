#!/usr/bin/env node
/**
 * Produce a self-contained dist/index.js for runtime — bundles src/index.ts
 * with every import inlined (zod, @modelcontextprotocol/sdk, everything).
 *
 * Why this exists
 * ---------------
 * Cowork's plugin manager copies the plugin's source tree into the rpm
 * runtime cache and spawns the MCP server via the bundled `.mcp.json`
 * (`${CLAUDE_PLUGIN_ROOT}/dist/index.js`). It does NOT run `npm install`
 * in the cache. So if dist/index.js does `import { Server } from
 * "@modelcontextprotocol/sdk/..."`, Node throws ERR_MODULE_NOT_FOUND at
 * spawn time because node_modules/ isn't present in the rpm cache.
 *
 * Pre-v1.19.0 users worked around this by manually adding an mcpServers
 * entry to claude_desktop_config.json pointing at the full marketplace
 * clone (which DOES have node_modules after `npm install`). That works
 * for Squirrel Claude but not for MSIX Claude — MSIX Claude only reads
 * the plugin's bundled `.mcp.json`, so the workaround can't apply.
 *
 * Bundling fixes both install models: dist/index.js becomes a single
 * file that runs standalone. Cowork copies it, Node executes it, no
 * deps needed at runtime.
 *
 * What's in / out
 * ---------------
 * - INPUT:  src/index.ts (the MCP server entry point)
 * - OUTPUT: dist/index.js (one file, ESM, ~1-2 MB once minified=false)
 * - All npm deps are inlined except Node built-ins (`fs`, `path`, etc).
 * - tsc still runs before this (in npm run build) to produce the
 *   per-test compiled files at dist/test-*.js that the test suites
 *   consume. esbuild only overwrites dist/index.js.
 *
 * If a future dep can't be bundled (e.g. native binding), esbuild will
 * fail loudly with a specific error — add it to `external` below.
 */

import { build } from "esbuild";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8"));

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  // Bundle every dependency. Node built-ins are auto-externalised by
  // platform=node. If a real dependency ever can't be bundled, list it
  // here (and document why in this comment).
  external: [],
  // Keep the bundle readable when reading dist/index.js on disk — useful
  // when an admin needs to spot-check what's actually shipping. Minify
  // would shave ~40% but make the file unreadable; the few hundred kb
  // saved isn't worth losing that.
  minify: false,
  sourcemap: false,
  // Emit a banner with the build metadata so it's obvious at a glance
  // what version of the plugin a given dist/index.js is.
  banner: {
    js: `// prospect-crm-mcp v${pkg.version} — bundled by esbuild on ${new Date().toISOString()}\n// Single-file MCP server; no node_modules required at runtime.`,
  },
  logLevel: "info",
});
