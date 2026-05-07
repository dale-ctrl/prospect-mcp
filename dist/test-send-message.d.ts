#!/usr/bin/env node
/**
 * Live smoke test for send_quote_email + get_merge_output.
 *
 * Usage:
 *   PROSPECT_PAT=... npm run test:send-message -- <QuoteId>
 *
 * WARNING: This FIRES A REAL EMAIL on every invocation. Only run it
 * against a quote whose primary contact is an address you own.
 *
 * The script prints:
 *   1. The quote's current status (so you know whether step 3 sent in
 *      draft or a sendable status).
 *   2. The full send_quote_email response, including the resolved
 *      recipient and MailMergeId.
 *   3. get_merge_output's metadata-only response after writing the PDF
 *      to ./smoke-test-output/quote-<id>-<ts>.pdf for you to open.
 *
 * Non-zero exit on any step failure so CI/CD can gate on it.
 */
export {};
//# sourceMappingURL=test-send-message.d.ts.map