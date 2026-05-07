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
export {};
//# sourceMappingURL=test-credentials.d.ts.map