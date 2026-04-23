#!/usr/bin/env bash
# Link a Prospect CRM Quote to an Opportunity (Lead) via OData PATCH.
#
# Usage:
#   PROSPECT_BEARER_TOKEN=<token> ./link-quote-to-lead.sh <quoteId> <leadId>
#
# The FK field on the Quote entity is "LeadId" (Edm.Int32).
# Metadata marks it UpdateVisibility="never", but the API accepts PATCH regardless.

set -euo pipefail

QUOTE_ID="${1:?Usage: $0 <quoteId> <leadId>}"
LEAD_ID="${2:?Usage: $0 <quoteId> <leadId>}"
TOKEN="${PROSPECT_BEARER_TOKEN:?Set PROSPECT_BEARER_TOKEN env var}"
BASE="https://crm-odata-v1.prospect365.com"

echo "--- Before ---"
curl -sf "${BASE}/Quotes(${QUOTE_ID})?\$select=QuoteId,LeadId,Description" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Accept: application/json"
echo

echo "--- PATCH LeadId=${LEAD_ID} ---"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH \
  "${BASE}/Quotes(${QUOTE_ID})" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d "{\"LeadId\": ${LEAD_ID}}")
echo "HTTP ${HTTP_CODE}"
[ "$HTTP_CODE" = "204" ] || { echo "PATCH failed"; exit 1; }

echo "--- After ---"
curl -sf "${BASE}/Quotes(${QUOTE_ID})?\$select=QuoteId,LeadId,Description" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Accept: application/json"
echo
