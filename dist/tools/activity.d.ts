/**
 * MCP tool handlers for Activity Feed and Spoke History.
 * Activity feeds are the audit trail of all CRM actions.
 * Spoke history tracks communication touchpoints with contacts/leads.
 */
import { z } from "zod";
export declare const searchActivityFeedSchema: z.ZodObject<{
    divisionId: z.ZodOptional<z.ZodNumber>;
    contactId: z.ZodOptional<z.ZodNumber>;
    leadId: z.ZodOptional<z.ZodNumber>;
    user: z.ZodOptional<z.ZodString>;
    dateFrom: z.ZodOptional<z.ZodString>;
    dateTo: z.ZodOptional<z.ZodString>;
    top: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    top: number;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    contactId?: number | undefined;
    leadId?: number | undefined;
    divisionId?: number | undefined;
    user?: string | undefined;
}, {
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    top?: number | undefined;
    contactId?: number | undefined;
    leadId?: number | undefined;
    divisionId?: number | undefined;
    user?: string | undefined;
}>;
export declare const searchSpokeHistorySchema: z.ZodObject<{
    contactId: z.ZodOptional<z.ZodNumber>;
    divisionId: z.ZodOptional<z.ZodNumber>;
    leadId: z.ZodOptional<z.ZodNumber>;
    user: z.ZodOptional<z.ZodString>;
    dateFrom: z.ZodOptional<z.ZodString>;
    dateTo: z.ZodOptional<z.ZodString>;
    top: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    top: number;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    contactId?: number | undefined;
    leadId?: number | undefined;
    divisionId?: number | undefined;
    user?: string | undefined;
}, {
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    top?: number | undefined;
    contactId?: number | undefined;
    leadId?: number | undefined;
    divisionId?: number | undefined;
    user?: string | undefined;
}>;
export declare const searchRecallsSchema: z.ZodObject<{
    entity: z.ZodEnum<["contact", "lead"]>;
    user: z.ZodOptional<z.ZodString>;
    dateFrom: z.ZodOptional<z.ZodString>;
    dateTo: z.ZodOptional<z.ZodString>;
    overdueOnly: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    top: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    top: number;
    entity: "contact" | "lead";
    overdueOnly: boolean;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    user?: string | undefined;
}, {
    entity: "contact" | "lead";
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    top?: number | undefined;
    user?: string | undefined;
    overdueOnly?: boolean | undefined;
}>;
export declare function searchActivityFeed(args: z.infer<typeof searchActivityFeedSchema>): Promise<string>;
export declare function searchSpokeHistory(args: z.infer<typeof searchSpokeHistorySchema>): Promise<string>;
export declare function searchRecalls(args: z.infer<typeof searchRecallsSchema>): Promise<string>;
//# sourceMappingURL=activity.d.ts.map