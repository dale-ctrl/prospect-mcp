#!/usr/bin/env node
// Enables auto-update for the wcg-prospect marketplace in
// ~/.claude/plugins/known_marketplaces.json so future plugin versions
// land on Claude Desktop restart without manual /plugin update commands.
//
// Stopgap for the missing CLI/UI toggle:
//   https://github.com/anthropics/claude-code/issues/10265
//
// Usage (no clone required):
//   curl -O https://raw.githubusercontent.com/dale-ctrl/prospect-mcp/main/scripts/enable-autoupdate.cjs
//   node enable-autoupdate.cjs
//
// Pure Node stdlib (fs, path, os) -- no npm install needed.
// ASCII-only output for cmd.exe compatibility.
// .cjs extension forces CommonJS regardless of any parent package.json
// that sets "type": "module" -- prevents the "require is not defined"
// failure if the script gets dropped into an ESM-typed project root.

const fs = require('fs');
const path = require('path');
const os = require('os');

const filePath = path.join(os.homedir(), '.claude', 'plugins', 'known_marketplaces.json');
const target = 'wcg-prospect';

if (!fs.existsSync(filePath)) {
  console.error('Could not find ' + filePath + '.');
  console.error('Run "/plugin marketplace add dale-ctrl/prospect-mcp" first.');
  process.exit(1);
}

let data;
try {
  data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
} catch (err) {
  console.error('Failed to parse ' + filePath + ': ' + err.message);
  process.exit(1);
}

let updated = false;

if (data.name === target) {
  data.autoUpdate = true;
  updated = true;
} else if (Array.isArray(data.marketplaces)) {
  for (const m of data.marketplaces) {
    if (m && m.name === target) {
      m.autoUpdate = true;
      updated = true;
    }
  }
} else if (data[target] && typeof data[target] === 'object') {
  data[target].autoUpdate = true;
  updated = true;
}

if (!updated) {
  console.error('Could not locate "' + target + '" entry in ' + filePath + '.');
  console.error('Top-level keys: ' + Object.keys(data).join(', '));
  console.error('Has the marketplace been registered yet?');
  process.exit(1);
}

fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
console.log('Auto-update enabled for "' + target + '" marketplace.');
console.log('Restart Claude Desktop for the setting to take effect.');
