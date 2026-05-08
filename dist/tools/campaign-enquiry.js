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
import { getClient } from "../client.js";
import { resolveUserCodes } from "./reports.js";
export async function loadCampaignActivities(campaignId) {
    const client = getClient();
    const result = await client.get("CampaignActivities", `$filter=CampaignId eq ${campaignId}&$select=CampaignActivityId,CampaignId,Description&$orderby=CampaignActivityId asc`);
    return result.value;
}
export async function resolveCampaignActivity(campaignId, campaignActivityId) {
    const activities = await loadCampaignActivities(campaignId);
    if (activities.length === 0) {
        throw new Error(`Campaign ${campaignId} has no activities — cannot link an enquiry to it. ` +
            `Create at least one CampaignActivity first.`);
    }
    if (campaignActivityId !== undefined) {
        const chosen = activities.find((a) => a.CampaignActivityId === campaignActivityId);
        if (!chosen) {
            const list = activities
                .map((a) => `  ${a.CampaignActivityId} — ${a.Description ?? "(no description)"}`)
                .join("\n");
            throw new Error(`CampaignActivityId ${campaignActivityId} does not belong to campaign ${campaignId}. ` +
                `Activities under campaign ${campaignId}:\n${list}`);
        }
        return chosen;
    }
    // No explicit activity — default to the lowest-id one (per spec). When
    // there's only one, this is unambiguous; when there are several, we still
    // pick deterministically and surface it in the response.
    return activities[0];
}
// ─── Schemas ──────────────────────────────────────────────────
export const linkEnquiryToCampaignSchema = z.object({
    enquiryId: z.number().int().positive().describe("EnquiryId to link."),
    campaignId: z.number().int().positive().describe("CampaignId to link to."),
    campaignActivityId: z.number().int().positive().optional().describe("Specific CampaignActivityId under the campaign. Optional — defaults to the campaign's first activity (lowest id)."),
});
export const unlinkEnquiryFromCampaignSchema = z.object({
    enquiryId: z.number().int().positive().describe("EnquiryId to unlink — clears CampaignActivityId."),
});
export const assignEnquirySchema = z.object({
    enquiryId: z.number().int().positive().describe("EnquiryId to (re)assign."),
    assignedTo: z.string().nullable().describe("User to assign — accepts a user code (e.g. 'CL1') or name ('Calvin Liesching', 'Calvin'). " +
        "Pass null to unassign."),
});
// ─── Handlers ─────────────────────────────────────────────────
export async function linkEnquiryToCampaign(args) {
    const client = getClient();
    // Validate enquiry exists. getById throws an actionable 404 if not.
    await client.getById("Enquiries", args.enquiryId, "$select=EnquiryId");
    // Resolve campaign + activity (also validates the campaign exists, since
    // the activity query under a missing campaign returns an empty list).
    const activity = await resolveCampaignActivity(args.campaignId, args.campaignActivityId);
    await client.patch("Enquiries", args.enquiryId, { CampaignActivityId: activity.CampaignActivityId });
    return [
        `Linked enquiry ${args.enquiryId} to campaign ${args.campaignId} via activity ${activity.CampaignActivityId}` +
            (activity.Description ? ` ("${activity.Description}").` : "."),
        args.campaignActivityId === undefined
            ? `(No campaignActivityId supplied — defaulted to the campaign's lowest-id activity.)`
            : "",
    ].filter(Boolean).join("\n");
}
export async function unlinkEnquiryFromCampaign(args) {
    const client = getClient();
    const before = await client.getById("Enquiries", args.enquiryId, "$select=EnquiryId,CampaignActivityId");
    if (before.CampaignActivityId === null) {
        return `Enquiry ${args.enquiryId} is already unlinked from any campaign — no change.`;
    }
    await client.patch("Enquiries", args.enquiryId, { CampaignActivityId: null });
    return `Unlinked enquiry ${args.enquiryId} from campaign activity ${before.CampaignActivityId}.`;
}
export async function assignEnquiry(args) {
    const client = getClient();
    // Validate enquiry exists.
    await client.getById("Enquiries", args.enquiryId, "$select=EnquiryId");
    if (args.assignedTo === null || args.assignedTo === "") {
        await client.patch("Enquiries", args.enquiryId, { AssignedTo: null });
        return `Unassigned enquiry ${args.enquiryId}.`;
    }
    const { codes, display } = await resolveUserCodes([args.assignedTo]);
    const code = codes[0];
    await client.patch("Enquiries", args.enquiryId, { AssignedTo: code });
    return `Assigned enquiry ${args.enquiryId} to ${display}.`;
}
export async function resolveCampaignAndOwnerFields(args) {
    const out = { body: {} };
    if (args.campaignId !== undefined || args.campaignActivityId !== undefined) {
        if (args.campaignId === undefined && args.campaignActivityId !== undefined) {
            // Activity-only — accept and trust. We could look up the parent
            // campaign for validation, but that's a needless round-trip.
            out.body.CampaignActivityId = args.campaignActivityId;
        }
        else if (args.campaignId !== undefined) {
            const activity = await resolveCampaignActivity(args.campaignId, args.campaignActivityId);
            out.activity = activity;
            out.body.CampaignActivityId = activity.CampaignActivityId;
        }
    }
    if (args.assignedTo !== undefined && args.assignedTo !== "") {
        const { codes, display } = await resolveUserCodes([args.assignedTo]);
        out.body.AssignedTo = codes[0];
        out.assignedDisplay = display;
    }
    return out;
}
//# sourceMappingURL=campaign-enquiry.js.map