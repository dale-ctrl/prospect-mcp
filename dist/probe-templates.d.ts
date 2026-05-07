#!/usr/bin/env node
/**
 * End-to-end probe for the confirmed quote-email flow:
 *
 *   1. POST /Documents { QuoteId, DocumentTypeCode, EmailSubject, ToAddress, Description }
 *   2. POST /Documents({newId})/SendMessage()   <-- bare form, no "Default." prefix
 *   3. GET  /Documents({newId})?$expand=MailMerge
 *
 * Usage:
 *   PROSPECT_PAT=... npm run probe-templates -- <QuoteId> [TemplateCode]
 *
 * WARNING: fires a REAL email on step 2 success.
 */
export {};
//# sourceMappingURL=probe-templates.d.ts.map