/**
 * CRM-UI URL helpers.
 *
 * The OData API returns RecordLink as a path-only string (e.g. `/view/Quote/15512`).
 * Downstream consumers (Claude rendering tool output to the user) need the absolute
 * URL or the link is unclickable / gets guessed wrong (the LLM has historically
 * emitted `app.prospect365.com` which is not the WCG tenant).
 *
 * WCG is a single-tenant install — the CRM UI host is a fixed constant, NOT
 * env-var-driven. This is intentional: any env var here would only ever be set
 * to one value, and unset would silently degrade to a broken link.
 *
 * Note: this is the UI host, distinct from PROSPECT_BASE_URL (the OData API host
 * `api-v1-westeurope.prospect365.com`, defined in client.ts).
 */

export const CRM_UI_BASE_URL = "https://crm.prospect365.com";

/**
 * Format a RecordLink for display. Accepts the raw value from OData (path-only,
 * full URL, or null) and returns either the absolute URL or "N/A".
 *
 * - null/undefined/empty   → "N/A"
 * - already absolute (http) → returned unchanged (defensive — in case the API
 *                              ever switches to full URLs)
 * - relative path           → prefixed with CRM_UI_BASE_URL
 */
export function toCrmLink(recordLink: string | null | undefined): string {
  if (!recordLink) return "N/A";
  if (recordLink.startsWith("http://") || recordLink.startsWith("https://")) {
    return recordLink;
  }
  const sep = recordLink.startsWith("/") ? "" : "/";
  return `${CRM_UI_BASE_URL}${sep}${recordLink}`;
}
