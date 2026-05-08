/**
 * MCP tool handlers for cross-module CRM reports.
 * These tools fetch data from multiple entities, paginate through large result
 * sets, and cross-reference to produce reports that OData alone can't do.
 */
import { z } from "zod";
/**
 * Resolve a mix of user codes and names to user codes.
 * Accepts "ML", "Miles Liesching", "Miles", "Liesching" etc.
 * Returns { codes: string[], resolved: Map<input, code> } or throws if any can't be matched.
 */
export declare function resolveUserCodes(inputs: string[]): Promise<{
    codes: string[];
    display: string;
}>;
export declare const reportAccountsWithoutTasksSchema: z.ZodObject<{
    territoryDescription: z.ZodOptional<z.ZodString>;
    minEmployees: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    users: z.ZodArray<z.ZodString, "many">;
    includeClosedTasks: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    maxResults: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    minEmployees: number;
    users: string[];
    includeClosedTasks: boolean;
    maxResults: number;
    territoryDescription?: string | undefined;
}, {
    users: string[];
    territoryDescription?: string | undefined;
    minEmployees?: number | undefined;
    includeClosedTasks?: boolean | undefined;
    maxResults?: number | undefined;
}>;
export declare const searchTasksSchema: z.ZodObject<{
    divisionId: z.ZodOptional<z.ZodNumber>;
    contactId: z.ZodOptional<z.ZodNumber>;
    leadId: z.ZodOptional<z.ZodNumber>;
    assignedTo: z.ZodOptional<z.ZodString>;
    taskTypeId: z.ZodOptional<z.ZodString>;
    taskTypeName: z.ZodOptional<z.ZodString>;
    openOnly: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    dateFrom: z.ZodOptional<z.ZodString>;
    dateTo: z.ZodOptional<z.ZodString>;
    top: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    top: number;
    openOnly: boolean;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    contactId?: number | undefined;
    leadId?: number | undefined;
    divisionId?: number | undefined;
    assignedTo?: string | undefined;
    taskTypeId?: string | undefined;
    taskTypeName?: string | undefined;
}, {
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    top?: number | undefined;
    contactId?: number | undefined;
    leadId?: number | undefined;
    divisionId?: number | undefined;
    assignedTo?: string | undefined;
    taskTypeId?: string | undefined;
    taskTypeName?: string | undefined;
    openOnly?: boolean | undefined;
}>;
export declare const getTerritoriesSchema: z.ZodObject<{
    includeObsolete: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    includeObsolete: boolean;
}, {
    includeObsolete?: boolean | undefined;
}>;
export declare const reportDivisionSummarySchema: z.ZodObject<{
    territoryDescription: z.ZodOptional<z.ZodString>;
    minEmployees: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    maxEmployees: z.ZodOptional<z.ZodNumber>;
    relationship: z.ZodOptional<z.ZodString>;
    hasWebsite: z.ZodOptional<z.ZodBoolean>;
    top: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    top: number;
    minEmployees: number;
    relationship?: string | undefined;
    territoryDescription?: string | undefined;
    maxEmployees?: number | undefined;
    hasWebsite?: boolean | undefined;
}, {
    top?: number | undefined;
    relationship?: string | undefined;
    territoryDescription?: string | undefined;
    minEmployees?: number | undefined;
    maxEmployees?: number | undefined;
    hasWebsite?: boolean | undefined;
}>;
export declare function reportAccountsWithoutTasks(args: z.infer<typeof reportAccountsWithoutTasksSchema>): Promise<string>;
export declare function searchTasks(args: z.infer<typeof searchTasksSchema>): Promise<string>;
export declare function getTerritories(args: z.infer<typeof getTerritoriesSchema>): Promise<string>;
export declare const createTaskSchema: z.ZodObject<{
    name: z.ZodString;
    taskTypeId: z.ZodString;
    taskDateUtc: z.ZodString;
    assignedTo: z.ZodString;
    taskTimeZone: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    description: z.ZodOptional<z.ZodString>;
    divisionId: z.ZodOptional<z.ZodNumber>;
    contactId: z.ZodOptional<z.ZodNumber>;
    leadId: z.ZodOptional<z.ZodNumber>;
    priority: z.ZodOptional<z.ZodNumber>;
    flagged: z.ZodOptional<z.ZodBoolean>;
    pinned: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    name: string;
    assignedTo: string;
    taskTypeId: string;
    taskDateUtc: string;
    taskTimeZone: string;
    description?: string | undefined;
    contactId?: number | undefined;
    leadId?: number | undefined;
    divisionId?: number | undefined;
    priority?: number | undefined;
    flagged?: boolean | undefined;
    pinned?: boolean | undefined;
}, {
    name: string;
    assignedTo: string;
    taskTypeId: string;
    taskDateUtc: string;
    description?: string | undefined;
    contactId?: number | undefined;
    leadId?: number | undefined;
    divisionId?: number | undefined;
    taskTimeZone?: string | undefined;
    priority?: number | undefined;
    flagged?: boolean | undefined;
    pinned?: boolean | undefined;
}>;
export declare const updateTaskSchema: z.ZodObject<{
    taskId: z.ZodNumber;
    name: z.ZodOptional<z.ZodString>;
    taskTypeId: z.ZodOptional<z.ZodString>;
    taskDateUtc: z.ZodOptional<z.ZodString>;
    assignedTo: z.ZodOptional<z.ZodString>;
    taskTimeZone: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    divisionId: z.ZodOptional<z.ZodNumber>;
    contactId: z.ZodOptional<z.ZodNumber>;
    leadId: z.ZodOptional<z.ZodNumber>;
    priority: z.ZodOptional<z.ZodNumber>;
    flagged: z.ZodOptional<z.ZodBoolean>;
    pinned: z.ZodOptional<z.ZodBoolean>;
    closedDate: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    taskId: number;
    description?: string | undefined;
    contactId?: number | undefined;
    leadId?: number | undefined;
    divisionId?: number | undefined;
    name?: string | undefined;
    assignedTo?: string | undefined;
    taskTypeId?: string | undefined;
    taskDateUtc?: string | undefined;
    taskTimeZone?: string | undefined;
    priority?: number | undefined;
    flagged?: boolean | undefined;
    pinned?: boolean | undefined;
    closedDate?: string | undefined;
}, {
    taskId: number;
    description?: string | undefined;
    contactId?: number | undefined;
    leadId?: number | undefined;
    divisionId?: number | undefined;
    name?: string | undefined;
    assignedTo?: string | undefined;
    taskTypeId?: string | undefined;
    taskDateUtc?: string | undefined;
    taskTimeZone?: string | undefined;
    priority?: number | undefined;
    flagged?: boolean | undefined;
    pinned?: boolean | undefined;
    closedDate?: string | undefined;
}>;
export declare const getTaskTypesSchema: z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>;
export declare function createTask(args: z.infer<typeof createTaskSchema>): Promise<string>;
export declare function updateTask(args: z.infer<typeof updateTaskSchema>): Promise<string>;
export declare function getTaskTypes(): Promise<string>;
export declare function reportDivisionSummary(args: z.infer<typeof reportDivisionSummarySchema>): Promise<string>;
//# sourceMappingURL=reports.d.ts.map