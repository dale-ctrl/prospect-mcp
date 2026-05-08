/**
 * MCP tool handlers for linking enquiries to campaigns and assigning ownership.
 *
 * Design notes (verified live against the WCG tenant 2026-05-08):
 *
 * - The Enquiry → Campaign association lives in `Enquiry.CampaignActivityId`
 *   (Edm.Int32). There is NO separate join entity. The link is at the
 *   Activity level — the Campaign is reached via the activity's
 *   `CampaignId` column.
 * - Ownership lives in `Enquiry.AssignedTo` (Edm.String, varchar 3) — the
 *   CRM user code. Setting it also auto-populates `AssignedDate`.
 * - Both columns are flagged `meta:UpdateVisibility="never"` in the OData
 *   metadata, but PATCH (and POST) accept them — Prospect's metadata is
 *   misleading on this point. Verified by round-trip test.
 * - To unlink, PATCH `CampaignActivityId: null`. To unassign, PATCH
 *   `AssignedTo: null`.
 *
 * If `link_enquiry_to_campaign` is called without an explicit
 * `campaignActivityId`, we look up the campaign's activities and pick the
 * one with the lowest CampaignActivityId. We surface the chosen activity in
 * the success message so the caller can see which was used.
 */
import { z } from "zod";
interface CampaignActivityRef {
    CampaignActivityId: number;
    CampaignId: number;
    Description?: string | null;
}
export declare const linkEnquiryToCampaignSchema: z.ZodObject<{
    enquiryId: z.ZodNumber;
    campaignId: z.ZodNumber;
    campaignActivityId: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    enquiryId: number;
    campaignId: number;
    campaignActivityId?: number | undefined;
}, {
    enquiryId: number;
    campaignId: number;
    campaignActivityId?: number | undefined;
}>;
export declare const unlinkEnquiryFromCampaignSchema: z.ZodObject<{
    enquiryId: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    enquiryId: number;
}, {
    enquiryId: number;
}>;
export declare const assignEnquirySchema: z.ZodObject<{
    enquiryId: z.ZodNumber;
    assignedTo: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    assignedTo: string | null;
    enquiryId: number;
}, {
    assignedTo: string | null;
    enquiryId: number;
}>;
export declare function linkEnquiryToCampaign(args: z.infer<typeof linkEnquiryToCampaignSchema>): Promise<string>;
export declare function unlinkEnquiryFromCampaign(args: z.infer<typeof unlinkEnquiryFromCampaignSchema>): Promise<string>;
export declare function assignEnquiry(args: z.infer<typeof assignEnquirySchema>): Promise<string>;
/**
 * Shared helper used by `create_enquiry` / `update_enquiry` so they can
 * accept the same campaignId / campaignActivityId / assignedTo fields and
 * produce a consistent body fragment without each caller duplicating the
 * resolution logic.
 *
 * Returns:
 *   - `body`: the fields to merge into the Enquiry write payload.
 *   - `assignedDisplay`: pretty user description for the success message
 *     (undefined if no assignedTo was supplied).
 *   - `activity`: the resolved CampaignActivity (undefined if no
 *     campaign/activity supplied).
 */
export interface CampaignAndOwnerInputs {
    campaignId?: number;
    campaignActivityId?: number;
    assignedTo?: string;
}
export interface ResolvedCampaignAndOwner {
    body: Record<string, unknown>;
    assignedDisplay?: string;
    activity?: CampaignActivityRef;
}
export declare function resolveCampaignAndOwnerFields(args: CampaignAndOwnerInputs): Promise<ResolvedCampaignAndOwner>;
export {};
//# sourceMappingURL=campaign-enquiry.d.ts.map