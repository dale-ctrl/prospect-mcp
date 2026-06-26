/**
 * Quote document generation + email tools.
 *
 * Wraps the 6-call sequence Prospect's own UI uses to render and send a quote email,
 * captured from a HAR on 2026-04-23. See src/tools/MESSAGING-NOTES.md for the full
 * trail and why earlier single-POST approaches silently no-opped.
 *
 * Canonical flow (steps 4–5 skipped when `attachPdf: false`):
 *
 *   1. POST /{entitySet}({id})/MergeData()     — render email subject + body from template
 *   2. POST /{entitySet}({id})/MergeData()     — render user signature, append to body
 *   3. POST /{entitySet}({id})/MergeData()     — render attachment filename (if attaching)
 *   4. POST /Documents                          — create PDF-attachment shell (StatusFlag=D)
 *   5. POST /DocumentAttachments/AttachExistingDocument
 *   6. POST /{entitySet}({id})/SendMessage()   — real send, body { ToAddress, Subject, MessageBody }
 *
 * Helper `sendEntityEmail` is entity-agnostic so the same composition can be reused
 * for Contact/Division/Opportunity/Order/Invoice/Problem/Job once those endpoints
 * are confirmed to accept the same body shape on SendMessage.
 */
import { z } from "zod";
import { writeFileSync, mkdirSync, statSync } from "fs";
import { dirname, resolve } from "path";
import { getClient } from "../client.js";
// ─── Low-level helpers (reusable across entities) ─────────────
/** Parse a MergeResponse into a flat {Name: Value} object. */
function parseMergeResponse(resp) {
    const out = {};
    const arr = resp?.value;
    if (!Array.isArray(arr))
        return out;
    for (const entry of arr) {
        if (entry?.Name)
            out[entry.Name] = entry.Value ?? "";
    }
    return out;
}
/** POST /{entitySet}({id})/MergeData() — server-side template render of Data values. */
async function mergeData(entitySet, entityId, data, fromTemplate) {
    const client = getClient();
    const body = { Data: data };
    if (fromTemplate?.length)
        body.FromTemplate = fromTemplate;
    const resp = await client.invokeAction(entitySet, entityId, "MergeData", body);
    return parseMergeResponse(resp);
}
/** Map an entity set to the Document FK column that anchors the attachment to it. */
function inferDocumentParentKeyField(entitySet) {
    // Document has FK columns for Quote/Contact/Lead/Problem/ContractSchedule/Inventory/Division
    // (see prospect-metadata.xml lines 4497-4522). Translate plural entity-set names.
    const map = {
        Quotes: "QuoteId",
        Divisions: "DivisionId",
        Contacts: "ContactId",
        Leads: "LeadId",
        Problems: "ProblemId",
    };
    return map[entitySet] ?? "QuoteId";
}
/** The entity-agnostic 7-step send composition (matching the Prospect365 UI HAR). */
export async function sendEntityEmail(args) {
    const { entitySet, entityId } = args;
    const client = getClient();
    // ── Step 0 (prep): read the email template's raw Subject string so we can pass it into
    // MergeData with placeholders intact. The server won't derive subject from a `template:` sigil —
    // it only renders plain strings with {Field} placeholders. Skip if caller supplied their own.
    let subject = args.subject;
    let body = args.messageBody;
    if (!subject) {
        try {
            const tpl = await client.getById("DocumentTemplates", `'${args.emailTemplateCode}'`, "$select=Subject");
            subject = tpl.Subject ?? ""; // still a template string with {QuoteId} etc — rendered in step 1
        }
        catch {
            subject = ""; // will be rendered as empty by step 1; SendMessage will reject at that point
        }
    }
    // ── Step 1: render Subject + Body via MergeData.
    // Subject may contain placeholders like "{QuoteId}" — MergeData resolves these.
    // Body comes from `template:<code>` sigil which tells the server "fetch from this template's body".
    if (!args.messageBody || subject?.includes("{")) {
        const rendered = await mergeData(entitySet, entityId, {
            Subject: subject ?? "",
            Body: `template:${args.emailTemplateCode}`,
        }, ["Body"]);
        subject = rendered.Subject ?? subject ?? "";
        body = args.messageBody ?? rendered.Body ?? "";
    }
    // ── Step 2: append the user's signature (skip only if caller supplied a complete body)
    if (!args.messageBody) {
        const sigResp = await mergeData(entitySet, entityId, { Signature: "signature:1" }, ["Signature"]);
        const sig = sigResp.Signature ?? "";
        if (sig)
            body = (body ?? "") + sig;
    }
    // ── Step 3–5: create + attach the PDF (skipped when attachment is omitted)
    let documentId;
    let attachmentFilename;
    let attachmentId; // from AttachExistingDocument response
    if (args.attachment) {
        const nameTemplate = args.attachment.documentNameTemplate ?? `Quote Document ${entityId}`;
        const nameResp = await mergeData(entitySet, entityId, { DocumentName: nameTemplate });
        const resolvedName = nameResp.DocumentName || nameTemplate;
        const parentKey = args.documentParentKeyField ?? inferDocumentParentKeyField(entitySet);
        const doc = await client.post("Documents", {
            [parentKey]: entityId,
            DocumentTypeCode: args.attachment.documentTemplateCode,
            Description: resolvedName,
            DocumentDate: new Date().toISOString(),
            StatusFlag: "D",
        });
        if (!doc.DocumentId) {
            throw new Error(`Document creation returned no DocumentId. Raw: ${JSON.stringify(doc)}`);
        }
        documentId = doc.DocumentId;
        attachmentFilename = `${resolvedName}.pdf`;
        const att = await client.invokeCollectionAction("DocumentAttachments", "AttachExistingDocument", {
            AttachmentId: "",
            DocumentNos: [{ DocumentNo: documentId, Name: attachmentFilename }],
            Pdf: true,
        });
        attachmentId = att?.Id;
        if (!attachmentId) {
            throw new Error(`AttachExistingDocument returned no Id. Raw: ${JSON.stringify(att)}`);
        }
    }
    // ── Step 6: resolve recipient (if caller didn't supply one) then fire SendMessage
    let to = args.to;
    if (!to && args.defaultToResolver) {
        to = (await args.defaultToResolver()) || "";
    }
    const sendBody = {
        ToAddress: to ?? "",
        Subject: subject ?? "",
        MessageBody: body ?? "",
        CreateDocument: true, // persists the sent email as a Document for the Activity Feed
        CcAddress: args.cc ?? "",
        BccAddress: args.bcc ?? "",
        DocumentTypeCode: args.emailTemplateCode, // email template code (for logging/threading), NOT the PDF template
        IsAppointment: false,
        SendToSelf: false,
    };
    if (attachmentId && documentId && attachmentFilename) {
        sendBody.AttachmentId = attachmentId;
        sendBody.NewDocumentIds = [documentId];
        sendBody.FileNames = [attachmentFilename];
    }
    const sendResp = await client.invokeAction(entitySet, entityId, "SendMessage", sendBody);
    const sendResultValue = typeof sendResp === "number"
        ? sendResp
        : typeof sendResp?.value === "number"
            ? sendResp.value
            : 0;
    if (sendResultValue === 0) {
        throw new Error(`SendMessage returned value:0 — real send did not fire. Check: ` +
            `(a) PROSPECT_BASE_URL points at the regional write host (current: ${process.env.PROSPECT_BASE_URL || "default"}), ` +
            `(b) PROSPECT_PROFILE_ID is set correctly for the PAT's user (current: ${process.env.PROSPECT_PROFILE_ID ? "set" : "UNSET — sends will always no-op"}), ` +
            `(c) the email template '${args.emailTemplateCode}' exists and has AllowAtQuote=1, ` +
            `(d) the ToAddress resolved to something non-empty (got: "${to ?? ""}").`);
    }
    return {
        entitySet,
        entityId,
        attachmentDocumentId: documentId,
        sentMessageDocumentId: sendResultValue,
        subject: subject ?? "",
        to: to ?? "",
        cc: args.cc,
        emailTemplateCode: args.emailTemplateCode,
        attachmentDocumentTemplateCode: args.attachment?.documentTemplateCode,
        attachmentFilename,
    };
}
export async function getDocumentContent(documentId) {
    const client = getClient();
    // Fetch metadata in parallel with the raw bytes
    const [meta, rawRes] = await Promise.all([
        client
            .getById("Documents", documentId, "$select=DocumentId,FileName,FileExtension,Description,Created")
            .catch(() => ({})),
        fetchDocumentRaw(documentId),
    ]);
    const mimeType = rawRes.contentType || mimeFromExt(meta.FileExtension ?? "bin");
    const filename = resolveFilename(meta, documentId, mimeType);
    return {
        documentId,
        bytes: rawRes.bytes,
        filename,
        mimeType,
        created: meta.Created ?? null,
        description: meta.Description ?? null,
    };
}
async function fetchDocumentRaw(documentId) {
    const client = getClient();
    // Use the public rawFetch on the client — it adds auth headers + retry behaviour.
    const { bytes, contentType } = await client.getBinary(`Documents(${documentId})/Raw()`);
    return { bytes, contentType };
}
function resolveFilename(meta, documentId, mimeType) {
    if (meta.FileName) {
        if (/\.[a-z0-9]{2,5}$/i.test(meta.FileName))
            return meta.FileName;
        const ext = meta.FileExtension?.toLowerCase() ?? extFromMime(mimeType);
        return `${meta.FileName}.${ext}`;
    }
    const base = (meta.Description ?? `document-${documentId}`).replace(/[^\w\- ]+/g, "").trim();
    const ext = meta.FileExtension?.toLowerCase() ?? extFromMime(mimeType);
    return `${base || `document-${documentId}`}.${ext}`;
}
function extFromMime(mime) {
    if (mime.includes("pdf"))
        return "pdf";
    if (mime.includes("wordprocessingml"))
        return "docx";
    if (mime.includes("msword"))
        return "doc";
    if (mime.includes("spreadsheetml"))
        return "xlsx";
    if (mime.includes("html"))
        return "html";
    if (mime.includes("text/plain"))
        return "txt";
    return "bin";
}
function mimeFromExt(ext) {
    switch (ext.toLowerCase()) {
        case "pdf":
            return "application/pdf";
        case "docx":
            return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        case "doc":
            return "application/msword";
        case "xlsx":
            return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        case "xls":
            return "application/vnd.ms-excel";
        case "html":
        case "htm":
            return "text/html";
        case "txt":
            return "text/plain";
        default:
            return "application/octet-stream";
    }
}
// ─── Schemas ──────────────────────────────────────────────────
export const sendQuoteEmailSchema = z.object({
    quoteId: z.number().int().positive().describe("The QuoteId to email."),
    to: z.string().optional().describe("[IGNORED — SAFETY GATE] Accepted for compatibility only. The recipient is unconditionally overridden to the authenticated API user's email. To email a customer, use the ProspectCRM UI."),
    cc: z.string().optional().describe("[IGNORED — SAFETY GATE] Accepted for compatibility only. Forced to empty on every send."),
    bcc: z.string().optional().describe("[IGNORED — SAFETY GATE] Accepted for compatibility only. Forced to empty on every send."),
    subject: z.string().optional().describe("Email subject. If omitted, rendered from the email template's Subject field with placeholders like {QuoteId} resolved."),
    messageBody: z.string().optional().describe("Email body as HTML. If omitted, rendered from the email template + the user's signature."),
    emailTemplateCode: z.string().optional().default("_EMLQC").describe("DocumentTypeCode of the email template (DocumentTemplates where AllowAtQuote=1). Defaults to '_EMLQC'."),
    quoteTemplateCode: z.string().optional().default("_QUOTE").describe("DocumentTypeCode of the PDF template attached to the email. Defaults to '_QUOTE'. Ignored when attachPdf=false."),
    attachPdf: z.boolean().optional().default(true).describe("Whether to generate and attach the quote PDF. Defaults to true."),
    attachmentNameTemplate: z
        .string()
        .optional()
        .default("{Division.Name} - {Description} - {Lead.LeadId} - {QuoteId}")
        .describe("Template for the PDF attachment filename (the part before `.pdf`). Standard Prospect MergeData placeholders work, including dot-path navigation: `{QuoteId}`, `{Description}`, `{Division.Name}`, `{Lead.LeadId}`, etc. — same syntax as the document-template settings in the Prospect UI. The server resolves the placeholders against the quote's joined data, then `.pdf` is appended. Default matches WCG's standard document-template pattern. Pass a different string to override per-call."),
});
export const listQuoteTemplatesSchema = z.object({
    kind: z.enum(["email", "pdf", "all"]).optional().default("all").describe("Filter: 'email' = cover-email templates (Email=1), 'pdf' = quote-document templates (Email=0), 'all' = both (default)."),
});
export async function listQuoteTemplates(input) {
    const args = listQuoteTemplatesSchema.parse(input);
    const client = getClient();
    const result = await client.get("DocumentTemplates", "$filter=AllowAtQuote eq 1 and Obsolete eq 0&$select=DocumentTypeCode,Description,Subject,Email,AutopopulateToAddress&$orderby=Sequence&$top=100");
    const all = result.value ?? [];
    const emails = all.filter((t) => t.Email === 1);
    const pdfs = all.filter((t) => t.Email === 0);
    const lines = [`## Quote templates on this tenant`, ""];
    if (args.kind === "email" || args.kind === "all") {
        lines.push(`### Email cover templates (use as \`emailTemplateCode\`)`);
        if (emails.length === 0)
            lines.push("_(none)_");
        for (const t of emails) {
            const subj = t.Subject ? ` — subject: \`${t.Subject}\`` : "";
            lines.push(`- \`${t.DocumentTypeCode}\` — ${t.Description}${subj}`);
        }
        lines.push("");
    }
    if (args.kind === "pdf" || args.kind === "all") {
        lines.push(`### PDF/document templates (use as \`quoteTemplateCode\`)`);
        if (pdfs.length === 0)
            lines.push("_(none)_");
        for (const t of pdfs) {
            lines.push(`- \`${t.DocumentTypeCode}\` — ${t.Description}`);
        }
        lines.push("");
    }
    lines.push(`Pass any of the codes above to \`send_quote_email\` via \`emailTemplateCode\` and/or \`quoteTemplateCode\`. Defaults are \`_EMLQC\` (email) and \`_QUOTE\` (PDF).`);
    return lines.join("\n");
}
export const getMergeOutputSchema = z.object({
    documentId: z.number().int().positive().describe("DocumentId of the quote document — use attachmentDocumentId from send_quote_email's return payload. The PDF-rendered version is generated on-the-fly by the email send; this tool returns the source document (typically .docx) via GET /Documents({id})/Raw()."),
    saveTo: z.string().optional().describe("Optional file path (file or directory). If provided, bytes are written to disk and only metadata is returned. When omitted, base64 bytes are returned inline — keep in mind real quote docs are 40–100 KB."),
});
// ─── Handlers ─────────────────────────────────────────────────
export async function sendQuoteEmail(input) {
    const args = sendQuoteEmailSchema.parse(input);
    const client = getClient();
    // ─── SAFETY GATE ────────────────────────────────────────────────
    // This MCP must never email customers. Every send is unconditionally
    // redirected to the API user's email, regardless of caller intent.
    // No env var, flag, or parameter bypasses this — to email a customer,
    // use the ProspectCRM UI. If the API user's email cannot be resolved,
    // we refuse the send rather than fall back to anything.
    const apiUserEmail = await client.getApiUserEmail();
    const callerTo = args.to;
    const callerCc = args.cc;
    const callerBcc = args.bcc;
    if (callerTo || callerCc || callerBcc) {
        console.error(`send_quote_email: recipient overridden — caller requested ` +
            `to="${callerTo ?? ""}" cc="${callerCc ?? ""}" bcc="${callerBcc ?? ""}", ` +
            `sending to <${apiUserEmail}> per safety policy.`);
    }
    const safeTo = apiUserEmail;
    const safeCc = "";
    const safeBcc = "";
    // The contact-email resolver is dead code under the safety gate (safeTo
    // is always non-empty) but kept so sendEntityEmail's signature is unchanged.
    const resolveContactEmail = async () => {
        const q = await client.getById("Quotes", args.quoteId, "$expand=Contact($select=Email)&$select=QuoteId,ContactId");
        const email = q.Contact?.Email?.trim() ?? "";
        if (!email) {
            throw new Error(`Quote ${args.quoteId}'s primary contact has no email on file. ` +
                `Pass a 'to' argument explicitly, or edit the contact in Prospect first.`);
        }
        return email;
    };
    const result = await sendEntityEmail({
        entitySet: "Quotes",
        entityId: args.quoteId,
        to: safeTo,
        cc: safeCc,
        bcc: safeBcc,
        subject: args.subject,
        messageBody: args.messageBody,
        emailTemplateCode: args.emailTemplateCode,
        attachment: args.attachPdf
            ? { documentTemplateCode: args.quoteTemplateCode, documentNameTemplate: args.attachmentNameTemplate }
            : undefined,
        defaultToResolver: resolveContactEmail,
    });
    // Best-effort enrichment: the SendMessage return value is the DocumentId of the
    // sent-email record (because CreateDocument: true is in the body). Fetch that
    // row to surface the server-resolved Sent date and From address.
    let sentAt = null;
    let fromAddress = null;
    try {
        const sent = await client.getById("Documents", result.sentMessageDocumentId, "$select=DocumentId,Created,FromAddress,DocumentTypeCode,EmailSubject");
        sentAt = sent.Created ?? null;
        fromAddress = sent.FromAddress ?? null;
    }
    catch { /* enrichment is best-effort */ }
    const safetyBanner = callerTo || callerCc || callerBcc
        ? `⚠️ SAFETY GATE: caller-supplied to/cc/bcc were ignored. Email was sent to the API user only.`
        : `🔒 SAFETY GATE: this MCP only emails the API user. Email was sent to the API user.`;
    return [
        safetyBanner,
        ``,
        `Email sent for Quote #${args.quoteId}`,
        ``,
        `**Sent-email DocumentId:** ${result.sentMessageDocumentId}`,
        result.attachmentDocumentId !== undefined ? `**Attachment DocumentId:** ${result.attachmentDocumentId} — pass this to get_merge_output` : "",
        `**Email template:** ${result.emailTemplateCode}`,
        result.attachmentDocumentTemplateCode ? `**PDF template:** ${result.attachmentDocumentTemplateCode}` : `**PDF template:** (none — attachPdf=false)`,
        result.attachmentFilename ? `**Attachment filename:** ${result.attachmentFilename}` : "",
        `**Subject:** ${result.subject}`,
        `**To:** ${result.to}  ← API user (safety gate)`,
        fromAddress ? `**From:** ${fromAddress}` : "",
        sentAt ? `**Sent:** ${sentAt}` : "",
        ``,
        result.attachmentDocumentId !== undefined
            ? `To retrieve the attached document, call get_merge_output with documentId=${result.attachmentDocumentId}.`
            : `No PDF attached (attachPdf=false).`,
    ]
        .filter(Boolean)
        .join("\n");
}
export async function getMergeOutput(input) {
    const args = getMergeOutputSchema.parse(input);
    const result = await getDocumentContent(args.documentId);
    const header = [
        `# Document ${result.documentId} content`,
        ``,
        `**Filename:** ${result.filename}`,
        `**MIME type:** ${result.mimeType}`,
        `**Size:** ${result.bytes.length.toLocaleString()} bytes`,
        result.description ? `**Description:** ${result.description}` : "",
        result.created ? `**Created:** ${result.created}` : "",
    ].filter(Boolean);
    if (args.saveTo) {
        const finalPath = resolveSaveTarget(args.saveTo, result.filename);
        mkdirSync(dirname(finalPath), { recursive: true });
        writeFileSync(finalPath, result.bytes);
        return [...header, ``, `**Saved to:** ${finalPath}`].join("\n");
    }
    return [
        ...header,
        ``,
        `## Content (base64)`,
        ``,
        result.bytes.length > 0 ? result.bytes.toString("base64") : "(empty — the server returned no content)",
    ].join("\n");
}
function resolveSaveTarget(saveTo, filename) {
    const abs = resolve(saveTo);
    try {
        if (statSync(abs).isDirectory()) {
            return resolve(abs, filename);
        }
    }
    catch { /* path doesn't exist, treat as file */ }
    return abs;
}
//# sourceMappingURL=quote-messaging.js.map