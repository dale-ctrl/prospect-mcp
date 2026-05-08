/**
 * Centralised permissions loader (v1.3.0).
 *
 * Three-layer fallback chain — every layer is independent so that the connector
 * keeps functioning even if the two layers above it are unavailable:
 *
 *   1. Live fetch from GitHub (raw URL) — canonical store, refreshed every
 *      Claude Desktop restart. 5s timeout so a slow network never blocks
 *      MCP startup.
 *   2. Local cache (`~/.prospect-crm/permissions-cache.json`) — last-known-good
 *      copy from the most recent successful remote fetch. Used when offline
 *      or GitHub is unreachable.
 *   3. Bundled defaults (`config/permissions.json` shipped inside the plugin
 *      install) — last-resort backstop for first-run-while-offline.
 *
 * The remote URL is overridable via PROSPECT_PERMISSIONS_URL — useful for
 * forks of the plugin that maintain their own permissions file.
 *
 * Cache writes are atomic (`*.tmp` + rename) so a crash mid-write leaves the
 * previous good cache intact rather than corrupting it.
 *
 * Schema validation: every layer's parsed JSON is checked against a minimal
 * shape (`users` + `defaults`). Malformed input is rejected and we fall
 * through to the next layer rather than serving garbage as live data.
 */
import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";
const __permsFilename = fileURLToPath(import.meta.url);
const __permsDirname = dirname(__permsFilename);
const DEFAULT_PERMISSIONS_URL = "https://raw.githubusercontent.com/dale-ctrl/prospect-mcp/main/config/permissions.json";
const PERMISSIONS_URL = process.env.PROSPECT_PERMISSIONS_URL || DEFAULT_PERMISSIONS_URL;
const CACHE_DIR = join(homedir(), ".prospect-crm");
const CACHE_PATH = join(CACHE_DIR, "permissions-cache.json");
const BUNDLED_PATH = join(__permsDirname, "..", "config", "permissions.json");
const FETCH_TIMEOUT_MS = 5000;
function ts() {
    return new Date().toISOString();
}
function logInfo(msg) {
    console.error(`[${ts()}] permissions: ${msg}`);
}
function logWarn(msg) {
    console.error(`[${ts()}] permissions [WARN]: ${msg}`);
}
/**
 * Validate that a parsed object has the expected top-level shape. Returns
 * the typed config on success, throws on failure. Keep this loose — the
 * full schema is defined by the admin portal and we don't want to reject
 * fields the portal added that this MCP build doesn't know about yet.
 */
function validatePermissionsSchema(parsed) {
    if (!parsed || typeof parsed !== "object") {
        throw new Error("permissions JSON is not an object");
    }
    const obj = parsed;
    if (!obj.users || typeof obj.users !== "object" || Array.isArray(obj.users)) {
        throw new Error("permissions JSON missing 'users' object");
    }
    if (!obj.defaults || typeof obj.defaults !== "object" || Array.isArray(obj.defaults)) {
        throw new Error("permissions JSON missing 'defaults' object");
    }
    return obj;
}
async function fetchWithTimeout(url, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const resp = await fetch(url, {
            signal: controller.signal,
            headers: { Accept: "application/json", "Cache-Control": "no-cache" },
        });
        if (!resp.ok) {
            throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
        }
        return await resp.text();
    }
    finally {
        clearTimeout(timer);
    }
}
function writeCacheAtomically(path, content) {
    const dir = dirname(path);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    const tmp = path + ".tmp";
    writeFileSync(tmp, content, "utf-8");
    renameSync(tmp, path);
}
/**
 * Load permissions, trying remote → cache → bundled in order. Only throws if
 * even the bundled fallback is missing or malformed (i.e. the install itself
 * is broken).
 */
export async function loadPermissions() {
    // Layer 1: live fetch from GitHub (or PROSPECT_PERMISSIONS_URL override).
    try {
        const remote = await fetchWithTimeout(PERMISSIONS_URL, FETCH_TIMEOUT_MS);
        const parsed = validatePermissionsSchema(JSON.parse(remote));
        try {
            writeCacheAtomically(CACHE_PATH, remote);
        }
        catch (cacheErr) {
            logWarn(`remote OK but cache write failed (${cacheErr.message}) — continuing without cache update`);
        }
        logInfo(`loaded from remote ${PERMISSIONS_URL}, cached at ${CACHE_PATH}`);
        return parsed;
    }
    catch (err) {
        logWarn(`remote fetch from ${PERMISSIONS_URL} failed (${err.message}) — falling back to cache`);
    }
    // Layer 2: local cache from a previous successful fetch.
    if (existsSync(CACHE_PATH)) {
        try {
            const cached = readFileSync(CACHE_PATH, "utf-8");
            const parsed = validatePermissionsSchema(JSON.parse(cached));
            logInfo(`loaded from local cache ${CACHE_PATH}`);
            return parsed;
        }
        catch (err) {
            logWarn(`cache at ${CACHE_PATH} unreadable (${err.message}) — falling back to bundled defaults`);
        }
    }
    else {
        logWarn(`no cache at ${CACHE_PATH} — falling back to bundled defaults`);
    }
    // Layer 3: bundled defaults that shipped with the plugin install.
    // Failure here is fatal — it means the install itself is broken.
    const bundled = readFileSync(BUNDLED_PATH, "utf-8");
    const parsed = validatePermissionsSchema(JSON.parse(bundled));
    logWarn(`using bundled defaults at ${BUNDLED_PATH}`);
    return parsed;
}
/**
 * Synchronous fallback used by callers that need permissions before the async
 * loader has resolved (rare; prefer loadPermissions when possible). Reads the
 * local cache if present, otherwise the bundled defaults. Skips the network.
 */
export function loadPermissionsSync() {
    if (existsSync(CACHE_PATH)) {
        try {
            return validatePermissionsSchema(JSON.parse(readFileSync(CACHE_PATH, "utf-8")));
        }
        catch {
            // fall through to bundled
        }
    }
    if (existsSync(BUNDLED_PATH)) {
        try {
            return validatePermissionsSchema(JSON.parse(readFileSync(BUNDLED_PATH, "utf-8")));
        }
        catch {
            return null;
        }
    }
    return null;
}
export const PERMISSIONS_PATHS = {
    remoteUrl: PERMISSIONS_URL,
    cachePath: CACHE_PATH,
    bundledPath: BUNDLED_PATH,
};
//# sourceMappingURL=permissions.js.map