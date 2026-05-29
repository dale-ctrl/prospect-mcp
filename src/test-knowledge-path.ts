#!/usr/bin/env node

/**
 * Unit tests for the v1.19.1 knowledge-path resolution.
 *
 * Three-tier resolution (highest priority first):
 *   1. WCG_KNOWLEDGE_PATH env var — explicit override
 *   2. WCG OneDrive default — auto-detected when the folder exists
 *   3. <plugin-root>/reference/ — last-resort fallback
 *
 * The point of these tests is to make sure the OneDrive default kicks in
 * exactly when expected — we don't want to silently miss it and start
 * writing lessons into the rpm cache (which gets wiped on plugin updates).
 *
 * Run with: npm run test:knowledge-path
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const { resolveKnowledgeDir } = await import("./tools/knowledge.js");

const WCG_ONEDRIVE_PATH = join(
  homedir(),
  "OneDrive - Westcountry Group",
  "Estimating Team",
  "Claude",
);

function envWith(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  // Build a clean env containing only what we ask for. Avoids the test
  // accidentally inheriting a real WCG_KNOWLEDGE_PATH from the developer's
  // shell and producing a confusing pass.
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(overrides)) {
    if (v !== undefined) env[k] = v;
  }
  return env;
}

test("resolveKnowledgeDir: env var override wins over everything", () => {
  const dir = resolveKnowledgeDir(envWith({ WCG_KNOWLEDGE_PATH: "C:\\Custom\\Path" }));
  assert.equal(dir, "C:\\Custom\\Path");
});

test("resolveKnowledgeDir: env var beats OneDrive even when OneDrive folder exists", () => {
  // Whatever the host machine's OneDrive state, env var should win.
  const dir = resolveKnowledgeDir(envWith({ WCG_KNOWLEDGE_PATH: "X:\\override" }));
  assert.equal(dir, "X:\\override");
});

test("resolveKnowledgeDir: defaults to OneDrive when folder exists AND no env override", () => {
  // Skip on machines without the WCG OneDrive folder (CI, non-WCG devs).
  // The next test covers the fallback case.
  if (!existsSync(WCG_ONEDRIVE_PATH)) {
    return;
  }
  const dir = resolveKnowledgeDir(envWith({}));
  assert.equal(dir, WCG_ONEDRIVE_PATH);
});

test("resolveKnowledgeDir: falls back to plugin reference dir when neither env nor OneDrive present", () => {
  // Skip on Dale's machine where the WCG folder DOES exist — covered above.
  if (existsSync(WCG_ONEDRIVE_PATH)) {
    return;
  }
  const dir = resolveKnowledgeDir(envWith({}));
  assert.match(dir, /reference$/);
});

test("resolveKnowledgeDir: empty-string env var counts as 'not set' (falls through to default)", () => {
  // Belt-and-braces: if someone sets WCG_KNOWLEDGE_PATH='', don't accidentally
  // use empty string as the path. Truthy check handles this; verify it stays.
  const dir = resolveKnowledgeDir(envWith({ WCG_KNOWLEDGE_PATH: "" }));
  assert.notEqual(dir, "");
  assert.ok(dir.length > 0);
});
