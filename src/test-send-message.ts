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

import { getClient } from "./client.js";
import { sendQuoteEmail, getMergeOutput } from "./tools/quote-messaging.js";

function usage(msg: string): never {
  console.error(msg);
  console.error("\nUsage: PROSPECT_PAT=... npm run test:send-message -- <QuoteId>");
  process.exit(2);
}

const quoteArg = process.argv[2];
if (!quoteArg) usage("Missing QuoteId argument.");
const quoteId = Number.parseInt(quoteArg, 10);
if (!Number.isFinite(quoteId) || quoteId <= 0) usage(`Invalid QuoteId: ${quoteArg}`);

async function main() {
  const client = getClient();

  console.log(`━━━ Step 1: Read quote ${quoteId} current status ━━━`);
  const quote = await client.getById<{
    QuoteId: number;
    StatusId: number;
    Description: string | null;
    ContactId: number | null;
    Status?: { Description?: string };
  }>(
    "Quotes",
    quoteId,
    "$expand=Status($select=Description)&$select=QuoteId,StatusId,Description,ContactId",
  );
  console.log(`  QuoteId: ${quote.QuoteId}`);
  console.log(`  StatusId: ${quote.StatusId}`);
  console.log(`  Status: ${quote.Status?.Description ?? "(unknown)"}`);
  console.log(`  Description: ${quote.Description ?? "(none)"}`);
  console.log(`  ContactId: ${quote.ContactId ?? "(none)"}\n`);

  console.log(`━━━ Step 2: Call send_quote_email(${quoteId}) ━━━`);
  let sendResponse: string;
  try {
    sendResponse = await sendQuoteEmail({ quoteId });
    console.log(sendResponse);
    console.log();
  } catch (err) {
    const msg = (err as Error).message;
    console.error(`  send_quote_email FAILED: ${msg}`);
    console.error();
    console.error(`  Likely causes (if this is a status-sensitivity issue):`);
    console.error(`    - Quote is in a status that disallows email (e.g. draft/cancelled/expired)`);
    console.error(`    - The tenant has no default email template with AllowAtQuote=1`);
    console.error(`    - Primary contact on this quote has no email address on file`);
    console.error();
    console.error(`  Raw error above should indicate which. Exiting non-zero.`);
    process.exit(1);
  }

  const attachMatch = sendResponse.match(/Attachment DocumentId:\*\*\s*(\d+)/);
  const attachmentDocumentId = attachMatch ? Number(attachMatch[1]) : null;
  if (!attachmentDocumentId) {
    console.log(`  No attachment DocumentId in response — either attachPdf was false or the tool output format changed. Skipping get_merge_output.`);
    console.log(`✅ Smoke test complete (email portion).`);
    return;
  }

  console.log(`━━━ Step 3: Call get_merge_output(${attachmentDocumentId}, saveTo=...) ━━━`);
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const saveTo = `./smoke-test-output/quote-${quoteId}-${ts}.docx`;
  const mergeResponse = await getMergeOutput({ documentId: attachmentDocumentId, saveTo });
  console.log(mergeResponse);
  console.log();

  console.log(`✅ Smoke test complete. Open the file above and confirm the rendered quote line looks right.`);
}

main().catch((err) => {
  console.error(`\n❌ Smoke test failed: ${(err as Error).message}`);
  process.exit(1);
});
