#!/usr/bin/env node
/**
 * Unit tests for loadCredentials() — the env-var-first, config-file-fallback
 * resolution path added in v1.2.0 to support plugin-style installs that
 * don't keep an mcpServers block in claude_desktop_config.json.
 *
 * Run with: npm run test:credentials
 *
 * Each test isolates os.homedir() by overriding HOME and USERPROFILE to a
 * temp directory, and isolates the env vars by saving/restoring on entry.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
// Wipe any inherited env vars before importing client.ts so the import-time
// constructor side-effects don't fire (loadCredentials is not called at
// import; only when getClient() is invoked or tests call it directly).
delete process.env.PROSPECT_PAT;
delete process.env.PROSPECT_BASE_URL;
delete process.env.PROSPECT_PROFILE_ID;
delete process.env.PROSPECT_USER_ID;
delete process.env.PROSPECT_LOCALE;
const { loadCredentials } = await import("./client.js");
const ENV_KEYS = [
    "PROSPECT_PAT",
    "PROSPECT_BASE_URL",
    "PROSPECT_PROFILE_ID",
    "PROSPECT_USER_ID",
    "PROSPECT_LOCALE",
    "HOME",
    "USERPROFILE",
];
function snapshotEnv() {
    const snap = {};
    for (const k of ENV_KEYS)
        snap[k] = process.env[k];
    return snap;
}
function restoreEnv(snap) {
    for (const k of ENV_KEYS) {
        if (snap[k] === undefined)
            delete process.env[k];
        else
            process.env[k] = snap[k];
    }
}
function withTempHome(fn) {
    const snap = snapshotEnv();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "prospect-cred-"));
    // Override both vars; os.homedir() consults whichever is set on each OS.
    process.env.HOME = tmp;
    process.env.USERPROFILE = tmp;
    // Wipe Prospect-specific env vars so each test starts from a clean slate.
    delete process.env.PROSPECT_PAT;
    delete process.env.PROSPECT_BASE_URL;
    delete process.env.PROSPECT_PROFILE_ID;
    delete process.env.PROSPECT_USER_ID;
    delete process.env.PROSPECT_LOCALE;
    try {
        fn(tmp);
    }
    finally {
        restoreEnv(snap);
        fs.rmSync(tmp, { recursive: true, force: true });
    }
}
function writeConfig(homeDir, body) {
    const cfgDir = path.join(homeDir, ".prospect-crm");
    fs.mkdirSync(cfgDir, { recursive: true });
    const cfgFile = path.join(cfgDir, "config.json");
    fs.writeFileSync(cfgFile, typeof body === "string" ? body : JSON.stringify(body));
    return cfgFile;
}
// ─── 1. Env vars set → returns env values ────────────────────────────────────
test("loadCredentials: env vars set returns env values, ignores config file", () => {
    withTempHome((home) => {
        // Even with a different value in the config file, env wins.
        writeConfig(home, {
            PROSPECT_PAT: "from-file-should-be-ignored",
            PROSPECT_BASE_URL: "https://file.example",
            PROSPECT_USER_ID: "FF",
        });
        process.env.PROSPECT_PAT = "from-env";
        process.env.PROSPECT_BASE_URL = "https://env.example";
        process.env.PROSPECT_USER_ID = "EE";
        process.env.PROSPECT_PROFILE_ID = "env-profile";
        process.env.PROSPECT_LOCALE = "en-US";
        const creds = loadCredentials();
        assert.equal(creds.PROSPECT_PAT, "from-env");
        assert.equal(creds.PROSPECT_BASE_URL, "https://env.example");
        assert.equal(creds.PROSPECT_USER_ID, "EE");
        assert.equal(creds.PROSPECT_PROFILE_ID, "env-profile");
        assert.equal(creds.PROSPECT_LOCALE, "en-US");
    });
});
test("loadCredentials: env PAT only, other env unset → fills BASE_URL/LOCALE from defaults, PROFILE/USER stay empty", () => {
    withTempHome(() => {
        process.env.PROSPECT_PAT = "env-pat-only";
        const creds = loadCredentials();
        assert.equal(creds.PROSPECT_PAT, "env-pat-only");
        assert.equal(creds.PROSPECT_BASE_URL, "https://api-v1-westeurope.prospect365.com");
        assert.equal(creds.PROSPECT_LOCALE, "en-GB");
        assert.equal(creds.PROSPECT_PROFILE_ID, "");
        assert.equal(creds.PROSPECT_USER_ID, "");
    });
});
// ─── 2. Env vars unset, config file exists → returns file values ─────────────
test("loadCredentials: env unset, config file present returns file values", () => {
    withTempHome((home) => {
        writeConfig(home, {
            PROSPECT_PAT: "from-file",
            PROSPECT_BASE_URL: "https://file-url.example",
            PROSPECT_USER_ID: "FU",
        });
        const creds = loadCredentials();
        assert.equal(creds.PROSPECT_PAT, "from-file");
        assert.equal(creds.PROSPECT_BASE_URL, "https://file-url.example");
        assert.equal(creds.PROSPECT_USER_ID, "FU");
        // Defaults still applied for keys the file omitted.
        assert.equal(creds.PROSPECT_LOCALE, "en-GB");
        assert.equal(creds.PROSPECT_PROFILE_ID, "");
    });
});
test("loadCredentials: env partial overrides win per-key over file values", () => {
    withTempHome((home) => {
        writeConfig(home, {
            PROSPECT_PAT: "from-file",
            PROSPECT_BASE_URL: "https://file-url.example",
            PROSPECT_USER_ID: "FU",
        });
        // BASE_URL set in env; PAT and USER_ID still come from file because
        // the env-PAT branch isn't taken (env-PAT is what gates the file lookup).
        process.env.PROSPECT_PAT = "from-env";
        process.env.PROSPECT_BASE_URL = "https://env-override.example";
        const creds = loadCredentials();
        assert.equal(creds.PROSPECT_PAT, "from-env");
        assert.equal(creds.PROSPECT_BASE_URL, "https://env-override.example");
        // USER_ID came from neither env nor file (file is skipped because
        // env-PAT is set) — so it's empty. This matches the documented behaviour:
        // env wins, and the config file is only consulted when env-PAT is missing.
        assert.equal(creds.PROSPECT_USER_ID, "");
    });
});
// ─── 3. Env vars unset, no config file → throws actionable error ─────────────
test("loadCredentials: env unset, no config file throws actionable error", () => {
    withTempHome(() => {
        let err = null;
        try {
            loadCredentials();
        }
        catch (e) {
            err = e;
        }
        assert.ok(err, "expected loadCredentials to throw");
        assert.match(err.message, /PROSPECT_PAT not configured/);
        assert.match(err.message, /setup\.cjs/);
        assert.match(err.message, /Mac\/Linux|Windows/);
    });
});
// ─── 4. Env vars unset, malformed config file → throws actionable error ──────
test("loadCredentials: env unset, malformed JSON throws with actionable error", () => {
    withTempHome((home) => {
        writeConfig(home, "{ this is not valid json");
        let err = null;
        try {
            loadCredentials();
        }
        catch (e) {
            err = e;
        }
        assert.ok(err, "expected loadCredentials to throw on malformed JSON");
        assert.match(err.message, /not valid JSON/);
        assert.match(err.message, /setup\.cjs/);
        assert.match(err.message, /\.prospect-crm.*config\.json/);
    });
});
test("loadCredentials: env unset, file exists but missing PROSPECT_PAT throws not-configured error", () => {
    withTempHome((home) => {
        // Valid JSON but no PAT key — should hit the "not configured" branch, not the parse-error branch.
        writeConfig(home, { PROSPECT_BASE_URL: "https://file.example" });
        let err = null;
        try {
            loadCredentials();
        }
        catch (e) {
            err = e;
        }
        assert.ok(err, "expected loadCredentials to throw");
        assert.match(err.message, /PROSPECT_PAT not configured/);
        assert.doesNotMatch(err.message, /not valid JSON/);
    });
});
//# sourceMappingURL=test-credentials.js.map