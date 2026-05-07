/**
 * Versa Maintenance — DivisionXtra text-field writers and Division-level
 * document merge.
 *
 * The "Versa Maintenance" tab on the Division UI exposes two custom fields
 * backed by DivisionXtra Standard text slots on this tenant (verified live
 * by Dale on Wimbledon Park Primary School / DivisionId 30479):
 *
 *   - Quantity and Equipment Maintained → DivisionXtra.StandardTextField5
 *   - Total Maintenance Value           → DivisionXtra.StandardTextField6
 *
 * The "Create Versa Maintenance Contract" item in the Division three-dot
 * menu kicks off the same MergeData→Document→AttachExistingDocument→
 * SendMessage sequence the quote-level tools already implement, just bound
 * to /Divisions(id) instead of /Quotes(id). Both `MergeData` and
 * `SendMessage` are confirmed Division-bound actions in
 * reference/prospect-metadata.xml (lines 24049, 24057).
 *
 * The merge_division_document tool keeps the template code generic so it
 * can drive any future Division-level template — Versa is just the first.
 */
import { z } from "zod";
import { getClient } from "../client.js";
import { sendEntityEmail } from "./quote-messaging.js";
// ─── Schemas ─────────────────────────────────────────────────────────────────
export const updateDivisionVersaMaintenanceSchema = z.object({
    divisionId: z.number().int().positive().describe("DivisionId to patch"),
    equipmentMaintained: z.string().optional().describe("Quantity and Equipment Maintained — writes DivisionXtra.StandardTextField5 " +
        "(e.g. '9 x Versa Benchmark Tables')."),
    totalMaintenanceValue: z.union([z.number(), z.string()]).optional().describe("Total Maintenance Value — writes DivisionXtra.StandardTextField6 (text field). " +
        "Numbers are formatted to 2dp without a currency symbol (280 → '280.00'). " +
        "Strings pass through unchanged so callers can supply '£280.00 ex VAT' etc."),
});
export const mergeDivisionDocumentSchema = z.object({
    divisionId: z.number().int().positive().describe("DivisionId the document is being produced for."),
    quoteTemplateCode: z.string().describe("DocumentTypeCode of the document/PDF template to render (e.g. '23caad' for Versa Maintenance Contract). " +
        "Field name kept as `quoteTemplateCode` for consistency with send_quote_email."),
    emailTemplateCode: z.string().optional().describe("DocumentTypeCode of the cover-email template. If omitted, defaults to '_EMLQC' (the same default send_quote_email uses)."),
    emailTo: z.union([z.string(), z.array(z.string())]).optional().describe("[SAFETY GATE] Caller-supplied recipient is logged but ignored — the email is unconditionally " +
        "sent to the API user. The merged document is always attached to the Division regardless. " +
        "Use search_documents({ divisionId, description }) to locate the attached file afterwards."),
    emailSubject: z.string().optional().describe("Email subject. If omitted, rendered from the email template's Subject field with placeholders resolved."),
    contactId: z.number().int().positive().optional().describe("ContactId for the merge context. Division.MergeData fails with 'ContactNotSet' " +
        "without one. The connector PATCHes Division.HiddenContactId to this id around the " +
        "merge sequence then restores the original value. If omitted, auto-resolves to the " +
        "Division's single active contact; errors if the Division has 0 contacts or >1."),
});
// ─── Helpers ─────────────────────────────────────────────────────────────────
/**
 * Format the totalMaintenanceValue argument to a string for storage.
 *
 * Numbers are emitted with exactly 2 decimal places, no currency symbol or
 * thousands separator. Plain numeric strings (e.g. "280", "280.5", "-12.345")
 * are also normalised to 2dp — this matters because some MCP clients
 * serialise tool arguments as JSON strings even when the schema accepts
 * numbers, which is what produced the live "280" (no decimals) regression in
 * round 6. Rich format strings ("£280.00 ex VAT", "$1,200.00") are preserved
 * so callers can hand-format when they want a non-default representation.
 */
export function formatMaintenanceValue(value) {
    if (typeof value === "number") {
        if (!Number.isFinite(value)) {
            throw new Error(`totalMaintenanceValue must be a finite number, got ${value}`);
        }
        return value.toFixed(2);
    }
    // Plain numeric string (digits, optional sign and single decimal point)?
    // Normalise to 2dp. Anything with currency symbols, thousands commas, or
    // surrounding text falls through unchanged.
    const trimmed = value.trim();
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
        const n = Number(trimmed);
        if (Number.isFinite(n))
            return n.toFixed(2);
    }
    return value;
}
/**
 * PATCH the DivisionXtra row for a Division; if the row doesn't exist
 * (HTTP 404), POST a new one keyed by DivisionId.
 *
 * Identical contract to patchDivisionXtraDropdowns in tools/contacts.ts —
 * inlined here rather than exported because the round-2 helper is private
 * to that module. Keep the two in sync.
 */
async function upsertDivisionXtra(divisionId, body) {
    const client = getClient();
    try {
        await client.patch("DivisionXtras", divisionId, body);
    }
    catch (err) {
        const msg = err.message || "";
        if (/HTTP 404/.test(msg)) {
            await client.post("DivisionXtras", {
                DivisionId: divisionId,
                ...body,
            });
        }
        else {
            throw err;
        }
    }
    // Re-read so callers see the row including any server-set fields (LastUpdated etc.)
    const sp = new URLSearchParams();
    sp.set("$filter", `DivisionId eq ${divisionId}`);
    sp.set("$top", "1");
    const result = await client.get("DivisionXtras", sp.toString());
    return result.value[0] ?? { DivisionId: divisionId, ...body };
}
// ─── Handlers ────────────────────────────────────────────────────────────────
export async function updateDivisionVersaMaintenance(input) {
    const args = updateDivisionVersaMaintenanceSchema.parse(input);
    const body = {};
    if (args.equipmentMaintained !== undefined) {
        body.StandardTextField5 = args.equipmentMaintained;
    }
    if (args.totalMaintenanceValue !== undefined) {
        body.StandardTextField6 = formatMaintenanceValue(args.totalMaintenanceValue);
    }
    if (Object.keys(body).length === 0) {
        return JSON.stringify({
            ok: false,
            message: "No Versa fields supplied. Pass equipmentMaintained and/or totalMaintenanceValue.",
        });
    }
    const row = await upsertDivisionXtra(args.divisionId, body);
    return JSON.stringify({
        ok: true,
        divisionId: args.divisionId,
        fieldsUpdated: Object.keys(body),
        row,
    });
}
/**
 * Resolve the ContactId to use for a Division-level merge.
 *
 * Division.MergeData rejects with HTTP 500 / "ContactNotSet" (Budgeting
 * source) when no contact context is set on the Division. Quotes don't have
 * this problem because Quote.ContactId is populated at quote creation, but a
 * Division can have many contacts and the merge needs to be told which one
 * drives addressing/pricing.
 *
 * Strategy:
 *   - If caller supplied contactId, trust it.
 *   - If omitted and the Division has exactly one active contact, use that.
 *   - Otherwise refuse with a clear message — picking arbitrarily would make
 *     the rendered greeting a surprise.
 */
async function resolveDivisionMergeContactId(divisionId, callerContactId) {
    if (callerContactId !== undefined)
        return callerContactId;
    const client = getClient();
    const sp = new URLSearchParams();
    sp.set("$filter", `DivisionId eq ${divisionId} and StatusFlag ne 'D'`);
    sp.set("$select", "ContactId,Forename,Surname");
    sp.set("$orderby", "ContactId");
    sp.set("$top", "5");
    const result = await client.get("Contacts", sp.toString());
    if (result.value.length === 0) {
        throw new Error(`merge_division_document: Division ${divisionId} has no active contacts and no contactId was supplied. ` +
            `Pass contactId explicitly, or create a contact under this Division first.`);
    }
    if (result.value.length > 1) {
        const list = result.value
            .map((c) => `${c.ContactId} (${(c.Forename ?? "").trim()} ${(c.Surname ?? "").trim()})`.trim())
            .join(", ");
        throw new Error(`merge_division_document: Division ${divisionId} has multiple active contacts and contactId was not supplied. ` +
            `Pass contactId explicitly. Candidates (first 5 by id): ${list}.`);
    }
    return result.value[0].ContactId;
}
/**
 * Set `Division.HiddenContactId` to the supplied contactId, run `op`, then
 * restore the original value (whether `op` succeeded or threw).
 *
 * The Prospect UI's "Create Versa Maintenance Contract" menu item appears to
 * temporarily set HiddenContactId before invoking MergeData, then unset it.
 * We mirror that. The metadata flags HiddenContactId as
 * UpdateVisibility="never" but rounds 3 and 5 established that flag is
 * routinely misleading on this tenant.
 */
async function withDivisionMergeContact(divisionId, contactId, op) {
    const client = getClient();
    let originalHiddenContactId = null;
    try {
        const div = await client.getById("Divisions", divisionId, "$select=DivisionId,HiddenContactId");
        originalHiddenContactId = div.HiddenContactId ?? null;
    }
    catch {
        // Best-effort — if we can't read the original, default to null on restore.
    }
    await client.patch("Divisions", divisionId, { HiddenContactId: contactId });
    try {
        return await op();
    }
    finally {
        try {
            await client.patch("Divisions", divisionId, { HiddenContactId: originalHiddenContactId });
        }
        catch (restoreErr) {
            // Don't mask the original op error if there was one. Surface restore
            // failures via stderr so an operator can clean up by hand.
            console.error(`merge_division_document: failed to restore HiddenContactId on Division ${divisionId} ` +
                `(was: ${originalHiddenContactId}). ` +
                `Restore error: ${restoreErr.message}. ` +
                `Reset manually via update_division if it matters.`);
        }
    }
}
export async function mergeDivisionDocument(input) {
    const args = mergeDivisionDocumentSchema.parse(input);
    const client = getClient();
    // SAFETY GATE: same policy as send_quote_email — every send is redirected
    // to the authenticated API user's email, never the caller-supplied address.
    // Verified in send_quote_email at quote-messaging.ts:522-524 (safeTo = apiUserEmail,
    // unconditional). To deliver to a real customer, retrieve the rendered
    // document via get_merge_output(attachmentDocumentId) and email it from
    // outside the MCP, or use the Prospect UI's merge button.
    const apiUserEmail = await client.getApiUserEmail();
    const callerTo = Array.isArray(args.emailTo) ? args.emailTo.join(",") : args.emailTo;
    if (callerTo) {
        console.error(`merge_division_document: recipient overridden — caller requested ` +
            `to="${callerTo}", sending to <${apiUserEmail}> per safety policy.`);
    }
    const emailTemplateCode = args.emailTemplateCode ?? "_EMLQC";
    // Resolve the contact context BEFORE we touch HiddenContactId so we can fail
    // early with a clean error message and leave Division state untouched.
    const contactId = await resolveDivisionMergeContactId(args.divisionId, args.contactId);
    const result = await withDivisionMergeContact(args.divisionId, contactId, () => sendEntityEmail({
        entitySet: "Divisions",
        entityId: args.divisionId,
        to: apiUserEmail,
        cc: "",
        bcc: "",
        subject: args.emailSubject,
        emailTemplateCode,
        attachment: {
            documentTemplateCode: args.quoteTemplateCode,
            documentNameTemplate: `Division Document {DivisionId}`,
        },
        documentParentKeyField: "DivisionId",
    }));
    const safetyBanner = callerTo
        ? "⚠️ SAFETY GATE: caller-supplied emailTo was ignored. Email was sent to the API user only."
        : "🔒 SAFETY GATE: this MCP only emails the API user. Email was sent to the API user.";
    return JSON.stringify({
        ok: true,
        safetyBanner,
        divisionId: args.divisionId,
        quoteTemplateCode: args.quoteTemplateCode,
        emailTemplateCode,
        contactId,
        contactIdResolvedFrom: args.contactId !== undefined ? "caller" : "single-active-contact-on-division",
        attachmentDocumentId: result.attachmentDocumentId,
        sentMessageDocumentId: result.sentMessageDocumentId,
        subject: result.subject,
        to: result.to,
        attachmentFilename: result.attachmentFilename,
    });
}
//# sourceMappingURL=versa-maintenance.js.map