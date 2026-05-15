#!/usr/bin/env node
/**
 * Unit tests for QuoteLineXtra read + write tooling:
 *   - get_xtra_fields(entityType="QuoteLineXtras") lists slots even when no values stored
 *   - update_quote_line_xtra accepts label, identifier, AND raw column name
 *   - update_quote_line_xtra works even when EntityFields returns nothing (hardcoded fallback)
 *   - update_quote_line_xtra upserts via PATCH-then-POST when row missing
 *   - update_quote_line_xtra never touches /QuoteLines (price-recalc guard)
 *
 * Run with: npm run test:quote-line-xtra
 */
export {};
//# sourceMappingURL=test-quote-line-xtra.d.ts.map