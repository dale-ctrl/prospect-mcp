#!/usr/bin/env node
// One-time credential setup for the prospect-crm Claude plugin.
//
// Prompts for PROSPECT_PAT, PROSPECT_BASE_URL (default supplied), and
// PROSPECT_USER_ID, then saves them to ~/.prospect-crm/config.json with
// 0600 file mode on Unix-like systems.
//
// Run after installing the plugin via /plugin install. The MCP server
// reads from this file at startup if the same env vars aren't set in
// process env (env wins; this is a fallback for plugin users who don't
// want to maintain a claude_desktop_config.json mcpServers block).
//
// Usage (no clone required):
//   curl -O https://raw.githubusercontent.com/dale-ctrl/prospect-mcp/main/scripts/setup.cjs
//   node setup.cjs
//
// Pure Node stdlib (fs, path, os, readline) -- no npm install needed.
// ASCII-only output for cmd.exe compatibility.
// .cjs extension forces CommonJS regardless of any parent package.json
// "type": "module" the user might have curled the script alongside.

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const CONFIG_DIR = path.join(os.homedir(), '.prospect-crm');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const DEFAULT_BASE_URL = 'https://api-v1-westeurope.prospect365.com';

function prompt(rl, question, defaultValue) {
  return new Promise((resolve) => {
    const suffix = defaultValue ? ' [' + defaultValue + ']: ' : ': ';
    rl.question(question + suffix, (answer) => {
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('Prospect CRM plugin setup');
  console.log('=========================');
  console.log('You can find or create a PAT under your Prospect CRM');
  console.log('profile -> API Tokens. Treat it like a password.');
  console.log('');

  let existing = {};
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      existing = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      console.log('Existing config found at ' + CONFIG_FILE);
      console.log('Press Enter to keep the existing value for any field.');
      console.log('');
    } catch (e) {
      console.log('Found unparseable config at ' + CONFIG_FILE + ' -- it will be replaced.');
      console.log('');
    }
  }

  const pat = await prompt(rl, 'PROSPECT_PAT', existing.PROSPECT_PAT);
  const baseUrl = await prompt(
    rl,
    'PROSPECT_BASE_URL',
    existing.PROSPECT_BASE_URL || DEFAULT_BASE_URL
  );
  const userId = await prompt(rl, 'PROSPECT_USER_ID', existing.PROSPECT_USER_ID);

  rl.close();

  if (!pat) {
    console.error('PROSPECT_PAT is required. Aborting.');
    process.exit(1);
  }

  const config = {
    PROSPECT_PAT: pat,
    PROSPECT_BASE_URL: baseUrl,
    PROSPECT_USER_ID: userId,
  };

  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n');

  // Lock down on Unix-like systems. No-op (or silently fails) on Windows.
  try {
    fs.chmodSync(CONFIG_FILE, 0o600);
  } catch (e) {
    // chmod can fail on Windows or filesystems that don't support POSIX modes
  }

  console.log('');
  console.log('Saved config to ' + CONFIG_FILE);
  console.log('Restart Claude Desktop for the new credentials to take effect.');
}

main().catch((err) => {
  console.error('Setup failed: ' + err.message);
  process.exit(1);
});
