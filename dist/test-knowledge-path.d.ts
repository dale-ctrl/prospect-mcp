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
export {};
//# sourceMappingURL=test-knowledge-path.d.ts.map