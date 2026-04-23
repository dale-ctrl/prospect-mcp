/**
 * MCP tool handlers for cross-module CRM reports.
 * These tools fetch data from multiple entities, paginate through large result
 * sets, and cross-reference to produce reports that OData alone can't do.
 */

import { z } from "zod";
import { getClient, type ODataResponse } from "../client.js";

// ─── Helpers ──────────────────────────────────────────────────

/** Cached user list so we don't re-fetch every call. */
let _userCache: { UserCode: string; UserName: string }[] | null = null;

/**
 * Resolve a mix of user codes and names to user codes.
 * Accepts "ML", "Miles Liesching", "Miles", "Liesching" etc.
 * Returns { codes: string[], resolved: Map<input, code> } or throws if any can't be matched.
 */
async function resolveUserCodes(inputs: string[]): Promise<{ codes: string[]; display: string }> {
  const client = getClient();

  if (!_userCache) {
    const result = await client.get<{ UserCode: string; UserName: string }>(
      "Users",
      "$select=UserCode,UserName&$filter=Obsolete eq 0"
    );
    _userCache = result.value;
  }

  const codes: string[] = [];
  const displayParts: string[] = [];
  const unmatched: string[] = [];

  for (const input of inputs) {
    const trimmed = input.trim();

    // First try exact code match (case-insensitive)
    const byCode = _userCache.find(
      (u) => u.UserCode.toUpperCase() === trimmed.toUpperCase()
    );
    if (byCode) {
      codes.push(byCode.UserCode);
      displayParts.push(`${byCode.UserName} (${byCode.UserCode})`);
      continue;
    }

    // Try name match — full name, first name, or surname (case-insensitive)
    const term = trimmed.toUpperCase();
    const byName = _userCache.find((u) => {
      const name = (u.UserName || "").toUpperCase();
      return (
        name === term ||
        name.startsWith(term + " ") ||
        name.endsWith(" " + term) ||
        name.includes(term)
      );
    });

    if (byName) {
      codes.push(byName.UserCode);
      displayParts.push(`${byName.UserName} (${byName.UserCode})`);
    } else {
      unmatched.push(trimmed);
    }
  }

  if (unmatched.length > 0) {
    const available = _userCache
      .map((u) => `${u.UserCode} — ${u.UserName}`)
      .join("\n");
    throw new Error(
      `Could not match these users: ${unmatched.join(", ")}\n\nAvailable users:\n${available}`
    );
  }

  return { codes, display: displayParts.join(", ") };
}

/**
 * Paginate through an OData collection using $skip, fetching all pages.
 * Prospect API caps at 500 per page and doesn't return nextLink,
 * so we use $skip to walk through the full result set.
 */
async function fetchAll<T>(
  entitySet: string,
  queryParams: string,
  pageSize = 500,
  maxPages = 50
): Promise<T[]> {
  const client = getClient();
  const all: T[] = [];

  for (let page = 0; page < maxPages; page++) {
    const skip = page * pageSize;
    const params = `${queryParams}&$top=${pageSize}&$skip=${skip}`;

    const result = await client.get<T>(entitySet, params);
    all.push(...result.value);

    // If we got fewer than a full page, we've reached the end
    if (result.value.length < pageSize) break;
  }

  return all;
}

// ─── Schemas ──────────────────────────────────────────────────

export const reportAccountsWithoutTasksSchema = z.object({
  territoryDescription: z.string().optional().describe(
    "Territory name to filter by (e.g. 'WG AREA', 'SOUTH WEST'). Case-insensitive partial match. If omitted, searches all territories."
  ),
  minEmployees: z.number().optional().default(0).describe(
    "Minimum employee count (Prospect's 'Employees' field, often pupil numbers for schools). Default 0."
  ),
  users: z.array(z.string()).describe(
    "Users to check for tasks — accepts user codes (e.g. 'ML') OR full/partial names (e.g. 'Miles Liesching', 'Miles', 'Al White'). The report finds accounts that have NO open task assigned to ANY of these users."
  ),
  includeClosedTasks: z.boolean().optional().default(false).describe(
    "If true, any task (open or closed) counts. If false (default), only open tasks count — an account with only closed tasks for these users will still appear in the report."
  ),
  maxResults: z.number().optional().default(200).describe(
    "Cap the number of results returned (default 200). Set higher if you need the full list."
  ),
});

export const searchTasksSchema = z.object({
  divisionId: z.number().optional().describe("Filter tasks by DivisionId"),
  contactId: z.number().optional().describe("Filter tasks by ContactId"),
  leadId: z.number().optional().describe("Filter tasks by LeadId (opportunity)"),
  assignedTo: z.string().optional().describe("Filter by user — accepts a user code (e.g. 'ML') or name (e.g. 'Miles Liesching', 'Miles')"),
  taskTypeId: z.string().optional().describe("Filter by task type ID (e.g. 'SENDQUOTE' for Quote Follow-Up). Use get_task_types to list available types."),
  taskTypeName: z.string().optional().describe("Filter by task type name (partial match, e.g. 'Quote Follow'). Alternative to taskTypeId — resolved automatically."),
  openOnly: z.boolean().optional().default(true).describe("Only show open tasks (default true)"),
  dateFrom: z.string().optional().describe("Tasks on or after this date (ISO format)"),
  dateTo: z.string().optional().describe("Tasks on or before this date (ISO format)"),
  top: z.number().optional().default(20).describe("Max results (default 20)"),
});

export const getTerritoriesSchema = z.object({
  includeObsolete: z.boolean().optional().default(false).describe("Include obsolete territories"),
});

export const reportDivisionSummarySchema = z.object({
  territoryDescription: z.string().optional().describe("Territory name filter (partial match, case-insensitive)"),
  minEmployees: z.number().optional().default(0).describe("Minimum employee count"),
  maxEmployees: z.number().optional().describe("Maximum employee count"),
  relationship: z.string().optional().describe("Relationship type filter (e.g. 'Customer', 'Prospect')"),
  hasWebsite: z.boolean().optional().describe("Filter to only accounts with/without a website"),
  top: z.number().optional().default(50).describe("Max results (default 50)"),
});

// ─── Handlers ─────────────────────────────────────────────────

export async function reportAccountsWithoutTasks(
  args: z.infer<typeof reportAccountsWithoutTasksSchema>
): Promise<string> {
  const client = getClient();

  // Step 0: Resolve user names/codes to actual user codes
  const { codes: userCodes, display: userDisplay } = await resolveUserCodes(args.users);

  // Step 1: Resolve territory code from description
  let territoryFilter = "";
  if (args.territoryDescription) {
    const territories = await client.get<{ TerritoryId: string; Description: string }>(
      "Territories",
      `$filter=Obsolete eq 0&$select=TerritoryId,Description`
    );

    const searchTerm = args.territoryDescription.toUpperCase();
    const match = territories.value.find(
      (t) => t.Description.toUpperCase().includes(searchTerm)
    );

    if (!match) {
      const available = territories.value.map((t) => t.Description).join(", ");
      return `No territory found matching "${args.territoryDescription}". Available: ${available}`;
    }

    territoryFilter = `TerritoryCode eq '${match.TerritoryId}'`;
  }

  // Step 2: Fetch all matching divisions (paginated)
  const divFilters = ["StatusFlag ne 'D'"];
  if (territoryFilter) divFilters.push(territoryFilter);
  if (args.minEmployees > 0) divFilters.push(`Employees ge ${args.minEmployees}`);

  const divParams = [
    `$filter=${divFilters.join(" and ")}`,
    `$select=DivisionId,Name,Employees,TerritoryCode,PhoneNumber,Website,Relationship`,
    `$orderby=Name`,
  ].join("&");

  const allDivisions = await fetchAll<{
    DivisionId: number;
    Name: string;
    Employees: number | null;
    TerritoryCode: string | null;
    PhoneNumber: string | null;
    Website: string | null;
    Relationship: string | null;
  }>("Divisions", divParams);

  if (allDivisions.length === 0) {
    return "No accounts found matching the criteria.";
  }

  // Step 3: Fetch all tasks for the specified users (paginated)
  const userFilter = userCodes
    .map((u) => `AssignedTo eq '${u}'`)
    .join(" or ");

  const taskFilters = [`(${userFilter})`, "StatusFlag ne 'D'"];
  if (!args.includeClosedTasks) {
    taskFilters.push("ClosedDate eq null");
  }

  const taskParams = [
    `$filter=${taskFilters.join(" and ")}`,
    `$select=TaskId,DivisionId,AssignedTo`,
  ].join("&");

  const allTasks = await fetchAll<{
    TaskId: number;
    DivisionId: number | null;
    AssignedTo: string;
  }>("Tasks", taskParams);

  // Step 4: Build set of DivisionIds that HAVE tasks
  const divisionsWithTasks = new Set<number>();
  for (const task of allTasks) {
    if (task.DivisionId != null) {
      divisionsWithTasks.add(task.DivisionId);
    }
  }

  // Step 5: Filter to divisions WITHOUT tasks
  const results = allDivisions.filter(
    (d) => !divisionsWithTasks.has(d.DivisionId)
  );

  // Step 6: Format output
  const capped = results.slice(0, args.maxResults);
  const taskType = args.includeClosedTasks ? "any" : "open";

  const header = [
    `# Accounts Without ${taskType} Tasks for [${userDisplay}]`,
    `**Territory:** ${args.territoryDescription || "All"}`,
    `**Min employees:** ${args.minEmployees}`,
    `**Total accounts matching criteria:** ${allDivisions.length}`,
    `**Accounts with ${taskType} tasks for these users:** ${divisionsWithTasks.size} (of ${allDivisions.length} checked)`,
    `**Accounts WITHOUT tasks:** ${results.length}`,
    results.length > args.maxResults ? `**Showing first ${args.maxResults} of ${results.length}**` : "",
    "",
  ].filter(Boolean).join("\n");

  const rows = capped.map((d, i) => {
    return [
      `${i + 1}. **${d.Name}** (DivisionId: ${d.DivisionId})`,
      `   Employees: ${d.Employees ?? "N/A"} | Phone: ${d.PhoneNumber || "N/A"} | Website: ${d.Website || "N/A"}`,
    ].join("\n");
  });

  return `${header}\n${rows.join("\n\n")}`;
}

export async function searchTasks(
  args: z.infer<typeof searchTasksSchema>
): Promise<string> {
  const client = getClient();
  const filters: string[] = ["StatusFlag ne 'D'"];

  if (args.divisionId) filters.push(`DivisionId eq ${args.divisionId}`);
  if (args.contactId) filters.push(`ContactId eq ${args.contactId}`);
  if (args.leadId) filters.push(`LeadId eq ${args.leadId}`);
  if (args.assignedTo) {
    const { codes } = await resolveUserCodes([args.assignedTo]);
    filters.push(`AssignedTo eq '${codes[0]}'`);
  }
  if (args.openOnly) filters.push("ClosedDate eq null");
  if (args.dateFrom) filters.push(`TaskDateUtc ge ${args.dateFrom}`);
  if (args.dateTo) filters.push(`TaskDateUtc le ${args.dateTo}`);

  // Task type filter — by ID or by name lookup
  if (args.taskTypeId) {
    filters.push(`TaskTypeId eq '${args.taskTypeId}'`);
  } else if (args.taskTypeName) {
    // Look up task types and find a match
    const types = await client.get<{ TaskTypeId: string; Description: string }>(
      "TaskTypes", "$select=TaskTypeId,Description&$filter=Obsolete eq false"
    );
    const search = args.taskTypeName.toUpperCase();
    const match = types.value.find(t => (t.Description || "").toUpperCase().includes(search));
    if (match) {
      filters.push(`TaskTypeId eq '${match.TaskTypeId}'`);
    } else {
      const available = types.value.map(t => `${t.TaskTypeId} — ${t.Description}`).join(", ");
      return `No task type found matching "${args.taskTypeName}". Available: ${available}`;
    }
  }

  const expand = "AssignedToUser($select=UserName),Division($select=Name),Contact($select=Forename,Surname),TaskType($select=Description)";

  const params = [
    `$filter=${filters.join(" and ")}`,
    `$expand=${expand}`,
    `$select=TaskId,Name,Description,TaskTypeId,TaskDateUtc,ClosedDate,Priority,DivisionId,ContactId,LeadId`,
    `$orderby=TaskDateUtc desc`,
    `$top=${args.top || 20}`,
  ].join("&");

  const result = await client.get<Record<string, unknown>>("Tasks", params);

  if (result.value.length === 0) return "No tasks found matching the criteria.";

  const lines = result.value.map((t) => {
    const assignee = (t.AssignedToUser as Record<string, unknown>)?.UserName || "N/A";
    const division = (t.Division as Record<string, unknown>)?.Name || "N/A";
    const taskType = (t.TaskType as Record<string, unknown>)?.Description || t.TaskTypeId || "N/A";
    const contact = t.Contact
      ? `${(t.Contact as Record<string, unknown>).Forename || ""} ${(t.Contact as Record<string, unknown>).Surname || ""}`.trim()
      : "N/A";
    const date = (t.TaskDateUtc as string)?.substring(0, 10) || "N/A";
    const closed = t.ClosedDate ? (t.ClosedDate as string).substring(0, 10) : "Open";

    return [
      `**Task #${t.TaskId}** — ${t.Name || "(untitled)"}`,
      `  Type: ${taskType} | Assigned to: ${assignee} | Date: ${date} | Status: ${closed}`,
      `  Division: ${division} (${t.DivisionId || "N/A"}) | Contact: ${contact}`,
      t.Description ? `  Notes: ${(t.Description as string).substring(0, 100)}...` : "",
    ].filter(Boolean).join("\n");
  });

  return `Found ${result.value.length} task(s):\n\n${lines.join("\n\n")}`;
}

export async function getTerritories(
  args: z.infer<typeof getTerritoriesSchema>
): Promise<string> {
  const client = getClient();

  const filter = args.includeObsolete ? "" : "$filter=Obsolete eq 0&";
  const params = `${filter}$select=TerritoryId,Description&$orderby=Description`;

  const result = await client.get<{ TerritoryId: string; Description: string }>(
    "Territories",
    params
  );

  if (result.value.length === 0) return "No territories found.";

  const lines = result.value.map(
    (t) => `- \`${t.TerritoryId}\` — ${t.Description}`
  );

  return `## Territories (${result.value.length})\n${lines.join("\n")}`;
}

// ─── Task Create/Update & Task Type Lookups ─────────────────

export const createTaskSchema = z.object({
  name: z.string().describe("Task name/subject"),
  taskTypeId: z.string().describe("Task type ID — use get_task_types to list available types"),
  taskDateUtc: z.string().describe("Task date in ISO format (e.g. '2026-04-20T09:00:00Z')"),
  assignedTo: z.string().describe("User to assign — accepts user code (e.g. 'ML') or name (e.g. 'Miles')"),
  taskTimeZone: z.string().optional().default("GMT Standard Time").describe("IANA timezone (default: 'GMT Standard Time')"),
  description: z.string().optional().describe("Task description/notes"),
  divisionId: z.number().optional().describe("DivisionId to link the task to"),
  contactId: z.number().optional().describe("ContactId to link the task to"),
  leadId: z.number().optional().describe("LeadId (opportunity) to link the task to"),
  priority: z.number().optional().describe("Priority level (1=highest)"),
  flagged: z.boolean().optional().describe("Flag the task"),
  pinned: z.boolean().optional().describe("Pin the task"),
});

export const updateTaskSchema = z.object({
  taskId: z.number().describe("The TaskId to update"),
  name: z.string().optional().describe("Task name/subject"),
  taskTypeId: z.string().optional().describe("Task type ID"),
  taskDateUtc: z.string().optional().describe("Task date in ISO format"),
  assignedTo: z.string().optional().describe("User to assign — code or name"),
  taskTimeZone: z.string().optional().describe("Timezone"),
  description: z.string().optional().describe("Task description/notes"),
  divisionId: z.number().optional().describe("DivisionId"),
  contactId: z.number().optional().describe("ContactId"),
  leadId: z.number().optional().describe("LeadId"),
  priority: z.number().optional().describe("Priority level"),
  flagged: z.boolean().optional().describe("Flag the task"),
  pinned: z.boolean().optional().describe("Pin the task"),
  closedDate: z.string().optional().describe("Close date in ISO format — set to close the task"),
});

export const getTaskTypesSchema = z.object({});

export async function createTask(args: z.infer<typeof createTaskSchema>): Promise<string> {
  const client = getClient();

  const { codes } = await resolveUserCodes([args.assignedTo]);

  const body: Record<string, unknown> = {
    Name: args.name,
    TaskTypeId: args.taskTypeId,
    TaskDateUtc: args.taskDateUtc,
    TaskTimeZone: args.taskTimeZone || "GMT Standard Time",
    AssignedTo: codes[0],
  };

  if (args.description !== undefined) body.Description = args.description;
  if (args.divisionId !== undefined) body.DivisionId = args.divisionId;
  if (args.contactId !== undefined) body.ContactId = args.contactId;
  if (args.leadId !== undefined) body.LeadId = args.leadId;
  if (args.priority !== undefined) body.Priority = args.priority;
  if (args.flagged !== undefined) body.Flagged = args.flagged;
  if (args.pinned !== undefined) body.Pinned = args.pinned;

  const created = await client.post<Record<string, unknown>>("Tasks", body);

  return [
    `Task created successfully!`,
    `**TaskId:** ${created.TaskId}`,
    `**Name:** ${created.Name || args.name}`,
    `**Assigned To:** ${codes[0]}`,
    `**Date:** ${args.taskDateUtc}`,
    `**DivisionId:** ${created.DivisionId || "N/A"}`,
    `**ContactId:** ${created.ContactId || "N/A"}`,
  ].join("\n");
}

export async function updateTask(args: z.infer<typeof updateTaskSchema>): Promise<string> {
  const client = getClient();
  const { taskId, ...fields } = args;

  const body: Record<string, unknown> = {};
  if (fields.name !== undefined) body.Name = fields.name;
  if (fields.taskTypeId !== undefined) body.TaskTypeId = fields.taskTypeId;
  if (fields.taskDateUtc !== undefined) body.TaskDateUtc = fields.taskDateUtc;
  if (fields.taskTimeZone !== undefined) body.TaskTimeZone = fields.taskTimeZone;
  if (fields.description !== undefined) body.Description = fields.description;
  if (fields.divisionId !== undefined) body.DivisionId = fields.divisionId;
  if (fields.contactId !== undefined) body.ContactId = fields.contactId;
  if (fields.leadId !== undefined) body.LeadId = fields.leadId;
  if (fields.priority !== undefined) body.Priority = fields.priority;
  if (fields.flagged !== undefined) body.Flagged = fields.flagged;
  if (fields.pinned !== undefined) body.Pinned = fields.pinned;
  if (fields.closedDate !== undefined) body.ClosedDate = fields.closedDate;

  if (fields.assignedTo !== undefined) {
    const { codes } = await resolveUserCodes([fields.assignedTo]);
    body.AssignedTo = codes[0];
  }

  if (Object.keys(body).length === 0) {
    return "No fields provided to update. Specify at least one field to change.";
  }

  await client.patch<Record<string, unknown>>("Tasks", taskId, body);

  return `Task #${taskId} updated successfully. Fields changed: ${Object.keys(body).join(", ")}`;
}

export async function getTaskTypes(): Promise<string> {
  const client = getClient();
  const result = await client.get<{ TaskTypeId: string; Description: string }>(
    "TaskTypes",
    "$select=TaskTypeId,Description&$orderby=Description"
  );

  if (result.value.length === 0) return "No task types found.";

  const lines = result.value.map(t => `- \`${t.TaskTypeId}\` — ${t.Description}`);
  return `## Task Types (${result.value.length})\n${lines.join("\n")}`;
}

export async function reportDivisionSummary(
  args: z.infer<typeof reportDivisionSummarySchema>
): Promise<string> {
  const client = getClient();
  const filters = ["StatusFlag ne 'D'"];

  // Resolve territory
  if (args.territoryDescription) {
    const territories = await client.get<{ TerritoryId: string; Description: string }>(
      "Territories",
      `$filter=Obsolete eq 0&$select=TerritoryId,Description`
    );
    const searchTerm = args.territoryDescription.toUpperCase();
    const match = territories.value.find(
      (t) => t.Description.toUpperCase().includes(searchTerm)
    );
    if (!match) {
      return `No territory matching "${args.territoryDescription}". Available: ${territories.value.map((t) => t.Description).join(", ")}`;
    }
    filters.push(`TerritoryCode eq '${match.TerritoryId}'`);
  }

  if (args.minEmployees > 0) filters.push(`Employees ge ${args.minEmployees}`);
  if (args.maxEmployees !== undefined) filters.push(`Employees le ${args.maxEmployees}`);
  if (args.relationship) filters.push(`contains(Relationship,'${args.relationship}')`);
  if (args.hasWebsite === true) filters.push("Website ne null");
  if (args.hasWebsite === false) filters.push("Website eq null");

  const params = [
    `$filter=${filters.join(" and ")}`,
    `$select=DivisionId,Name,Employees,PhoneNumber,Website,Relationship,TerritoryCode,AccountManager`,
    `$expand=AccountManagerUser($select=UserName)`,
    `$orderby=Name`,
    `$top=${args.top || 50}`,
    `$count=true`,
  ].join("&");

  const result = await client.get<Record<string, unknown>>("Divisions", params);
  const total = (result as unknown as Record<string, unknown>)["@odata.count"] as number | undefined;

  if (result.value.length === 0) return "No accounts found matching the criteria.";

  const lines = result.value.map((d, i) => {
    const am = (d.AccountManagerUser as Record<string, unknown>)?.UserName || d.AccountManager || "N/A";
    return [
      `${i + 1}. **${d.Name}** (${d.DivisionId})`,
      `   Employees: ${d.Employees ?? "N/A"} | AM: ${am} | Relationship: ${d.Relationship || "N/A"}`,
      `   Phone: ${d.PhoneNumber || "N/A"} | Website: ${d.Website || "N/A"}`,
    ].join("\n");
  });

  return [
    `# Division Summary`,
    `**Total matching:** ${total ?? result.value.length}`,
    `**Showing:** ${result.value.length}`,
    "",
    lines.join("\n\n"),
  ].join("\n");
}
