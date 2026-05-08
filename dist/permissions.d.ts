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
export interface PermissionsConfigUser {
    name?: string;
    pat?: string;
    writeAllow?: string;
    permissions?: Record<string, Record<string, boolean>>;
    notes?: string;
}
export interface PermissionsConfig {
    users: Record<string, PermissionsConfigUser>;
    defaults: PermissionsConfigUser;
    modules?: Array<{
        id: string;
        label: string;
        description?: string;
        actions?: string[];
    }>;
}
/**
 * Load permissions, trying remote → cache → bundled in order. Only throws if
 * even the bundled fallback is missing or malformed (i.e. the install itself
 * is broken).
 */
export declare function loadPermissions(): Promise<PermissionsConfig>;
/**
 * Synchronous fallback used by callers that need permissions before the async
 * loader has resolved (rare; prefer loadPermissions when possible). Reads the
 * local cache if present, otherwise the bundled defaults. Skips the network.
 */
export declare function loadPermissionsSync(): PermissionsConfig | null;
export declare const PERMISSIONS_PATHS: {
    remoteUrl: string;
    cachePath: string;
    bundledPath: string;
};
//# sourceMappingURL=permissions.d.ts.map