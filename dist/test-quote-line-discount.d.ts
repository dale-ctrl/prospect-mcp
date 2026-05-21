#!/usr/bin/env node
/**
 * Unit tests for the v1.16.0 QuoteLines write-path fix.
 *
 * The WCG Prospect tenant zeroes `DecimalDiscountPercentage` on POST and
 * returns HTTP 500 for PATCH on any `Decimal*` computed field. The fix:
 *
 *   - addQuoteLine: keep `DecimalPrice` / `DecimalCostPrice` in POST body,
 *     drop `DecimalDiscountPercentage`, follow up with a PATCH on raw
 *     `Discount` Int32 (×100) when a non-zero discount was supplied.
 *   - updateQuoteLine: switch all three price/cost/discount writes to the
 *     raw Int backing fields `Price` / `CostPrice` / `Discount` (×100).
 *
 * Empirically confirmed against quote 15521 on 2026-05-21.
 *
 * Run with: npm run test:quote-line-discount
 */
export {};
//# sourceMappingURL=test-quote-line-discount.d.ts.map