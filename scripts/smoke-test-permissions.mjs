/**
 * Smoke-test the three-layer permissions loader.
 *
 *   Layer 1: live fetch from raw.githubusercontent.com
 *   Layer 2: local cache after a previous successful fetch
 *   Layer 3: bundled defaults when both remote and cache are unavailable
 *   Layer 4: corrupt cache → falls through to bundled, cache untouched
 *
 * Each scenario is run in a fresh subprocess with isolated env vars so they
 * don't interfere with each other. We use a temp HOME so the cache path
 * doesn't clobber a real user's cache.
 *
 * Run: node scripts/smoke-test-permissions.mjs
 */

import { spawnSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const REPO_ROOT = new URL("..", import.meta.url).pathname.replace(/^\/(\w):/, "$1:");
const LOADER = join(REPO_ROOT, "dist", "permissions.js");

if (!existsSync(LOADER)) {
  console.error(`✗ ${LOADER} not found — run \`npm run build\` first`);
  process.exit(1);
}

let pass = 0, fail = 0;

function makeSandbox() {
  const home = mkdtempSync(join(tmpdir(), "prospect-perms-test-"));
  const cacheDir = join(home, ".prospect-crm");
  mkdirSync(cacheDir, { recursive: true });
  return { home, cacheDir, cachePath: join(cacheDir, "permissions-cache.json") };
}

// Run an inline script in a child Node process with a controlled environment.
// We use ESM dynamic import of the compiled loader and JSON.stringify the
// result so we can parse it back here.
function runLoader(env) {
  const inlineScript = `
    process.removeAllListeners("warning");
    const mod = await import(${JSON.stringify("file:///" + LOADER.replace(/\\\\/g, "/"))});
    try {
      const cfg = await mod.loadPermissions();
      console.log("RESULT:" + JSON.stringify({ ok: true, userCount: Object.keys(cfg.users).length }));
    } catch (err) {
      console.log("RESULT:" + JSON.stringify({ ok: false, error: err.message }));
    }
  `;
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", inlineScript],
    { env: { ...process.env, ...env }, encoding: "utf-8" },
  );
  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  const m = stdout.match(/RESULT:(.*)/);
  const parsed = m ? JSON.parse(m[1]) : { ok: false, error: "no RESULT line", stdout, stderr };
  return { ...parsed, stderr };
}

function expect(label, cond, detail) {
  if (cond) {
    console.log(`  ✓ ${label}`);
    pass++;
  } else {
    console.log(`  ✗ ${label}${detail ? "  — " + detail : ""}`);
    fail++;
  }
}

function showLogs(stderr) {
  const lines = stderr.split(/\r?\n/).filter((l) => l.includes("permissions:"));
  for (const l of lines) console.log("    " + l.trim());
}

// ── Scenario 1: live fetch works → remote permissions used ──
console.log("\nScenario 1: live remote fetch");
{
  const sb = makeSandbox();
  const r = runLoader({ HOME: sb.home, USERPROFILE: sb.home });
  showLogs(r.stderr);
  expect("loader returned ok", r.ok, r.error);
  expect("at least 1 user in returned config", r.ok && r.userCount >= 1);
  expect("logs mention 'loaded from remote'", /loaded from remote/.test(r.stderr));
  expect("cache file was written", existsSync(sb.cachePath));
  rmSync(sb.home, { recursive: true, force: true });
}

// ── Scenario 2: remote fails, cache hit → cache used ──
console.log("\nScenario 2: remote unreachable, cache hit");
{
  const sb = makeSandbox();
  // Seed the cache with a known-good config (stripped down).
  const seedCache = JSON.stringify({
    users: { TEST: { name: "Test", writeAllow: "" } },
    defaults: { writeAllow: "" },
  });
  writeFileSync(sb.cachePath, seedCache, "utf-8");
  const r = runLoader({
    HOME: sb.home,
    USERPROFILE: sb.home,
    PROSPECT_PERMISSIONS_URL: "https://prospect-mcp-smoke-test-invalid.example.invalid/permissions.json",
  });
  showLogs(r.stderr);
  expect("loader returned ok despite remote failure", r.ok, r.error);
  expect("logs warn about remote fetch failure", /remote fetch.*failed/.test(r.stderr));
  expect("logs mention 'loaded from local cache'", /loaded from local cache/.test(r.stderr));
  expect("returned config has the seeded TEST user (count = 1)", r.ok && r.userCount === 1);
  rmSync(sb.home, { recursive: true, force: true });
}

// ── Scenario 3: remote fails, no cache → bundled used ──
console.log("\nScenario 3: remote unreachable, no cache");
{
  const sb = makeSandbox();
  // Make sure cache file does NOT exist
  if (existsSync(sb.cachePath)) rmSync(sb.cachePath);
  const r = runLoader({
    HOME: sb.home,
    USERPROFILE: sb.home,
    PROSPECT_PERMISSIONS_URL: "https://prospect-mcp-smoke-test-invalid.example.invalid/permissions.json",
  });
  showLogs(r.stderr);
  expect("loader returned ok using bundled defaults", r.ok, r.error);
  expect("logs warn about remote fetch failure", /remote fetch.*failed/.test(r.stderr));
  expect("logs warn 'no cache' or 'unreadable'", /no cache|unreadable/.test(r.stderr));
  expect("logs mention 'using bundled defaults'", /using bundled defaults/.test(r.stderr));
  rmSync(sb.home, { recursive: true, force: true });
}

// ── Scenario 4: corrupt cache → falls through to bundled ──
console.log("\nScenario 4: remote unreachable, cache corrupt");
{
  const sb = makeSandbox();
  writeFileSync(sb.cachePath, "{this is not json", "utf-8");
  const r = runLoader({
    HOME: sb.home,
    USERPROFILE: sb.home,
    PROSPECT_PERMISSIONS_URL: "https://prospect-mcp-smoke-test-invalid.example.invalid/permissions.json",
  });
  showLogs(r.stderr);
  expect("loader returned ok despite corrupt cache", r.ok, r.error);
  expect("logs warn about cache being unreadable", /cache.*unreadable/.test(r.stderr));
  expect("logs mention 'using bundled defaults'", /using bundled defaults/.test(r.stderr));
  // Cache file should still exist (we don't overwrite it on a failed remote fetch).
  expect("corrupt cache was NOT overwritten by failed-remote attempt", existsSync(sb.cachePath) && readFileSync(sb.cachePath, "utf-8").startsWith("{this is not json"));
  rmSync(sb.home, { recursive: true, force: true });
}

// ── Scenario 5: corrupt cache + successful remote → cache rewritten ──
console.log("\nScenario 5: corrupt cache, remote OK → cache gets overwritten");
{
  const sb = makeSandbox();
  writeFileSync(sb.cachePath, "{garbage", "utf-8");
  const r = runLoader({ HOME: sb.home, USERPROFILE: sb.home }); // default URL = live
  showLogs(r.stderr);
  expect("loader returned ok", r.ok, r.error);
  expect("logs mention 'loaded from remote'", /loaded from remote/.test(r.stderr));
  let cacheValid = false;
  try { JSON.parse(readFileSync(sb.cachePath, "utf-8")); cacheValid = true; } catch { /* invalid */ }
  expect("cache was overwritten with valid JSON", cacheValid);
  rmSync(sb.home, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
