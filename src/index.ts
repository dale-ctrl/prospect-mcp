#!/usr/bin/env node

/**
 * ProspectCRM MCP Server
 * 
 * Exposes Prospect365 CRM quote management tools to Claude Desktop / Cowork
 * via the Model Context Protocol (stdio transport).
 *
 * Usage in claude_desktop_config.json:
 * {
 *   "mcpServers": {
 *     "prospect-crm": {
 *       "command": "node",
 *       "args": ["path/to/prospect-mcp/dist/index.js"],
 *       "env": {
 *         "PROSPECT_PAT": "your_token",
 *         "PROSPECT_BASE_URL": "https://crm-odata-v1.prospect365.com"
 *       }
 *     }
 *   }
 * }
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getClient, loadCredentials } from "./client.js";

// Tool schemas and handlers
import {
  searchQuotesSchema, searchQuotes,
  getQuoteSchema, getQuote,
  createQuoteSchema, createQuote,
  updateQuoteSchema, updateQuote,
  duplicateQuoteSchema, duplicateQuote,
  addQuoteLineGroupSchema, addQuoteLineGroup,
  deleteQuoteSchema, deleteQuote,
} from "./tools/quotes.js";

import {
  addQuoteLineSchema, addQuoteLine,
  updateQuoteLineSchema, updateQuoteLine,
  deleteQuoteLineSchema, deleteQuoteLine,
} from "./tools/quote-lines.js";

import {
  searchContactsSchema, searchContacts,
  searchProductsSchema, searchProducts,
  getProductDetailSchema, getProductDetail,
  searchDivisionsSchema, searchDivisions,
  listDivisionsSchema, listDivisions,
  getQuoteStatusesSchema, getQuoteStatuses,
} from "./tools/lookups.js";

import {
  getContactDetailsSchema, getContactDetails,
  getDivisionDetailsSchema, getDivisionDetails,
  getUsersSchema, getUsers,
  searchLeadsSchema, searchLeads,
  getLeadDetailsSchema, getLeadDetails,
} from "./tools/extended.js";

import {
  createDivisionSchema, createDivision,
  createContactSchema, createContact,
  updateContactSchema, updateContact,
  updateDivisionSchema, updateDivision,
  getContactRolesSchema, getContactRoles,
  resolveContactRoleSchema, resolveContactRoleHandler,
  lookupCompanyInfoSchema, lookupCompanyInfo,
} from "./tools/contacts.js";

import {
  listDropdownOptionsSchema, listDropdownOptions,
  deleteDivisionSchema, deleteDivision,
} from "./tools/dropdowns.js";

import {
  getCompanySchema, getCompany,
  updateCompanySchema, updateCompany,
  listCompaniesSchema, listCompanies,
} from "./tools/companies.js";

import {
  inspectDivisionCategorisationPanelSchema, inspectDivisionCategorisationPanel,
} from "./tools/inspect.js";

import {
  updateDivisionVersaMaintenanceSchema, updateDivisionVersaMaintenance,
  mergeDivisionDocumentSchema, mergeDivisionDocument,
} from "./tools/versa-maintenance.js";

import {
  getProductCategoriesSchema, getProductCategories,
  searchProductsByCategorySchema, searchProductsByCategory,
  getContactPreferencesSchema, getContactPreferences,
  getDivisionSalesHistorySchema, getDivisionSalesHistory,
  createInventorySchema, createInventory,
  updateInventorySchema, updateInventory,
  getInventoryLookupsSchema, getInventoryLookups,
} from "./tools/catalogue.js";

import {
  searchOpportunitiesSchema, searchOpportunities,
  getOpportunitySchema, getOpportunity,
  createOpportunitySchema, createOpportunity,
  updateOpportunitySchema, updateOpportunity,
  getLeadLookupsSchema, getLeadLookups,
} from "./tools/opportunities.js";

import {
  reportAccountsWithoutTasksSchema, reportAccountsWithoutTasks,
  searchTasksSchema, searchTasks,
  getTerritoriesSchema, getTerritories,
  reportDivisionSummarySchema, reportDivisionSummary,
  createTaskSchema, createTask,
  updateTaskSchema, updateTask,
  getTaskTypesSchema, getTaskTypes,
} from "./tools/reports.js";

import {
  searchEnquiriesSchema, searchEnquiries,
  getEnquirySchema, getEnquiry,
  createEnquirySchema, createEnquiry,
  updateEnquirySchema, updateEnquiry,
} from "./tools/enquiries.js";

import {
  linkEnquiryToCampaignSchema, linkEnquiryToCampaign,
  unlinkEnquiryFromCampaignSchema, unlinkEnquiryFromCampaign,
  assignEnquirySchema, assignEnquiry,
} from "./tools/campaign-enquiry.js";

import {
  addContactToCampaignSchema, addContactToCampaign,
  removeContactFromCampaignSchema, removeContactFromCampaign,
  listCampaignContactsSchema, listCampaignContacts,
} from "./tools/campaign-contacts.js";

import {
  deleteTaskSchema, deleteTask,
  deleteEnquirySchema, deleteEnquiry,
  deleteActivityNoteSchema, deleteActivityNote,
  deleteContactSchema, deleteContact,
  mergeDivisionSchema, mergeDivision,
  moveContactSchema, moveContact,
  reparentDivisionSchema, reparentDivision,
} from "./tools/cleanup.js";

import {
  updateDivisionAddressSchema, updateDivisionAddress,
} from "./tools/division-address.js";

import {
  searchDocumentsSchema, searchDocuments,
  getDocumentSchema, getDocument,
  getDocumentTypesSchema, getDocumentTypes,
} from "./tools/documents.js";

import {
  searchCampaignsSchema, searchCampaigns,
  getCampaignSchema, getCampaign,
  searchCampaignActivitiesSchema, searchCampaignActivities,
  getCampaignActivityContactsSchema, getCampaignActivityContacts,
  createCampaignSchema, createCampaign,
} from "./tools/campaigns.js";

import {
  searchOrdersSchema, searchOrders,
  getOrderSchema, getOrder,
  reportOrdersByDivisionSchema, reportOrdersByDivision,
} from "./tools/orders.js";

import {
  searchProblemsSchema, searchProblems,
  getProblemSchema, getProblem,
  createProblemSchema, createProblem,
  updateProblemSchema, updateProblem,
  getProblemLookupsSchema, getProblemLookups,
} from "./tools/problems.js";

import {
  searchBookingsSchema, searchBookings,
  getBookingSchema, getBooking,
  createBookingSchema, createBooking,
  updateBookingSchema, updateBooking,
  getBookingLookupsSchema, getBookingLookups,
} from "./tools/bookings.js";

import {
  searchJobsSchema, searchJobs,
  getJobSchema, getJob,
  createJobSchema, createJob,
  updateJobSchema, updateJob,
  getJobLookupsSchema, getJobLookups,
} from "./tools/jobs.js";

import {
  searchInventoriesSchema, searchInventories,
  getInventorySchema, getInventory,
} from "./tools/inventories.js";

import {
  searchContractsSchema, searchContracts,
  getContractSchema, getContract,
  searchContractSchedulesSchema, searchContractSchedules,
  createContractSchema, createContract,
  updateContractSchema, updateContract,
  getContractLookupsSchema, getContractLookups,
} from "./tools/contracts.js";

import {
  searchActivityFeedSchema, searchActivityFeed,
  searchSpokeHistorySchema, searchSpokeHistory,
  searchRecallsSchema, searchRecalls,
} from "./tools/activity.js";

import {
  createActivityNoteSchema, createActivityNote,
  searchActivityNotesSchema, searchActivityNotes,
} from "./tools/notes.js";

import {
  getTagsSchema, getTags,
  searchTagAssignmentsSchema, searchTagAssignments,
} from "./tools/tags.js";

import {
  getPriceBandsSchema, getPriceBands,
  getPriceBandProductPricesSchema, getPriceBandProductPrices,
  searchPriceListSchema, searchPriceList,
  getProductPricingSchema, getProductPricing,
} from "./tools/pricing.js";

import {
  getContactExtrasSchema, getContactExtras,
} from "./tools/contact-extras.js";

import {
  searchAutomationProcessesSchema, searchAutomationProcesses,
  searchAutomationInstancesSchema, searchAutomationInstances,
  searchAutomationSchedulesSchema, searchAutomationSchedules,
  searchWebhooksSchema, searchWebhooks,
  getWebhookMessagesSchema, getWebhookMessages,
  searchImportRunsSchema, searchImportRuns,
  getImportRunErrorsSchema, getImportRunErrors,
} from "./tools/automation.js";

import {
  searchSystemOptionsSchema, searchSystemOptions,
  getEntityFieldsSchema, getEntityFields,
  getEntityLayoutSchema, getEntityLayout,
} from "./tools/system.js";

import {
  searchCalendarEventsSchema, searchCalendarEvents,
  getCalendarEventSchema, getCalendarEvent,
} from "./tools/calendar.js";

import {
  searchSalesInvoicesSchema, searchSalesInvoices,
  getSalesInvoiceSchema, getSalesInvoice,
  searchSalesTransactionsSchema, searchSalesTransactions,
  reportAccountFinancialsSchema, reportAccountFinancials,
} from "./tools/financials.js";

import {
  getDivisionRfmSchema, getDivisionRfm,
  getXtraFieldsSchema, getXtraFields,
  getContactProfilingSchema, getContactProfiling,
} from "./tools/profiling.js";

import {
  saveQuotingLessonSchema, saveQuotingLesson,
  saveProductNoteSchema, saveProductNote,
  getQuotingKnowledgeSchema, getQuotingKnowledge,
  searchQuotingLessonsSchema, searchQuotingLessons,
} from "./tools/knowledge.js";

import {
  sendQuoteEmailSchema, sendQuoteEmail,
  getMergeOutputSchema, getMergeOutput,
  listQuoteTemplatesSchema, listQuoteTemplates,
} from "./tools/quote-messaging.js";

// ─── Server Setup & Permissions ───────────────────────────────

/**
 * Write permissions system.
 *
 * Permissions are loaded by `src/permissions.ts` with a three-layer fallback:
 * remote (raw.githubusercontent.com) → local cache → bundled defaults. This
 * makes the admin portal a global control plane: when the admin saves +
 * pushes a change, every Claude Desktop user picks it up on next restart
 * without reinstalling the plugin.
 *
 * The current user is identified by PROSPECT_USER_ID env var (their CRM user
 * code).
 *
 * Per-user resolution chain inside the loaded snapshot:
 *   1. Central config user entry keyed by PROSPECT_USER_ID
 *   2. Environment variables (PROSPECT_WRITE_ALLOW, PROSPECT_READ_ONLY) — backwards compatible
 *   3. Central config `defaults` block
 *
 * Available modules:
 *   quotes, contacts, opportunities, tasks, problems, jobs,
 *   bookings, contracts, campaigns, enquiries, inventory, knowledge,
 *   messaging
 */

import { loadPermissions, PERMISSIONS_PATHS, type PermissionsConfig } from "./permissions.js";

// ── Hot-reloading permissions snapshot ───────────────────────
//
// The loader (remote → cache → bundled) is invoked once at startup, then
// re-invoked in the background whenever a permission check happens after the
// TTL has elapsed. Tool calls never block on the network — they always read
// the in-memory snapshot. Admin-portal edits propagate to every connected
// user within one Claude Desktop restart (admin pushes to GitHub on save,
// every plugin fetches from GitHub at startup).
//
// If a refresh fails entirely, the previous cached snapshot is kept so
// gating doesn't flap to open/closed on a single bad fetch.

const PERMISSIONS_TTL_MS = 5_000;

type CentralConfig = PermissionsConfig;

let cachedConfig: CentralConfig | null = null;
let cachedConfigLoadedAt = 0;
let refreshInFlight = false;

async function refreshPermissionsSnapshot(): Promise<void> {
  if (refreshInFlight) return;
  refreshInFlight = true;
  try {
    cachedConfig = await loadPermissions();
  } catch (err) {
    console.error(
      `[permissions] refresh failed entirely (${(err as Error).message}) — keeping prior snapshot`,
    );
  } finally {
    cachedConfigLoadedAt = Date.now();
    refreshInFlight = false;
  }
}

function readCentralConfig(): CentralConfig | null {
  const now = Date.now();
  if (cachedConfig && now - cachedConfigLoadedAt < PERMISSIONS_TTL_MS) {
    return cachedConfig;
  }
  // Kick off non-blocking background refresh; return current snapshot meanwhile.
  void refreshPermissionsSnapshot();
  return cachedConfig;
}

// Prime the snapshot at startup so the McpServer description below is built
// against the live permissions, not against nothing. Top-level await blocks
// the module here for at most FETCH_TIMEOUT_MS (5s) on initial load.
await refreshPermissionsSnapshot();
if (cachedConfig) {
  console.error(
    `Loaded permissions: remote=${PERMISSIONS_PATHS.remoteUrl} cache=${PERMISSIONS_PATHS.cachePath}`,
  );
}

// Current user identity — resolved through the same credential loader the
// HTTP client uses (env var first, then ~/.prospect-crm/config.json written
// by setup-user.ps1 / setup.cjs). Reading process.env directly here was a
// bug: plugin installs that wrote the user code into the config file but
// have no env block in claude_desktop_config.json got "" back, fell through
// to defaults.writeAllow="", and saw every write tool blocked as read-only.
const USER_ID = (() => {
  try {
    return (loadCredentials().PROSPECT_USER_ID || "").toUpperCase();
  } catch {
    // loadCredentials throws when PAT is missing entirely. The MCP server
    // can't function without a PAT anyway — fail later in the HTTP client
    // with its actionable error rather than crashing here. Return "" so
    // permission gating treats the user as unknown.
    return "";
  }
})();

function resolveWriteAllow(): string {
  const cfg = readCentralConfig();

  // 1. Check central config for this user
  if (cfg && USER_ID && cfg.users[USER_ID]) {
    return cfg.users[USER_ID].writeAllow || "";
  }

  // 2. Fall back to environment variables (backwards compatible)
  if (process.env.PROSPECT_READ_ONLY === "true" || process.env.PROSPECT_READ_ONLY === "1") {
    return "";
  }
  if (process.env.PROSPECT_WRITE_ALLOW !== undefined) {
    return process.env.PROSPECT_WRITE_ALLOW;
  }

  // 3. Fall back to central config defaults
  if (cfg) {
    return cfg.defaults?.writeAllow || "";
  }

  // 4. No config at all — full access (backwards compatible with no config)
  return "*";
}

function resolveUserPermissions(): Record<string, Record<string, boolean>> {
  const cfg = readCentralConfig();
  if (cfg && USER_ID && cfg.users[USER_ID]) {
    return cfg.users[USER_ID].permissions ?? {};
  }
  return {};
}

// One-time startup log — subsequent changes are logged only when the file
// content actually changes (see readCentralConfig).
{
  const raw = resolveWriteAllow();
  const readOnly = raw === "";
  const allowAll = raw === "*";
  const allowedModules = raw.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  if (USER_ID) {
    console.error(
      `User: ${USER_ID} | Write access: ${
        allowAll ? "FULL" : readOnly ? "NONE (read-only)" : allowedModules.join(", ")
      } | permissions hot-reload TTL ${PERMISSIONS_TTL_MS}ms`,
    );
  }
}

// Warm the API-user-email cache used by send_quote_email's safety gate.
// Best-effort: failure here does not block server startup (other tools still
// work), but send_quote_email itself will refuse and surface the error.
(async () => {
  try {
    const email = await getClient().getApiUserEmail();
    console.error(`send_quote_email safety gate: recipient locked to API user <${email}>.`);
  } catch (err) {
    console.error(
      `send_quote_email safety gate: API user email NOT resolved at boot — ` +
        `sends will refuse until this is fixed. Reason: ${(err as Error).message}`,
    );
  }
})();

// Map each write tool name to its module and action type
const TOOL_PERMISSION_MAP: Record<string, { module: string; action: string }> = {
  create_quote: { module: "quotes", action: "create" },
  update_quote: { module: "quotes", action: "edit" },
  duplicate_quote: { module: "quotes", action: "create" },
  delete_quote: { module: "quotes", action: "delete" },
  add_quote_line: { module: "quotes", action: "create" },
  update_quote_line: { module: "quotes", action: "edit" },
  delete_quote_line: { module: "quotes", action: "delete" },
  add_quote_line_group: { module: "quotes", action: "create" },
  create_contact: { module: "contacts", action: "create" },
  update_contact: { module: "contacts", action: "edit" },
  create_division: { module: "contacts", action: "create" },
  update_division: { module: "contacts", action: "edit" },
  create_opportunity: { module: "opportunities", action: "create" },
  update_opportunity: { module: "opportunities", action: "edit" },
  create_task: { module: "tasks", action: "create" },
  update_task: { module: "tasks", action: "edit" },
  create_problem: { module: "problems", action: "create" },
  update_problem: { module: "problems", action: "edit" },
  create_job: { module: "jobs", action: "create" },
  update_job: { module: "jobs", action: "edit" },
  create_booking: { module: "bookings", action: "create" },
  update_booking: { module: "bookings", action: "edit" },
  create_contract: { module: "contracts", action: "create" },
  update_contract: { module: "contracts", action: "edit" },
  create_campaign: { module: "campaigns", action: "create" },
  add_contact_to_campaign: { module: "campaigns", action: "add_contact" },
  remove_contact_from_campaign: { module: "campaigns", action: "remove_contact" },
  delete_task: { module: "tasks", action: "delete" },
  delete_enquiry: { module: "enquiries", action: "delete" },
  delete_activity_note: { module: "notes", action: "delete" },
  delete_contact: { module: "contacts", action: "delete" },
  merge_division: { module: "divisions", action: "merge" },
  move_contact: { module: "contacts", action: "move" },
  reparent_division: { module: "divisions", action: "reparent" },
  update_division_address: { module: "divisions", action: "update_address" },
  create_enquiry: { module: "enquiries", action: "create" },
  update_enquiry: { module: "enquiries", action: "edit" },
  link_enquiry_to_campaign: { module: "enquiries", action: "link_campaign" },
  unlink_enquiry_from_campaign: { module: "enquiries", action: "link_campaign" },
  assign_enquiry: { module: "enquiries", action: "assign" },
  create_inventory: { module: "inventory", action: "create" },
  update_inventory: { module: "inventory", action: "edit" },
  save_quoting_lesson: { module: "knowledge", action: "create" },
  save_product_note: { module: "knowledge", action: "create" },
  send_quote_email: { module: "messaging", action: "send" },
  create_activity_note: { module: "notes", action: "create" },
};

// Modules whose actions have external, user-visible side effects (e.g. sending
// real email via Prospect's merge-and-send). These must be opted into explicitly
// via granular permissions in permissions.json, even for users whose
// writeAllow is "*". Being an admin doesn't mean "please fire customer email".
const OPT_IN_ONLY_MODULES = new Set(["messaging"]);

function isWriteAllowed(toolName: string): boolean {
  const raw = resolveWriteAllow();
  const readOnly = raw === "";
  const allowAll = raw === "*";
  const allowedModules = new Set(
    raw.split(",").map(s => s.trim().toLowerCase()).filter(Boolean),
  );
  const userPermissions = resolveUserPermissions();

  if (readOnly) return false;

  const mapping = TOOL_PERMISSION_MAP[toolName];
  if (!mapping) return false;

  if (OPT_IN_ONLY_MODULES.has(mapping.module)) {
    return userPermissions[mapping.module]?.[mapping.action] === true;
  }

  if (allowAll) return true;

  // Check granular permissions first (new format)
  if (userPermissions[mapping.module]) {
    return userPermissions[mapping.module][mapping.action] === true;
  }

  // Fall back to module-level check (backwards compatible with writeAllow string)
  return allowedModules.has(mapping.module);
}

// Build a human-readable permissions summary for the server description.
// Evaluated once at startup — not hot-reloaded, since the MCP server description
// is transmitted to clients on connection. Gating itself (isWriteAllowed) is
// always live.
function getPermissionsSummary(): string {
  const raw = resolveWriteAllow();
  if (raw === "") return " (READ-ONLY MODE)";
  if (raw === "*") return "";
  const modules = raw.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  if (modules.length === 0) return " (READ-ONLY MODE)";
  return ` (WRITE ACCESS: ${modules.join(", ")})`;
}

const server = new McpServer({
  name: "prospect-crm",
  version: "2.0.0",
  description: [
    `Prospect365 CRM connector for Westcountry Group${getPermissionsSummary()}.`,
    ``,
    `ALWAYS use this connector for ANY question about CRM data, customers, accounts, contacts, quotes, orders, opportunities, tasks, campaigns, invoices, or sales history.`,
    `NEVER tell the user to look something up in the CRM UI — use these tools instead.`,
    ``,
    `Key capabilities:`,
    `- Quotes: search, create, update, duplicate, add lines, delete (search_quotes, get_quote, create_quote, duplicate_quote, add_quote_line, etc.)`,
    `- Contacts & Companies: search, create, update, get details, additional emails/phones (search_contacts, create_contact, get_contact_details, get_contact_extras)`,
    `- Opportunities/Leads: search, create, update with full lookup codes (search_opportunities, create_opportunity, get_lead_lookups)`,
    `- Tasks: search by type/user/date, create, update. Filter by taskTypeId or taskTypeName (search_tasks, create_task, get_task_types)`,
    `- Orders & Invoices: search orders, invoices, transaction lines, full account financials (search_orders, search_sales_invoices, report_account_financials)`,
    `- Campaigns: search campaigns and activities, list targeted contacts (search_campaigns, get_campaign_activity_contacts)`,
    `- Documents: search emails/files attached to contacts/quotes/leads (search_documents, get_document)`,
    `- Problems/Tickets: search, create, update support cases (search_problems, create_problem)`,
    `- Jobs, Bookings, Inventory, Contracts: full CRUD with lookup tools`,
    `- Calendar Events: search diary entries (search_calendar_events)`,
    `- Activity & History: activity feed, spoke history, recall/follow-up reminders (search_activity_feed, search_spoke_history, search_recalls)`,
    `- Tags: list tags and find tagged records across all entities (get_tags, search_tag_assignments)`,
    `- Pricing: price bands, price lists, full product pricing (get_product_pricing). For supplier / memo / spec fields use get_product_detail.`,
    `- Division analytics: RFM scoring, sales history, profiling (get_division_rfm, get_division_sales_history)`,
    `- Custom fields: Xtra fields on quotes, contacts, divisions, leads, etc. (get_xtra_fields)`,
    `- Reports: cross-module reports like "accounts without tasks for specific users" (report_accounts_without_tasks)`,
    `- System: automation workflows, webhooks, imports, entity fields (search_automation_processes, search_webhooks)`,
    `- Quote Messaging: email a quote using its configured template, retrieve the rendered PDF (send_quote_email, get_merge_output)`,
    ``,
    `User fields (assignedTo, manager, owner, responsibleUser, etc.) accept NAMES — "Miles Liesching", "Miles", or code "ML" all work.`,
    `Territory fields accept names like "WG AREA" and resolve automatically.`,
    ``,
    `LEARNING SYSTEM:`,
    `- Before creating any quote, call get_quoting_knowledge to check for saved lessons and product rules.`,
    `- When a user corrects you about product configs, pricing, or process, call save_quoting_lesson to remember it.`,
    `- When you learn new product details, call save_product_note to save them.`,
    `- These lessons persist across conversations — all users benefit from shared learning.`,
  ].join("\n"),
});

/**
 * Helper to register a write tool with granular permission control.
 * - READ_ONLY=true → all writes blocked
 * - WRITE_ALLOW=* or unset → all writes allowed
 * - WRITE_ALLOW=tasks,quotes → only those modules allowed
 */
function registerWriteTool(
  name: string,
  description: string,
  schema: Record<string, unknown>,
  handler: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }>
) {
  const allowed = isWriteAllowed(name);
  const mapping = TOOL_PERMISSION_MAP[name] || { module: "unknown", action: "write" };
  const taggedDesc = allowed ? description : `[DISABLED — no ${mapping.module} ${mapping.action} permission] ${description}`;

  server.tool(name, taggedDesc, schema, async (args) => {
    if (!isWriteAllowed(name)) {
      const mapping = TOOL_PERMISSION_MAP[name] || { module: "unknown", action: "write" };
      const readOnly = resolveWriteAllow() === "";

      return {
        content: [{ type: "text" as const, text: [
          `Permission denied: **${mapping.action}** on **${mapping.module}** module.`,
          ``,
          readOnly
            ? `This connector is in READ-ONLY mode. All writes are disabled.`
            : `This user does not have ${mapping.action} permission for ${mapping.module}.`,
          ``,
          `Contact your administrator to update permissions in the Admin Portal.`,
        ].join("\n") }],
        isError: true,
      };
    }
    return handler(args);
  });
}

// ─── Quote Tools ───────────────────────────────────────────────

server.tool(
  "search_quotes",
  "Search for quotes in Prospect CRM. Filter by description, contact name, company, salesperson, status, or date range. Returns a summary list with values and statuses.",
  searchQuotesSchema.shape,
  async (args) => {
    try {
      const result = await searchQuotes(searchQuotesSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "get_quote",
  "Get full details of a quote including all line items, contact, company, status, totals, and margin. Use this to review a quote before making changes.",
  getQuoteSchema.shape,
  async (args) => {
    try {
      const result = await getQuote(getQuoteSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

registerWriteTool(
  "create_quote",
  "Create a new quote in Prospect CRM. Requires a ContactId (use search_contacts to find one). Returns the new QuoteId. After creating, use add_quote_line to add items.",
  createQuoteSchema.shape,
  async (args) => {
    try {
      const result = await createQuote(createQuoteSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

registerWriteTool(
  "update_quote",
  "Update fields on an existing quote header. Provide the QuoteId and any fields to change (description, salesperson, due date, delivery address, memo, discount, etc).",
  updateQuoteSchema.shape,
  async (args) => {
    try {
      const result = await updateQuote(updateQuoteSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

registerWriteTool(
  "duplicate_quote",
  "Duplicate an existing quote — copies the header and all line items to a new quote. Optionally change the description, contact, or salesperson on the copy.",
  duplicateQuoteSchema.shape,
  async (args) => {
    try {
      const result = await duplicateQuote(duplicateQuoteSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

registerWriteTool(
  "add_quote_line_group",
  "Add a section/group to a quote. Lines can then be assigned to this group. Groups show as separate sections with optional subtotals on printed quotes.",
  addQuoteLineGroupSchema.shape,
  async (args) => {
    try {
      const result = await addQuoteLineGroup(addQuoteLineGroupSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

registerWriteTool(
  "delete_quote",
  "Delete a quote permanently. This removes the quote header and all its lines. Use with caution.",
  deleteQuoteSchema.shape,
  async (args) => {
    try {
      const result = await deleteQuote(deleteQuoteSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── Quote Line Tools ──────────────────────────────────────────

registerWriteTool(
  "add_quote_line",
  "Add a line item to an existing quote. Provide the QuoteId, a description (required), and optionally a product code, quantity, price, cost, discount, and tax code.",
  addQuoteLineSchema.shape,
  async (args) => {
    try {
      const result = await addQuoteLine(addQuoteLineSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

registerWriteTool(
  "update_quote_line",
  "Update an existing line item on a quote. Provide the LineId and any fields to change (description, quantity, price, cost, discount, tax code, sequence).",
  updateQuoteLineSchema.shape,
  async (args) => {
    try {
      const result = await updateQuoteLine(updateQuoteLineSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

registerWriteTool(
  "delete_quote_line",
  "Remove a line item from a quote. This is permanent. Provide the LineId (visible in get_quote output).",
  deleteQuoteLineSchema.shape,
  async (args) => {
    try {
      const result = await deleteQuoteLine(deleteQuoteLineSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── Lookup Tools ──────────────────────────────────────────────

server.tool(
  "search_contacts",
  "Search for contacts in Prospect CRM by name, email, or phone. Returns ContactId (needed for create_quote), company name, job title, and contact details.",
  searchContactsSchema.shape,
  async (args) => {
    try {
      const result = await searchContacts(searchContactsSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "search_products",
  "Search the product catalogue in Prospect CRM by SKU code or description. Returns product codes, sell prices, cost prices, and stock levels.",
  searchProductsSchema.shape,
  async (args) => {
    try {
      const result = await searchProducts(searchProductsSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "search_divisions",
  "Search for companies/divisions (accounts) in Prospect CRM by name or account code. Optionally narrow by structured filters (customerType, relationship, territoryCode, accountManager, postcode prefix). Returns DivisionId, account manager, territory, and address. For bulk dedupe/reporting use list_divisions instead.",
  searchDivisionsSchema.shape,
  async (args) => {
    try {
      const result = await searchDivisions(searchDivisionsSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "list_divisions",
  "Bulk-list Divisions for dedupe/reporting work. Filter by customerType, relationship, territoryCode, accountManager, or postcode prefix. Auto-paginates up to 5000 records when skip is omitted; pass skip+pageSize for manual paging. Returns terse JSON: { totalCount, returnedCount, truncated, skip, pageSize, records }.",
  listDivisionsSchema.shape,
  async (args) => {
    try {
      const result = await listDivisions(listDivisionsSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "list_dropdown_options",
  "List the option rows behind a named dropdown. Use this to discover the FK code for a UI label (e.g. customerType='M.A.T.' → 'Entity.DivisionXtra.StandardDropdownField2.04a2188e'). Supports custom DivisionXtra dropdowns (customerType, paperAccountManager, officeAllocated, colouredPaperPriceList, laminatingPouchesList, customDropdown1..5) and built-in Division FKs (standardIndustryCode, deliveryZoneCode, priorityId, turnoverId). Returns { field, count, options: [{code, label}] }.",
  listDropdownOptionsSchema.shape,
  async (args) => {
    try {
      const result = await listDropdownOptions(listDropdownOptionsSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "delete_division",
  "Delete a Division and its linked rows (DivisionXtra, contacts, quotes). DESTRUCTIVE — requires confirmed=true as a guardrail. Returns { ok, divisionId, deletedAt }.",
  deleteDivisionSchema.shape,
  async (args) => {
    try {
      const result = await deleteDivision(deleteDivisionSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "get_company",
  "Fetch a Company record (parent of Division) including the Group Type. Returns the raw Company JSON with the Type navigation expanded.",
  getCompanySchema.shape,
  async (args) => {
    try {
      const result = await getCompany(getCompanySchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "update_company",
  "Patch fields on a Company record (parent of Division). Supports companyGroupType (label or FK), name, source (free-text), alternateReference, longDescription.",
  updateCompanySchema.shape,
  async (args) => {
    try {
      const result = await updateCompany(updateCompanySchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "list_companies",
  "Bulk-list Companies. Filter by name (contains) or companyGroupType (FK or label). Auto-paginates up to 5000 records.",
  listCompaniesSchema.shape,
  async (args) => {
    try {
      const result = await listCompanies(listCompaniesSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "inspect_division_categorisation_panel",
  "Diagnostic: dump every populated field on a Division, its DivisionXtra, the parent Company, and CompanyXtra. Use to identify which DB columns back UI labels (e.g. AREA LOCATION, SCHOOL STATUS) when the dictionary mapping isn't exposed via OData metadata. Run on a record that has the labels visibly populated in Prospect's UI.",
  inspectDivisionCategorisationPanelSchema.shape,
  async (args) => {
    try {
      const result = await inspectDivisionCategorisationPanel(
        inspectDivisionCategorisationPanelSchema.parse(args),
      );
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "update_division_versa_maintenance",
  "Patch the Versa Maintenance custom fields on a Division: 'Quantity and Equipment Maintained' (DivisionXtra.StandardTextField5) and 'Total Maintenance Value' (DivisionXtra.StandardTextField6). Numbers passed as totalMaintenanceValue are formatted to 2dp. Upserts the DivisionXtra row if it doesn't exist.",
  updateDivisionVersaMaintenanceSchema.shape,
  async (args) => {
    try {
      const result = await updateDivisionVersaMaintenance(args);
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "merge_division_document",
  "Render and send a Division-level document (e.g. Versa Maintenance Contract template '23caad'). Mirrors send_quote_email's flow but bound to /Divisions instead of /Quotes — uses Division.MergeData + Division.SendMessage actions. SAFETY GATE: every email is forced to the API user's address; the document is always attached to the Division regardless. Returns attachmentDocumentId for use with get_merge_output.",
  mergeDivisionDocumentSchema.shape,
  async (args) => {
    try {
      const result = await mergeDivisionDocument(args);
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "get_quote_statuses",
  "List all available quote statuses in Prospect CRM. Shows status codes and descriptions (e.g. Quote, Order, Cancelled).",
  getQuoteStatusesSchema.shape,
  async () => {
    try {
      const result = await getQuoteStatuses();
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── Extended Lookup Tools ─────────────────────────────────────

server.tool(
  "get_contact_details",
  "Get full contact details including Division, AddressId, account code, and full address. Use this before creating a quote or opportunity to confirm the ContactId / DivisionId / AddressId.",
  getContactDetailsSchema.shape,
  async (args) => {
    try {
      const result = await getContactDetails(getContactDetailsSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "get_division_details",
  "Get full division (company/account) details including address, account manager, and top 10 contacts.",
  getDivisionDetailsSchema.shape,
  async (args) => {
    try {
      const result = await getDivisionDetails(getDivisionDetailsSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "get_users",
  "List CRM users (salespeople). Returns UserCode values needed for SalesPersonId / OwnerId.",
  getUsersSchema.shape,
  async (args) => {
    try {
      const result = await getUsers(getUsersSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "search_leads",
  "Search Leads (opportunities) — lightweight variant. Returns summary lines with contact, company, status, owner, confidence.",
  searchLeadsSchema.shape,
  async (args) => {
    try {
      const result = await searchLeads(searchLeadsSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "get_lead_details",
  "Get full Lead/opportunity details including contact, company address, and the 10 most recent linked quotes.",
  getLeadDetailsSchema.shape,
  async (args) => {
    try {
      const result = await getLeadDetails(getLeadDetailsSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── Opportunity (Lead) Tools ──────────────────────────────────

server.tool(
  "search_opportunities",
  "Search for opportunities (Leads) in Prospect CRM. Filter by description, contact, company, salesperson, status, pipeline, or date range. Excludes closed by default.",
  searchOpportunitiesSchema.shape,
  async (args) => {
    try {
      const result = await searchOpportunities(searchOpportunitiesSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "get_opportunity",
  "Get full detail of an opportunity (Lead) by LeadId, including status, pipeline, value, weighted projections, dates, and situation summary.",
  getOpportunitySchema.shape,
  async (args) => {
    try {
      const result = await getOpportunity(getOpportunitySchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

registerWriteTool(
  "create_opportunity",
  "Create a new opportunity (Lead) in Prospect CRM. Requires ContactId, SizeId, and StatusId. DivisionId and AddressId auto-derive from the Contact. Use get_lead_lookups to discover valid codes.",
  createOpportunitySchema.shape,
  async (args) => {
    try {
      const result = await createOpportunity(createOpportunitySchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

registerWriteTool(
  "update_opportunity",
  "Update fields on an existing opportunity (Lead). Provide the LeadId and any fields to change (status, pipeline, value, estimatedClose, description, salesperson, etc).",
  updateOpportunitySchema.shape,
  async (args) => {
    try {
      const result = await updateOpportunity(updateOpportunitySchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "get_lead_lookups",
  "List available Lead lookup codes (statuses, sizes, sources, types, pipelines). Use these codes when creating or updating an opportunity. Pass kind='all' (default) or a specific table.",
  getLeadLookupsSchema.shape,
  async (args) => {
    try {
      const result = await getLeadLookups(getLeadLookupsSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── Contact & Division Tools ─────────────────────────────────

registerWriteTool(
  "create_division",
  "Create a new company/division in Prospect CRM. Use this when adding a contact for a company that doesn't exist yet. Returns the DivisionId needed for create_contact. Optionally include address.",
  createDivisionSchema.shape,
  async (args) => {
    try {
      const result = await createDivision(createDivisionSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

registerWriteTool(
  "create_contact",
  "Create a new contact (person) in Prospect CRM under an existing division/company. Requires DivisionId — use search_divisions to find or create_division to create. Use get_contact_roles to list valid role codes.",
  createContactSchema.shape,
  async (args) => {
    try {
      const result = await createContact(createContactSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

registerWriteTool(
  "update_contact",
  "Update an existing contact's details (name, email, phone, job title, etc). Provide ContactId and the fields to change.",
  updateContactSchema.shape,
  async (args) => {
    try {
      const result = await updateContact(updateContactSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "get_contact_roles",
  "List available contact role codes in Prospect CRM. Use these when creating a contact — the role describes their function (e.g. Head/Principal, Procurement, Estates).",
  getContactRolesSchema.shape,
  async () => {
    try {
      const result = await getContactRoles();
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "resolve_contact_role",
  "Preview the WCG Job Title → Contact Role mapping for a given jobTitle (and optionally jobFunction) WITHOUT writing anything. Useful for dry-running a bulk lead-load mapping plan before firing creates, or for wash-up reporting. Returns the role code, label, and the matched-rule diagnostic string.",
  resolveContactRoleSchema.shape,
  async (args) => {
    try {
      const result = await resolveContactRoleHandler(resolveContactRoleSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "lookup_company_info",
  "Look up publicly available information about a company before adding them to Prospect CRM. Returns guidance on what to search for — use your web search capability to find company details, then create_division and create_contact with the results.",
  lookupCompanyInfoSchema.shape,
  async (args) => {
    try {
      const result = await lookupCompanyInfo(lookupCompanyInfoSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── Reports & Cross-Module Tools ─────────────────────────────

server.tool(
  "report_accounts_without_tasks",
  "Cross-module report: find accounts (divisions) in a territory with a minimum employee/pupil count that have NO open task assigned to specific users. Fetches all matching divisions and all tasks for the specified users, then cross-references to find gaps. Use get_users to find user codes and get_territories to find territory names.",
  reportAccountsWithoutTasksSchema.shape,
  async (args) => {
    try {
      const result = await reportAccountsWithoutTasks(reportAccountsWithoutTasksSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "search_tasks",
  "Search tasks in Prospect CRM. Filter by division, contact, opportunity, assigned user, date range, or open/closed status. Returns task details with assigned user and linked entities.",
  searchTasksSchema.shape,
  async (args) => {
    try {
      const result = await searchTasks(searchTasksSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "get_territories",
  "List all sales territories in Prospect CRM. Use territory names with report tools.",
  getTerritoriesSchema.shape,
  async (args) => {
    try {
      const result = await getTerritories(getTerritoriesSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "report_division_summary",
  "Filtered list of accounts/divisions with employee counts, account managers, and contact details. Filter by territory, employee range, relationship type, or website presence.",
  reportDivisionSummarySchema.shape,
  async (args) => {
    try {
      const result = await reportDivisionSummary(reportDivisionSummarySchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── Enquiry Tools ────────────────────────────────────────────

server.tool(
  "search_enquiries",
  "Search inbound enquiries in Prospect CRM. Filter by name, company, email, source, date range, or conversion status.",
  searchEnquiriesSchema.shape,
  async (args) => {
    try {
      const result = await searchEnquiries(searchEnquiriesSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "get_enquiry",
  "Get full details of an enquiry including source, UTM tracking, conversion status, and linked contact/division/lead.",
  getEnquirySchema.shape,
  async (args) => {
    try {
      const result = await getEnquiry(getEnquirySchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── Document Tools ───────────────────────────────────────────

server.tool(
  "search_documents",
  "Search documents (emails, letters, notes, files) in Prospect CRM. Filter by division, contact, quote, lead, description, email subject, or date range.",
  searchDocumentsSchema.shape,
  async (args) => {
    try {
      const result = await searchDocuments(searchDocumentsSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "get_document",
  "Get full details of a document including email headers, linked records (contact, quote, lead), and file information.",
  getDocumentSchema.shape,
  async (args) => {
    try {
      const result = await getDocument(getDocumentSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "get_document_types",
  "List available document types/templates in Prospect CRM.",
  getDocumentTypesSchema.shape,
  async () => {
    try {
      const result = await getDocumentTypes();
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── Campaign Tools ───────────────────────────────────────────

server.tool(
  "search_campaigns",
  "Search marketing campaigns in Prospect CRM. Filter by description or date range.",
  searchCampaignsSchema.shape,
  async (args) => {
    try {
      const result = await searchCampaigns(searchCampaignsSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "get_campaign",
  "Get full campaign details including all activities, dates, budget, and manager.",
  getCampaignSchema.shape,
  async (args) => {
    try {
      const result = await getCampaign(getCampaignSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "search_campaign_activities",
  "Search campaign activities. Filter by parent campaign, description, or date range. Activities are the individual actions within a campaign.",
  searchCampaignActivitiesSchema.shape,
  async (args) => {
    try {
      const result = await searchCampaignActivities(searchCampaignActivitiesSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "get_campaign_activity_contacts",
  "List contacts targeted by a specific campaign activity, including their response status.",
  getCampaignActivityContactsSchema.shape,
  async (args) => {
    try {
      const result = await getCampaignActivityContacts(getCampaignActivityContactsSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "list_campaign_contacts",
  "List the target-contact roster for a campaign activity. New in v1.5 — returns the actual CampaignActivityContacts join rows with full contact + division detail. Prefer this over get_campaign_activity_contacts (which selects fields the entity doesn't actually have).",
  listCampaignContactsSchema.shape,
  async (args) => {
    try {
      const result = await listCampaignContacts(listCampaignContactsSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

registerWriteTool(
  "add_contact_to_campaign",
  "Add an existing contact onto a campaign activity's target-contact roster. Idempotent — already-rostered contacts return a 'no change' message rather than a duplicate-key error. Optional `comments` field tags the source of the import (visible in the Prospect UI roster).",
  addContactToCampaignSchema.shape,
  async (args) => {
    try {
      const result = await addContactToCampaign(addContactToCampaignSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  },
);

registerWriteTool(
  "remove_contact_from_campaign",
  "Remove a contact from a campaign activity's target-contact roster. Idempotent — not-on-roster contacts return a 'no change' message rather than a 404.",
  removeContactFromCampaignSchema.shape,
  async (args) => {
    try {
      const result = await removeContactFromCampaign(removeContactFromCampaignSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  },
);

// ─── Order Tools ──────────────────────────────────────────────

server.tool(
  "search_orders",
  "Search sales orders in Prospect CRM. Filter by order number, customer reference, company, salesperson (name or code), linked quote, status, date range, or minimum value.",
  searchOrdersSchema.shape,
  async (args) => {
    try {
      const result = await searchOrders(searchOrdersSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "get_order",
  "Get full details of a sales order by order number. Shows values, delivery address, linked quote, salesperson, and tracking references.",
  getOrderSchema.shape,
  async (args) => {
    try {
      const result = await getOrder(getOrderSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "report_orders_by_division",
  "Get the full order history for a company/division. Shows all orders with running total. Use with get_division_details to identify the division first.",
  reportOrdersByDivisionSchema.shape,
  async (args) => {
    try {
      const result = await reportOrdersByDivision(reportOrdersByDivisionSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── Problem/Ticket Tools ─────────────────────────────────────

server.tool(
  "search_problems",
  "Search support problems/tickets in Prospect CRM. Filter by company, contact, responsible user (name or code), priority, date range. Accepts user names — 'Miles' resolves to ML automatically.",
  searchProblemsSchema.shape,
  async (args) => {
    try {
      const result = await searchProblems(searchProblemsSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "get_problem",
  "Get full details of a support problem/ticket including contact, company, responsible user, status, priority, and situation summary.",
  getProblemSchema.shape,
  async (args) => {
    try {
      const result = await getProblem(getProblemSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── Booking Tools ────────────────────────────────────────────

server.tool(
  "search_bookings",
  "Search resource bookings in Prospect CRM. Filter by description, user (name or code), or date range.",
  searchBookingsSchema.shape,
  async (args) => {
    try {
      const result = await searchBookings(searchBookingsSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "get_booking",
  "Get full booking details including linked records (contacts, divisions, leads), type, status, and notes.",
  getBookingSchema.shape,
  async (args) => {
    try {
      const result = await getBooking(getBookingSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── Job Tools ────────────────────────────────────────────────

server.tool(
  "search_jobs",
  "Search jobs (service delivery/projects) in Prospect CRM. Filter by company, contact, manager (name or code), customer reference, date range. Jobs link to quotes, leads, and problems.",
  searchJobsSchema.shape,
  async (args) => {
    try {
      const result = await searchJobs(searchJobsSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "get_job",
  "Get full job details including company, contact, manager, dates, and linked quotes/leads/problems.",
  getJobSchema.shape,
  async (args) => {
    try {
      const result = await getJob(getJobSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── Inventory Tools ──────────────────────────────────────────

server.tool(
  "search_inventories",
  "Search inventory items (assets/equipment) in Prospect CRM. Filter by description, serial number, company, product code, or date range.",
  searchInventoriesSchema.shape,
  async (args) => {
    try {
      const result = await searchInventories(searchInventoriesSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "get_inventory",
  "Get full inventory item details including serial number, location, warranty, manufacturer info, and linked contract/document references.",
  getInventorySchema.shape,
  async (args) => {
    try {
      const result = await getInventory(getInventorySchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── Contract Tools ───────────────────────────────────────────

server.tool(
  "search_contracts",
  "Search contracts in Prospect CRM. Filter by company, description, reference. Shows contract schedules (active periods) inline.",
  searchContractsSchema.shape,
  async (args) => {
    try {
      const result = await searchContracts(searchContractsSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "get_contract",
  "Get full contract details including all schedules (periods/terms), type, company, and notes.",
  getContractSchema.shape,
  async (args) => {
    try {
      const result = await getContract(getContractSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "search_contract_schedules",
  "Search contract schedules (periods/terms). Filter by contract, company, current status, or expiry date — useful for finding contracts due for renewal.",
  searchContractSchedulesSchema.shape,
  async (args) => {
    try {
      const result = await searchContractSchedules(searchContractSchedulesSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── Activity & History Tools ─────────────────────────────────

server.tool(
  "search_activity_feed",
  "Search the CRM activity feed — a timeline of all actions taken by users. Filter by division, contact, lead, user (name or code), or date range. Shows who did what and when.",
  searchActivityFeedSchema.shape,
  async (args) => {
    try {
      const result = await searchActivityFeed(searchActivityFeedSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "search_spoke_history",
  "Search communication history (spoke records) — who spoke to which contact/lead, when, and for how long. Filter by contact, division, lead, user, or date range.",
  searchSpokeHistorySchema.shape,
  async (args) => {
    try {
      const result = await searchSpokeHistory(searchSpokeHistorySchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "search_recalls",
  "Search recall/follow-up reminders for contacts or leads. Filter by user, date range, or find overdue recalls. Useful for checking who needs follow-up.",
  searchRecallsSchema.shape,
  async (args) => {
    try {
      const result = await searchRecalls(searchRecallsSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── Activity Notes (Notepad) Tools ───────────────────────────

server.tool(
  "search_activity_notes",
  "Search activity-feed notes (Notepads) attached to divisions, contacts, leads, enquiries, or quotes. Filter by division, contact, enquiry, object type/id, author, pinned-only, or date range. Use this before adding a new note to avoid duplicates.",
  searchActivityNotesSchema.shape,
  async (args) => {
    try {
      const result = await searchActivityNotes(searchActivityNotesSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

registerWriteTool(
  "create_activity_note",
  "Create an activity-feed note (Notepad) on a division, contact, lead, enquiry, or quote. Provide objectType + objectId + text. Parent FKs (DivisionId, ContactId, EnquiryId) are resolved automatically so the note appears at the right level of the activity feed. Optional: pinned, tags, recallUser+recallDateTime for follow-up reminders.",
  createActivityNoteSchema.shape,
  async (args) => {
    try {
      const result = await createActivityNote(createActivityNoteSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  },
);

// ─── Tag Tools ────────────────────────────────────────────────

server.tool(
  "get_tags",
  "List all CRM tags. Tags can be applied to contacts, divisions, leads, quotes, campaigns, products, and more.",
  getTagsSchema.shape,
  async (args) => {
    try {
      const result = await getTags(getTagsSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "search_tag_assignments",
  "Find which records have a specific tag, or what tags a record has. Filter by tag name, contact, division, lead, quote, or product.",
  searchTagAssignmentsSchema.shape,
  async (args) => {
    try {
      const result = await searchTagAssignments(searchTagAssignmentsSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── Pricing Tools ────────────────────────────────────────────

server.tool(
  "get_price_bands",
  "List all price bands (pricing tiers) in Prospect CRM.",
  getPriceBandsSchema.shape,
  async (args) => {
    try {
      const result = await getPriceBands(getPriceBandsSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "get_price_band_product_prices",
  "Get product prices within a specific price band. Shows sell price, cost price, and margin for each product.",
  getPriceBandProductPricesSchema.shape,
  async (args) => {
    try {
      const result = await getPriceBandProductPrices(getPriceBandProductPricesSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "search_price_list",
  "Search price list entries by product code or list code. Shows prices from configured price lists.",
  searchPriceListSchema.shape,
  async (args) => {
    try {
      const result = await searchPriceList(searchPriceListSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "get_product_pricing",
  "Get ALL pricing for a product in one call — catalogue price, price band prices, and price list entries. The complete pricing picture.",
  getProductPricingSchema.shape,
  async (args) => {
    try {
      const result = await getProductPricing(getProductPricingSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "get_product_detail",
  "Get the full ProductItem record for one SKU — pricing, supplier, references, and the long-form notes (ExtendedDescription, InternalNotes, Specification). Use this when search_products or get_product_pricing don't give you the field you need.",
  getProductDetailSchema.shape,
  async (args) => {
    try {
      const result = await getProductDetail(getProductDetailSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── Contact Extras Tool ──────────────────────────────────────

server.tool(
  "get_contact_extras",
  "Get additional email addresses and phone numbers for a contact — beyond their primary email/phone stored on the main contact record.",
  getContactExtrasSchema.shape,
  async (args) => {
    try {
      const result = await getContactExtras(getContactExtrasSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── Automation Tools ─────────────────────────────────────────

server.tool(
  "search_automation_processes",
  "List automation workflow processes in Prospect CRM. Shows enabled/disabled status, published version, and type.",
  searchAutomationProcessesSchema.shape,
  async (args) => {
    try {
      const result = await searchAutomationProcesses(searchAutomationProcessesSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "search_automation_instances",
  "Search automation workflow runs/instances. Filter by process, state (Running/Completed/Failed), linked lead/quote, or date range. Shows execution history and failures.",
  searchAutomationInstancesSchema.shape,
  async (args) => {
    try {
      const result = await searchAutomationInstances(searchAutomationInstancesSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "search_automation_schedules",
  "List automation schedules — shows when workflows run, which days, time windows, and intervals.",
  searchAutomationSchedulesSchema.shape,
  async (args) => {
    try {
      const result = await searchAutomationSchedules(searchAutomationSchedulesSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "search_webhooks",
  "List webhooks configured in Prospect CRM. Filter by entity type. Shows webhook URLs, actions, and error contacts.",
  searchWebhooksSchema.shape,
  async (args) => {
    try {
      const result = await searchWebhooks(searchWebhooksSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "get_webhook_messages",
  "Get recent messages/logs for a specific webhook — shows delivery status, errors, and payloads.",
  getWebhookMessagesSchema.shape,
  async (args) => {
    try {
      const result = await getWebhookMessages(getWebhookMessagesSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "search_import_runs",
  "List data import runs. Shows import status, template used, and timestamp. Use get_import_run_errors for details on failed rows.",
  searchImportRunsSchema.shape,
  async (args) => {
    try {
      const result = await searchImportRuns(searchImportRunsSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "get_import_run_errors",
  "Get error details for a specific import run — shows which rows failed and why.",
  getImportRunErrorsSchema.shape,
  async (args) => {
    try {
      const result = await getImportRunErrors(getImportRunErrorsSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── System & Config Tools ────────────────────────────────────

server.tool(
  "search_system_options",
  "Search CRM system configuration options. Shows option names, values, and descriptions. Useful for understanding how the CRM is configured.",
  searchSystemOptionsSchema.shape,
  async (args) => {
    try {
      const result = await searchSystemOptions(searchSystemOptionsSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "get_entity_fields",
  "List all fields (custom and system) defined for a CRM entity. Shows field names, column names, and whether they're visible in the API. Essential for understanding what data is available.",
  getEntityFieldsSchema.shape,
  async (args) => {
    try {
      const result = await getEntityFields(getEntityFieldsSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "get_entity_layout",
  "Get the UI layout definition for a CRM entity — shows how fields are arranged in the Prospect UI.",
  getEntityLayoutSchema.shape,
  async (args) => {
    try {
      const result = await getEntityLayout(getEntityLayoutSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── Gap Fix: Task Create/Update ──────────────────────────────

registerWriteTool("create_task", "Create a new task in Prospect CRM. Requires name, task type, date, and assigned user (accepts names). Use get_task_types to list types.", createTaskSchema.shape,
  async (args) => { try { const result = await createTask(createTaskSchema.parse(args)); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

registerWriteTool("update_task", "Update an existing task — change name, description, date, status, priority, or close it.", updateTaskSchema.shape,
  async (args) => { try { const result = await updateTask(updateTaskSchema.parse(args)); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

server.tool("get_task_types", "List available task type codes in Prospect CRM.", getTaskTypesSchema.shape,
  async () => { try { const result = await getTaskTypes(); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

// ─── Gap Fix: Problem Create/Update ──────────────────────────

registerWriteTool("create_problem", "Create a support problem/ticket. Requires contactId, description, owner, responsible user (names accepted), type, and status. Use get_problem_lookups for codes.", createProblemSchema.shape,
  async (args) => { try { const result = await createProblem(createProblemSchema.parse(args)); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

registerWriteTool("update_problem", "Update a support problem/ticket — change description, status, priority, responsible user, etc.", updateProblemSchema.shape,
  async (args) => { try { const result = await updateProblem(updateProblemSchema.parse(args)); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

server.tool("get_problem_lookups", "List available problem types and statuses.", getProblemLookupsSchema.shape,
  async () => { try { const result = await getProblemLookups(); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

// ─── Gap Fix: Job Create/Update ──────────────────────────────

registerWriteTool("create_job", "Create a job (project/service delivery). Requires divisionId, description, type, status. Can link to quotes, leads, problems. Manager accepts names.", createJobSchema.shape,
  async (args) => { try { const result = await createJob(createJobSchema.parse(args)); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

registerWriteTool("update_job", "Update a job — change description, status, dates, manager, or linked records.", updateJobSchema.shape,
  async (args) => { try { const result = await updateJob(updateJobSchema.parse(args)); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

server.tool("get_job_lookups", "List available job types and statuses.", getJobLookupsSchema.shape,
  async () => { try { const result = await getJobLookups(); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

// ─── Gap Fix: Booking Create/Update ──────────────────────────

registerWriteTool("create_booking", "Create a resource booking. Requires description, user (name accepted), type, status. Optionally set start/end times.", createBookingSchema.shape,
  async (args) => { try { const result = await createBooking(createBookingSchema.parse(args)); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

registerWriteTool("update_booking", "Update a booking — change description, user, type, status, or times.", updateBookingSchema.shape,
  async (args) => { try { const result = await updateBooking(updateBookingSchema.parse(args)); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

server.tool("get_booking_lookups", "List available booking types and statuses.", getBookingLookupsSchema.shape,
  async () => { try { const result = await getBookingLookups(); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

// ─── Gap Fix: Contract Create/Update ─────────────────────────

registerWriteTool("create_contract", "Create a contract for a division. Requires divisionId and type code. Use get_contract_lookups for types.", createContractSchema.shape,
  async (args) => { try { const result = await createContract(createContractSchema.parse(args)); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

registerWriteTool("update_contract", "Update a contract — change description, type, details, or reference.", updateContractSchema.shape,
  async (args) => { try { const result = await updateContract(updateContractSchema.parse(args)); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

server.tool("get_contract_lookups", "List available contract types and schedule statuses.", getContractLookupsSchema.shape,
  async () => { try { const result = await getContractLookups(); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

// ─── Gap Fix: Campaign Create ────────────────────────────────

registerWriteTool("create_campaign", "Create a marketing campaign. Requires description, start date, and manager (name accepted).", createCampaignSchema.shape,
  async (args) => { try { const result = await createCampaign(createCampaignSchema.parse(args)); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

// ─── Gap Fix: Enquiry Create/Update ──────────────────────────

registerWriteTool("create_enquiry", "Create an inbound enquiry. All identity fields optional — fill in what you know (name, company, email, phone, description, source, UTM, address). Optional: campaignId / campaignActivityId to link to a campaign in the same call (for bulk loaders), and assignedTo (code or name) to set the owner at create time.", createEnquirySchema.shape,
  async (args) => { try { const result = await createEnquiry(createEnquirySchema.parse(args)); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

registerWriteTool("update_enquiry", "Update an existing enquiry's details. New in v1.4: pass campaignActivityId (number or null to unlink) and assignedTo (code/name or null to unassign) for in-place re-assignment and re-linking. For dedicated workflows prefer link_enquiry_to_campaign / unlink_enquiry_from_campaign / assign_enquiry which gate via separate permissions.", updateEnquirySchema.shape,
  async (args) => { try { const result = await updateEnquiry(updateEnquirySchema.parse(args)); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

registerWriteTool("link_enquiry_to_campaign", "Link an existing enquiry to a campaign by setting its CampaignActivityId. Pass campaignId (required) and optionally campaignActivityId — when omitted, defaults to the campaign's lowest-id activity. Validates both records exist before writing.", linkEnquiryToCampaignSchema.shape,
  async (args) => { try { const result = await linkEnquiryToCampaign(linkEnquiryToCampaignSchema.parse(args)); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

registerWriteTool("unlink_enquiry_from_campaign", "Clear the campaign association on an existing enquiry (sets CampaignActivityId to null). Idempotent — already-unlinked enquiries report no change.", unlinkEnquiryFromCampaignSchema.shape,
  async (args) => { try { const result = await unlinkEnquiryFromCampaign(unlinkEnquiryFromCampaignSchema.parse(args)); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

registerWriteTool("assign_enquiry", "Set or clear the owner (AssignedTo) on an existing enquiry. Accepts user code or name; pass null to unassign. AssignedDate is auto-populated by the server.", assignEnquirySchema.shape,
  async (args) => { try { const result = await assignEnquiry(assignEnquirySchema.parse(args)); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

// ─── Gap Fix: Calendar Events ────────────────────────────────

server.tool("search_calendar_events", "Search calendar events/diary entries. Filter by user, date range, or subject.", searchCalendarEventsSchema.shape,
  async (args) => { try { const result = await searchCalendarEvents(searchCalendarEventsSchema.parse(args)); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

server.tool("get_calendar_event", "Get full details of a calendar event including attendees, location, and linked records.", getCalendarEventSchema.shape,
  async (args) => { try { const result = await getCalendarEvent(getCalendarEventSchema.parse(args)); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

// ─── Gap Fix: Sales Invoices & Transactions ──────────────────

server.tool("search_sales_invoices", "Search sales invoices. Filter by division, invoice number, order reference, date range, or minimum value.", searchSalesInvoicesSchema.shape,
  async (args) => { try { const result = await searchSalesInvoices(searchSalesInvoicesSchema.parse(args)); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

server.tool("get_sales_invoice", "Get full details of a sales invoice by invoice number.", getSalesInvoiceSchema.shape,
  async (args) => { try { const result = await getSalesInvoice(getSalesInvoiceSchema.parse(args)); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

server.tool("search_sales_transactions", "Search sales transaction lines — the line-level detail behind invoices and orders. Filter by division, invoice, product, or date.", searchSalesTransactionsSchema.shape,
  async (args) => { try { const result = await searchSalesTransactions(searchSalesTransactionsSchema.parse(args)); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

server.tool("report_account_financials", "Complete financial overview for a division — orders, invoices, and transaction history with totals. The full money picture for an account.", reportAccountFinancialsSchema.shape,
  async (args) => { try { const result = await reportAccountFinancials(reportAccountFinancialsSchema.parse(args)); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

// ─── Final: Division Update ──────────────────────────────────

registerWriteTool("update_division", "Update a division/company — change name, phone, website, employee count, territory, relationship, notes, etc. New in v1.6: pass companyId to re-parent the Division under a different Company (e.g. a MAT Trust). For dedicated reparenting workflows prefer reparent_division — separately permissioned via divisions.reparent.", updateDivisionSchema.shape,
  async (args) => { try { const result = await updateDivision(updateDivisionSchema.parse(args)); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

// ─── Cleanup + hierarchy tools (v1.6.0) ───────────────────────

registerWriteTool("delete_task", "Soft-delete a task (StatusFlag → 'D'). Idempotent — already-deleted tasks return a 'no change' message. Hard-delete is not exposed via the OData API.", deleteTaskSchema.shape,
  async (args) => { try { const result = await deleteTask(deleteTaskSchema.parse(args)); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

registerWriteTool("delete_enquiry", "Soft-delete an enquiry. REFUSES if the enquiry has been converted to a Lead/Opportunity (handle the downstream Lead first). Idempotent on already-deleted enquiries.", deleteEnquirySchema.shape,
  async (args) => { try { const result = await deleteEnquiry(deleteEnquirySchema.parse(args)); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

registerWriteTool("delete_activity_note", "Soft-delete a Notepad row. Idempotent — already-deleted or missing notes return a 'no change' message rather than a 404.", deleteActivityNoteSchema.shape,
  async (args) => { try { const result = await deleteActivityNote(deleteActivityNoteSchema.parse(args)); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

registerWriteTool("delete_contact", "Soft-delete a contact. REFUSES with a listing if the contact has any active Quotes, Leads, or Tasks (StatusFlag != 'D') — protects against orphaning live sales activity. Resolve the dependents first (close, delete, or reassign), then re-try.", deleteContactSchema.shape,
  async (args) => { try { const result = await deleteContact(deleteContactSchema.parse(args)); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

registerWriteTool("merge_division", "Merge two Divisions: PATCH every active child record (Contacts, Tasks, Enquiries, Leads, Quotes, division-bound Notepads) from source → target. Returns a per-entity move summary. With deleteSource=true the source Division is soft-deleted afterwards (only when every child moved cleanly). Failed individual moves are listed in the response — they don't abort the rest of the merge.", mergeDivisionSchema.shape,
  async (args) => { try { const result = await mergeDivision(mergeDivisionSchema.parse(args)); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

registerWriteTool("move_contact", "Move a single Contact (and its Tasks/Notepads with stale DivisionId) to a target Division. Validates source/target. Idempotent if already on the target.", moveContactSchema.shape,
  async (args) => { try { const result = await moveContact(moveContactSchema.parse(args)); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

registerWriteTool("reparent_division", "Re-parent a Division under a different Company (Trust/group). Validates the target Company exists and isn't deleted. Idempotent if already under that Company. Single-purpose tool gated separately via divisions.reparent — the same field exists on update_division for callers with broader contacts.edit grants.", reparentDivisionSchema.shape,
  async (args) => { try { const result = await reparentDivision(reparentDivisionSchema.parse(args)); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

registerWriteTool(
  "update_division_address",
  "Update the registered address on a Division. Patches the linked Address entity (resolved via Division.AddressId, falling back to Division.MainAddressId). Only fields supplied are changed; unspecified fields are preserved. Empty string (\"\") explicitly clears a line — useful for removing stale data. Idempotent. Pass divisionId (preferred — resolves AddressId automatically) or addressId directly if known. On WCG: addressLine3 = town/city, addressLine4 = county. Foreign postcodes and countries accepted as-is.",
  updateDivisionAddressSchema.shape,
  async (args) => {
    try {
      const result = await updateDivisionAddress(args);
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  },
);

// ─── Final: Product Catalogue ────────────────────────────────

server.tool("get_product_categories", "List all product categories in the catalogue. Use with search_products_by_category to browse products.", getProductCategoriesSchema.shape,
  async (args) => { try { const result = await getProductCategories(getProductCategoriesSchema.parse(args)); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

server.tool("search_products_by_category", "List all products in a specific category with prices and stock levels.", searchProductsByCategorySchema.shape,
  async (args) => { try { const result = await searchProductsByCategory(searchProductsByCategorySchema.parse(args)); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

// ─── Final: Contact Preferences ──────────────────────────────

server.tool("get_contact_preferences", "Get communication preference flags for a contact — opt-in/opt-out settings.", getContactPreferencesSchema.shape,
  async (args) => { try { const result = await getContactPreferences(getContactPreferencesSchema.parse(args)); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

// ─── Final: Division Sales History ───────────────────────────

server.tool("get_division_sales_history", "Get line-level sales history for a division — every product ordered, quantities, prices, order/invoice references. Pre-computed by the CRM, faster than aggregating transactions.", getDivisionSalesHistorySchema.shape,
  async (args) => { try { const result = await getDivisionSalesHistory(getDivisionSalesHistorySchema.parse(args)); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

// ─── Final: Inventory Create/Update ──────────────────────────

registerWriteTool("create_inventory", "Create an inventory item (asset/equipment) at a customer site. Requires divisionId, description, type, and status. Use get_inventory_lookups for codes.", createInventorySchema.shape,
  async (args) => { try { const result = await createInventory(createInventorySchema.parse(args)); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

registerWriteTool("update_inventory", "Update an inventory item — change description, serial number, location, or references.", updateInventorySchema.shape,
  async (args) => { try { const result = await updateInventory(updateInventorySchema.parse(args)); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

server.tool("get_inventory_lookups", "List available inventory types and statuses.", getInventoryLookupsSchema.shape,
  async () => { try { const result = await getInventoryLookups(); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

// ─── Gap Fix: Division RFM & Profiling ───────────────────────

server.tool("get_division_rfm", "Get Recency/Frequency/Monetary scoring for a division — when they last ordered, how often, how much they spend. Essential for customer segmentation.", getDivisionRfmSchema.shape,
  async (args) => { try { const result = await getDivisionRfm(getDivisionRfmSchema.parse(args)); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

server.tool("get_xtra_fields", "Get custom/extra fields for any CRM entity (Quote, Contact, Division, Lead, Campaign, Booking, Contract). Shows StandardTextField1-10, StandardDecimalField1-10, etc.", getXtraFieldsSchema.shape,
  async (args) => { try { const result = await getXtraFields(getXtraFieldsSchema.parse(args)); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

server.tool("get_contact_profiling", "Get profiling/recall data for a contact — scheduled follow-ups and account manager assignments.", getContactProfilingSchema.shape,
  async (args) => { try { const result = await getContactProfiling(getContactProfilingSchema.parse(args)); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

// ─── Knowledge & Learning Tools ──────────────────────────────

registerWriteTool("save_quoting_lesson", "Save a quoting lesson or correction for future reference. When a user corrects you about product configurations, pricing rules, or quoting processes — save it here so you get it right next time. This is your CRM memory.", saveQuotingLessonSchema.shape,
  async (args) => { try { const result = await saveQuotingLesson(saveQuotingLessonSchema.parse(args)); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

registerWriteTool("save_product_note", "Save a note about a product — configuration details, gotchas, special rules. Builds up product knowledge over time.", saveProductNoteSchema.shape,
  async (args) => { try { const result = await saveProductNote(saveProductNoteSchema.parse(args)); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

server.tool("get_quoting_knowledge", "Read ALL saved quoting lessons and product notes. Call this before creating any quote to check for relevant corrections and rules.", getQuotingKnowledgeSchema.shape,
  async () => { try { const result = await getQuotingKnowledge(); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

server.tool("search_quoting_lessons", "Search saved quoting lessons by keyword — e.g. 'wall pocket', 'bench', 'pricing'. Use when you need to check if there's a known rule for a specific product.", searchQuotingLessonsSchema.shape,
  async (args) => { try { const result = await searchQuotingLessons(searchQuotingLessonsSchema.parse(args)); return { content: [{ type: "text" as const, text: result }] }; } catch (err) { return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true }; } });

// ─── Quote Messaging Tools ───────────────────────────────────
// Wraps the Prospect365 bound actions Default.SendMessage and the MailMergeBlobs
// download. See src/tools/MESSAGING-NOTES.md for the API investigation and the
// v2 roadmap (per-customer-type template overrides).

registerWriteTool(
  "send_quote_email",
  "Send a quote by email. SAFETY: this MCP can only email quotes back to the authenticated API user — never to customers, CCs, or BCCs. The to/cc/bcc parameters are accepted for compatibility but are ignored. To email a customer, use the ProspectCRM UI. Replicates the 7-call flow Prospect's own UI uses (MergeData × 3, Documents POST for the PDF shell, DocumentAttachments/AttachExistingDocument to stage it, SendMessage). All inputs optional except quoteId — `subject`/`messageBody` render from the email template if omitted, `emailTemplateCode` defaults to '_EMLQC', `quoteTemplateCode` defaults to '_QUOTE'. If the user asks for a specific template (e.g. 'the Education template', 'the Versa Wall Pocket one'), call list_quote_templates first to find the matching DocumentTypeCode, then pass it via quoteTemplateCode (or emailTemplateCode for cover-email variants). Set attachPdf=false for body-only email. Returns the sent-email DocumentId + the attachment DocumentId — feed the latter to get_merge_output to retrieve the source document.",
  sendQuoteEmailSchema.shape,
  async (args) => {
    try {
      const result = await sendQuoteEmail(sendQuoteEmailSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "list_quote_templates",
  "List the DocumentTemplate codes usable for quote emails on this tenant — both cover-email templates (feed the code to send_quote_email's emailTemplateCode param) and PDF/document templates (feed to quoteTemplateCode). Call this first when the user wants a non-default template, so you can match their intent to an available code.",
  listQuoteTemplatesSchema.shape,
  async (args) => {
    try {
      const result = await listQuoteTemplates(args);
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "get_merge_output",
  "Retrieve the rendered document blob produced by a send_quote_email call (or any other Default.SendMessage). Returns inferred filename, MIME type, and size. For large blobs (typical quote PDF is 50–500 KB), pass `saveTo` to write the document to disk and get back only metadata — otherwise base64 bytes are embedded inline in the response.",
  getMergeOutputSchema.shape,
  async (args) => {
    try {
      const result = await getMergeOutput(getMergeOutputSchema.parse(args));
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── Start Server ──────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("ProspectCRM MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting MCP server:", err);
  process.exit(1);
});
