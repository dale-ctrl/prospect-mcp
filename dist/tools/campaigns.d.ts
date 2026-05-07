/**
 * MCP tool handlers for Campaign and Campaign Activity operations.
 * Campaigns contain Activities, which target contacts for marketing outreach.
 */
import { z } from "zod";
export declare const searchCampaignsSchema: z.ZodObject<{
    description: z.ZodOptional<z.ZodString>;
    dateFrom: z.ZodOptional<z.ZodString>;
    dateTo: z.ZodOptional<z.ZodString>;
    top: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    top: number;
    description?: string | undefined;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
}, {
    description?: string | undefined;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    top?: number | undefined;
}>;
export declare const getCampaignSchema: z.ZodObject<{
    campaignId: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    campaignId: number;
}, {
    campaignId: number;
}>;
export declare const searchCampaignActivitiesSchema: z.ZodObject<{
    campaignId: z.ZodOptional<z.ZodNumber>;
    description: z.ZodOptional<z.ZodString>;
    dateFrom: z.ZodOptional<z.ZodString>;
    dateTo: z.ZodOptional<z.ZodString>;
    top: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    top: number;
    description?: string | undefined;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    campaignId?: number | undefined;
}, {
    description?: string | undefined;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    top?: number | undefined;
    campaignId?: number | undefined;
}>;
export declare const getCampaignActivityContactsSchema: z.ZodObject<{
    campaignActivityId: z.ZodNumber;
    top: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    top: number;
    campaignActivityId: number;
}, {
    campaignActivityId: number;
    top?: number | undefined;
}>;
export declare const createCampaignSchema: z.ZodObject<{
    description: z.ZodString;
    startDate: z.ZodString;
    managedById: z.ZodString;
    endDate: z.ZodOptional<z.ZodString>;
    totalBudget: z.ZodOptional<z.ZodNumber>;
    detailedDescription: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    description: string;
    startDate: string;
    managedById: string;
    endDate?: string | undefined;
    totalBudget?: number | undefined;
    detailedDescription?: string | undefined;
}, {
    description: string;
    startDate: string;
    managedById: string;
    endDate?: string | undefined;
    totalBudget?: number | undefined;
    detailedDescription?: string | undefined;
}>;
export declare function createCampaign(args: z.infer<typeof createCampaignSchema>): Promise<string>;
export declare function searchCampaigns(args: z.infer<typeof searchCampaignsSchema>): Promise<string>;
export declare function getCampaign(args: z.infer<typeof getCampaignSchema>): Promise<string>;
export declare function searchCampaignActivities(args: z.infer<typeof searchCampaignActivitiesSchema>): Promise<string>;
export declare function getCampaignActivityContacts(args: z.infer<typeof getCampaignActivityContactsSchema>): Promise<string>;
//# sourceMappingURL=campaigns.d.ts.map