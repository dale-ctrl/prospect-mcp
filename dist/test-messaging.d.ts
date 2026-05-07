#!/usr/bin/env node
/**
 * Unit tests for quote-messaging with a mocked global fetch.
 *
 * Run with: npm run test:messaging
 *
 * These tests do NOT hit the real Prospect API — they assert the 6-step
 * flow (MergeData × 3 → POST /Documents → DocumentAttachments/AttachExistingDocument
 * → SendMessage) is called in order with the right bodies, and that the
 * handler formats the confirmation payload correctly.
 */
export {};
//# sourceMappingURL=test-messaging.d.ts.map