/**
 * MCP tool handlers for managing the target-contact roster on a campaign
 * activity. This is the OTHER half of the campaign workflow that v1.4.0
 * left out — v1.4.0 added enquiry → campaign linkage, this adds contact
 * roster management for the same activity.
 *
 * In the Prospect UI this is the "Target Contacts" panel inside a campaign
 * activity. The OData entity is `CampaignActivityContact` (collection
 * `CampaignActivityContacts`) — a join table with composite key
 * (CampaignActivityId, ContactId).
 *
 * Verified live against the WCG tenant 2026-05-08:
 *
 * - POST `/CampaignActivityContacts { CampaignActivityId, ContactId,
 *   Comments? }` succeeds. CreatedByUserId / LastUpdatedByUserId auto-set
 *   to the API user.
 * - The server is idempotent on duplicate POST — re-posting the same
 *   composite key returns 2xx without error and without creating a second
 *   row. We still defensively check before posting so we can return a
 *   clear "no change" message.
 * - DELETE uses the composite-key URL form
 *   `/CampaignActivityContacts(CampaignActivityId=X,ContactId=Y)` — passed
 *   to `client.delete(entitySet, idAsString)` because the existing client
 *   wraps id in parens already.
 *
 * Note: the OData metadata declares fields like `ResponseDate` /
 * `ResponseCode` on related-but-different entities. They are NOT on
 * `CampaignActivityContact`. The pre-existing `get_campaign_activity_contacts`
 * tool was selecting those fields anyway and the server silently ignored
 * them — preserving that quirky behaviour for backwards compat. The new
 * `list_campaign_contacts` tool here uses the actual entity shape.
 */
import { z } from "zod";
import { loadCampaignActivities } from "./campaign-enquiry.js";
export declare const addContactToCampaignSchema: z.ZodObject<{
    contactId: z.ZodNumber;
    campaignId: z.ZodNumber;
    campaignActivityId: z.ZodOptional<z.ZodNumber>;
    comments: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    contactId: number;
    campaignId: number;
    campaignActivityId?: number | undefined;
    comments?: string | undefined;
}, {
    contactId: number;
    campaignId: number;
    campaignActivityId?: number | undefined;
    comments?: string | undefined;
}>;
export declare const removeContactFromCampaignSchema: z.ZodObject<{
    contactId: z.ZodNumber;
    campaignId: z.ZodNumber;
    campaignActivityId: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    contactId: number;
    campaignId: number;
    campaignActivityId?: number | undefined;
}, {
    contactId: number;
    campaignId: number;
    campaignActivityId?: number | undefined;
}>;
export declare const listCampaignContactsSchema: z.ZodObject<{
    campaignId: z.ZodNumber;
    campaignActivityId: z.ZodOptional<z.ZodNumber>;
    top: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    top: number;
    campaignId: number;
    campaignActivityId?: number | undefined;
}, {
    campaignId: number;
    top?: number | undefined;
    campaignActivityId?: number | undefined;
}>;
export declare function addContactToCampaign(args: z.infer<typeof addContactToCampaignSchema>): Promise<string>;
export declare function removeContactFromCampaign(args: z.infer<typeof removeContactFromCampaignSchema>): Promise<string>;
export declare function listCampaignContacts(args: z.infer<typeof listCampaignContactsSchema>): Promise<string>;
export { loadCampaignActivities };
//# sourceMappingURL=campaign-contacts.d.ts.map