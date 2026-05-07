/**
 * MCP tool handlers for Automation (workflows), Webhooks, and Import tracking.
 */
import { z } from "zod";
export declare const searchAutomationProcessesSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    enabledOnly: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    top: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    top: number;
    enabledOnly: boolean;
    name?: string | undefined;
}, {
    top?: number | undefined;
    name?: string | undefined;
    enabledOnly?: boolean | undefined;
}>;
export declare const searchAutomationInstancesSchema: z.ZodObject<{
    processId: z.ZodOptional<z.ZodNumber>;
    stateId: z.ZodOptional<z.ZodString>;
    leadId: z.ZodOptional<z.ZodNumber>;
    quoteId: z.ZodOptional<z.ZodNumber>;
    dateFrom: z.ZodOptional<z.ZodString>;
    dateTo: z.ZodOptional<z.ZodString>;
    top: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    top: number;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    quoteId?: number | undefined;
    leadId?: number | undefined;
    processId?: number | undefined;
    stateId?: string | undefined;
}, {
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    top?: number | undefined;
    quoteId?: number | undefined;
    leadId?: number | undefined;
    processId?: number | undefined;
    stateId?: string | undefined;
}>;
export declare const searchAutomationSchedulesSchema: z.ZodObject<{
    activeOnly: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    top: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    top: number;
    activeOnly: boolean;
}, {
    top?: number | undefined;
    activeOnly?: boolean | undefined;
}>;
export declare const searchWebhooksSchema: z.ZodObject<{
    entityId: z.ZodOptional<z.ZodString>;
    top: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    top: number;
    entityId?: string | undefined;
}, {
    top?: number | undefined;
    entityId?: string | undefined;
}>;
export declare const getWebhookMessagesSchema: z.ZodObject<{
    webhookId: z.ZodNumber;
    top: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    top: number;
    webhookId: number;
}, {
    webhookId: number;
    top?: number | undefined;
}>;
export declare const searchImportRunsSchema: z.ZodObject<{
    dateFrom: z.ZodOptional<z.ZodString>;
    dateTo: z.ZodOptional<z.ZodString>;
    top: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    top: number;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
}, {
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    top?: number | undefined;
}>;
export declare const getImportRunErrorsSchema: z.ZodObject<{
    runId: z.ZodNumber;
    top: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    top: number;
    runId: number;
}, {
    runId: number;
    top?: number | undefined;
}>;
export declare function searchAutomationProcesses(args: z.infer<typeof searchAutomationProcessesSchema>): Promise<string>;
export declare function searchAutomationInstances(args: z.infer<typeof searchAutomationInstancesSchema>): Promise<string>;
export declare function searchAutomationSchedules(args: z.infer<typeof searchAutomationSchedulesSchema>): Promise<string>;
export declare function searchWebhooks(args: z.infer<typeof searchWebhooksSchema>): Promise<string>;
export declare function getWebhookMessages(args: z.infer<typeof getWebhookMessagesSchema>): Promise<string>;
export declare function searchImportRuns(args: z.infer<typeof searchImportRunsSchema>): Promise<string>;
export declare function getImportRunErrors(args: z.infer<typeof getImportRunErrorsSchema>): Promise<string>;
//# sourceMappingURL=automation.d.ts.map