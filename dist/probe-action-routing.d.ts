#!/usr/bin/env node
/**
 * Routing probe for bound OData action calls.
 *
 * Usage:
 *   PROSPECT_PAT=... npm run probe -- <QuoteId>
 *
 * Hits the same Quote via several URL / body / content-type variants and
 * prints status, response headers (Content-Type, Server), and the first
 * 500 bytes of the response body for each.
 *
 * Fires REAL emails on every SUCCESS — only run against a quote whose
 * primary contact is an address you own.
 *
 * Zero variants succeeding = either (a) quote is in a non-emailable
 * status and Prospect returns HTML-404 for business-rule violations,
 * or (b) our base URL is pointed at the wrong datacentre.
 */
export {};
//# sourceMappingURL=probe-action-routing.d.ts.map