#!/usr/bin/env node

/**
 * Quick API connectivity test — run with: npm run test:api
 * Verifies PAT token works and fetches key lookup data.
 */

import { getClient } from "./client.js";
import type { QuoteStatus } from "./types/prospect.js";

async function main() {
  console.log("🔍 Testing Prospect365 OData API connectivity...\n");

  try {
    const client = getClient();
    console.log("✅ Client initialised (PAT token found)\n");

    // Test 1: Fetch quote statuses
    console.log("1. Fetching quote statuses...");
    const statuses = await client.get<QuoteStatus>("QuoteStatus", "$select=QuoteStatusCode,Description,DeadFlag");
    console.log(`   Found ${statuses.value.length} status(es):`);
    for (const s of statuses.value) {
      console.log(`   - ${s.QuoteStatusCode}: ${s.Description}${s.DeadFlag ? " (dead)" : ""}`);
    }

    // Test 2: Fetch latest 3 quotes
    console.log("\n2. Fetching latest 3 quotes...");
    const quotes = await client.get<{ QuoteId: number; Description: string | null; Created: string | null }>(
      "Quotes",
      "$select=QuoteId,Description,Created&$orderby=Created desc&$top=3&$filter=StatusFlag ne 'D'"
    );
    console.log(`   Found ${quotes.value.length} quote(s):`);
    for (const q of quotes.value) {
      console.log(`   - #${q.QuoteId}: ${q.Description || "(no desc)"} — ${q.Created?.substring(0, 10) || "?"}`);
    }

    // Test 3: Count products
    console.log("\n3. Checking product catalogue...");
    const products = await client.get<{ ProductItemId: string }>(
      "ProductItems",
      "$select=ProductItemId&$top=1&$count=true"
    );
    console.log(`   Products accessible: ${products["@odata.count"] ?? products.value.length + "+"}`);

    console.log("\n✅ All tests passed. API connection is working.\n");
  } catch (err) {
    console.error("\n❌ Test failed:", (err as Error).message);
    process.exit(1);
  }
}

main();
