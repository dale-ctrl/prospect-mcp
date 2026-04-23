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

// ─── Types ────────────────────────────────────────────────────

interface ODataScalarResponse<T> {
  "@odata.context"?: string;
  value: T;
}

interface MergeResponseEntry {
  Name: string;
  Value: string;
  Format?: unknown;
  EmptyFields?: boolean;
}

interface MergeResponse {
  "@odata.context"?: string;
  value: MergeResponseEntry[];
}

interface DocumentRow {
  DocumentId?: number;
  MailMergeId?: number | null;
  DocumentTypeCode?: string;
  QuoteId?: number | null;
  EmailSubject?: string | null;
  ToAddress?: string | null;
  FromAddress?: string | null;
  CcAddresses?: string | null;
  Description?: string | null;
  FileName?: string | null;
  FileExtension?: string | null;
  DocumentDate?: string | null;
  Created?: string | null;
  StatusFlag?: string;
}

interface DocumentTemplateSummary {
  DocumentTypeCode?: string;
  Description?: string;
  DocumentName?: string;
}

interface DocumentSummary {
  ToAddress?: string;
  FromAddress?: string;
  CcAddresses?: string;
  EmailSubject?: string;
  FileName?: string;
  FileExtension?: string;
  DocumentDate?: string;
}

interface MailMergeRow {
  MailMergeId?: number;
  Description?: string;
  SentDateTime?: string;
  SentBy?: string;
  Created?: string;
  DocumentType?: DocumentTemplateSummary | null;
  Documents?: DocumentSummary[];
}

interface MailMergeBlobRow {
  MailMergeId?: number;
  DocumentBlob?: string; // base64 in JSON
  Created?: string;
}

interface QuoteForSend {
  QuoteId: number;
  ContactId?: number | null;
  Contact?: { Email?: string | null } | null;
}

export interface SendEntityEmailResult {
  entitySet: string;
  entityId: number;
  /** Document id of the PDF-attachment shell created in step 4. Feed to get_merge_output for the file. */
  attachmentDocumentId?: number;
  /** Document id of the sent-email record that SendMessage created (via CreateDocument:true). */
  sentMessageDocumentId: number;
  subject: string;
  to: string;
  cc?: string;
  emailTemplateCode: string;
  attachmentDocumentTemplateCode?: string;
  attachmentFilename?: string;
}

// ─── Low-level helpers (reusable across entities) ─────────────

/** Parse a MergeResponse into a flat {Name: Value} object. */
function parseMergeResponse(resp: MergeResponse | unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const arr = (resp as MergeResponse | undefined)?.value;
  if (!Array.isArray(arr)) return out;
  for (const entry of arr) {
    if (entry?.Name) out[entry.Name] = entry.Value ?? "";
  }
  return out;
}

/** POST /{entitySet}({id})/MergeData() — server-side template render of Data values. */
async function mergeData(
  entitySet: string,
  entityId: number,
  data: Record<string, unknown>,
  fromTemplate?: string[],
): Promise<Record<string, string>> {
  const client = getClient();
  const body: Record<string, unknown> = { Data: data };
  if (fromTemplate?.length) body.FromTemplate = fromTemplate;
  const resp = await client.invokeAction<MergeResponse>(entitySet, entityId, "MergeData", body);
  return parseMergeResponse(resp);
}

interface SendEntityEmailArgs {
  entitySet: string;
  entityId: number;
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  messageBody?: string;
  emailTemplateCode: string;
  attachment?: {
    documentTemplateCode: string;
    documentNameTemplate?: string;
  };
  defaultToResolver?: () => Promise<string>;
}

interface AttachmentResponse {
  Id?: string;
  SuccessFlag?: boolean;
  Attachments?: Array<{ Name?: string; Size?: number }>;
}

/** The entity-agnostic 7-step send composition (matching the Prospect365 UI HAR). */
export async function sendEntityEmail(args: SendEntityEmailArgs): Promise<SendEntityEmailResult> {
  const { entitySet, entityId } = args;
  const client = getClient();

  // ── Step 0 (prep): read the email template's raw Subject string so we can pass it into
  // MergeData with placeholders intact. The server won't derive subject from a `template:` sigil —
  // it only renders plain strings with {Field} placeholders. Skip if caller supplied their own.
  let subject = args.subject;
  let body = args.messageBody;

  if (!subject) {
    try {
      const tpl = await client.getById<{ Subject?: string }>(
        "DocumentTemplates",
        `'${args.emailTemplateCode}'`,
        "$select=Subject",
      );
      subject = tpl.Subject ?? ""; // still a template string with {QuoteId} etc — rendered in step 1
    } catch {
      subject = ""; // will be rendered as empty by step 1; SendMessage will reject at that point
    }
  }

  // ── Step 1: render Subject + Body via MergeData.
  // Subject may contain placeholders like "{QuoteId}" — MergeData resolves these.
  // Body comes from `template:<code>` sigil which tells the server "fetch from this template's body".
  if (!args.messageBody || subject?.includes("{")) {
    const rendered = await mergeData(
      entitySet,
      entityId,
      {
        Subject: subject ?? "",
        Body: `template:${args.emailTemplateCode}`,
      },
      ["Body"],
    );
    subject = rendered.Subject ?? subject ?? "";
    body = args.messageBody ?? rendered.Body ?? "";
  }

  // ── Step 2: append the user's signature (skip only if caller supplied a complete body)
  if (!args.messageBody) {
    const sigResp = await mergeData(entitySet, entityId, { Signature: "signature:1" }, ["Signature"]);
    const sig = sigResp.Signature ?? "";
    if (sig) body = (body ?? "") + sig;
  }

  // ── Step 3–5: create + attach the PDF (skipped when attachment is omitted)
  let documentId: number | undefined;
  let attachmentFilename: string | undefined;
  let attachmentId: string | undefined; // from AttachExistingDocument response

  if (args.attachment) {
    const nameTemplate = args.attachment.documentNameTemplate ?? `Quote Document ${entityId}`;
    const nameResp = await mergeData(entitySet, entityId, { DocumentName: nameTemplate });
    const resolvedName = nameResp.DocumentName || nameTemplate;

    const doc = await client.post<DocumentRow>("Documents", {
      QuoteId: entityId,
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

    const att = await client.invokeCollectionAction<AttachmentResponse>(
      "DocumentAttachments",
      "AttachExistingDocument",
      {
        AttachmentId: "",
        DocumentNos: [{ DocumentNo: documentId, Name: attachmentFilename }],
        Pdf: true,
      },
    );
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

  const sendBody: Record<string, unknown> = {
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

  const sendResp = await client.invokeAction<ODataScalarResponse<number> | number>(
    entitySet,
    entityId,
    "SendMessage",
    sendBody,
  );
  const sendResultValue =
    typeof sendResp === "number"
      ? sendResp
      : typeof sendResp?.value === "number"
      ? sendResp.value
      : 0;

  if (sendResultValue === 0) {
    throw new Error(
      `SendMessage returned value:0 — real send did not fire. Check: ` +
        `(a) PROSPECT_BASE_URL points at the regional write host (current: ${process.env.PROSPECT_BASE_URL || "default"}), ` +
        `(b) PROSPECT_PROFILE_ID is set correctly for the PAT's user (current: ${process.env.PROSPECT_PROFILE_ID ? "set" : "UNSET — sends will always no-op"}), ` +
        `(c) the email template '${args.emailTemplateCode}' exists and has AllowAtQuote=1, ` +
        `(d) the ToAddress resolved to something non-empty (got: "${to ?? ""}").`,
    );
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

// ─── Document raw-content retrieval ───────────────────────────
// Prospect stores the quote source document (the DOCX from which the PDF is
// rendered on email attach) reachable via the bound function
// `GET /Documents({id})/Raw()`. That returns the raw file bytes with a proper
// Content-Type header. A "MailMergeBlob" does not get created by this send
// flow — earlier assumptions (from Swagger / metadata inspection) were wrong.

export interface DocumentContentResult {
  documentId: number;
  bytes: Buffer;
  filename: string;
  mimeType: string;
  created: string | null;
  description: string | null;
}

export async function getDocumentContent(documentId: number): Promise<DocumentContentResult> {
  const client = getClient();

  // Fetch metadata in parallel with the raw bytes
  const [meta, rawRes] = await Promise.all([
    client
      .getById<DocumentRow>(
        "Documents",
        documentId,
        "$select=DocumentId,FileName,FileExtension,Description,Created",
      )
      .catch(() => ({} as DocumentRow)),
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

async function fetchDocumentRaw(documentId: number): Promise<{ bytes: Buffer; contentType: string }> {
  const client = getClient();
  // Use the public rawFetch on the client — it adds auth headers + retry behaviour.
  const { bytes, contentType } = await client.getBinary(
    `Documents(${documentId})/Raw()`,
  );
  return { bytes, contentType };
}

function resolveFilename(meta: DocumentRow, documentId: number, mimeType: string): string {
  if (meta.FileName) {
    if (/\.[a-z0-9]{2,5}$/i.test(meta.FileName)) return meta.FileName;
    const ext = meta.FileExtension?.toLowerCase() ?? extFromMime(mimeType);
    return `${meta.FileName}.${ext}`;
  }
  const base = (meta.Description ?? `document-${documentId}`).replace(/[^\w\- ]+/g, "").trim();
  const ext = meta.FileExtension?.toLowerCase() ?? extFromMime(mimeType);
  return `${base || `document-${documentId}`}.${ext}`;
}

function extFromMime(mime: string): string {
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("wordprocessingml")) return "docx";
  if (mime.includes("msword")) return "doc";
  if (mime.includes("spreadsheetml")) return "xlsx";
  if (mime.includes("html")) return "html";
  if (mime.includes("text/plain")) return "txt";
  return "bin";
}

function mimeFromExt(ext: string): string {
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
  to: z.string().optional().describe("Recipient email. Defaults to the quote's primary contact email."),
  cc: z.string().optional().describe("Cc address(es). Comma-separated if multiple."),
  bcc: z.string().optional().describe("Bcc address(es). Comma-separated if multiple. Defaults to empty (no Bcc)."),
  subject: z.string().optional().describe("Email subject. If omitted, rendered from the email template's Subject field with placeholders like {QuoteId} resolved."),
  messageBody: z.string().optional().describe("Email body as HTML. If omitted, rendered from the email template + the user's signature."),
  emailTemplateCode: z.string().optional().default("_EMLQC").describe("DocumentTypeCode of the email template (DocumentTemplates where AllowAtQuote=1). Defaults to '_EMLQC'."),
  quoteTemplateCode: z.string().optional().default("_QUOTE").describe("DocumentTypeCode of the PDF template attached to the email. Defaults to '_QUOTE'. Ignored when attachPdf=false."),
  attachPdf: z.boolean().optional().default(true).describe("Whether to generate and attach the quote PDF. Defaults to true."),
});

export const listQuoteTemplatesSchema = z.object({
  kind: z.enum(["email", "pdf", "all"]).optional().default("all").describe("Filter: 'email' = cover-email templates (Email=1), 'pdf' = quote-document templates (Email=0), 'all' = both (default)."),
});

export async function listQuoteTemplates(
  input: z.input<typeof listQuoteTemplatesSchema>,
): Promise<string> {
  const args = listQuoteTemplatesSchema.parse(input);
  const client = getClient();

  const result = await client.get<{
    DocumentTypeCode: string;
    Description: string;
    Subject: string | null;
    Email: number;
    AutopopulateToAddress: boolean;
  }>(
    "DocumentTemplates",
    "$filter=AllowAtQuote eq 1 and Obsolete eq 0&$select=DocumentTypeCode,Description,Subject,Email,AutopopulateToAddress&$orderby=Sequence&$top=100",
  );

  const all = result.value ?? [];
  const emails = all.filter((t) => t.Email === 1);
  const pdfs = all.filter((t) => t.Email === 0);

  const lines: string[] = [`## Quote templates on this tenant`, ""];

  if (args.kind === "email" || args.kind === "all") {
    lines.push(`### Email cover templates (use as \`emailTemplateCode\`)`);
    if (emails.length === 0) lines.push("_(none)_");
    for (const t of emails) {
      const subj = t.Subject ? ` — subject: \`${t.Subject}\`` : "";
      lines.push(`- \`${t.DocumentTypeCode}\` — ${t.Description}${subj}`);
    }
    lines.push("");
  }

  if (args.kind === "pdf" || args.kind === "all") {
    lines.push(`### PDF/document templates (use as \`quoteTemplateCode\`)`);
    if (pdfs.length === 0) lines.push("_(none)_");
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

export async function sendQuoteEmail(
  input: z.input<typeof sendQuoteEmailSchema>,
): Promise<string> {
  const args = sendQuoteEmailSchema.parse(input);
  const client = getClient();

  // If caller didn't specify `to`, resolve the quote's primary contact email lazily
  // (only if the send flow actually needs it — sendEntityEmail will call this).
  const resolveContactEmail = async (): Promise<string> => {
    const q = await client.getById<QuoteForSend>(
      "Quotes",
      args.quoteId,
      "$expand=Contact($select=Email)&$select=QuoteId,ContactId",
    );
    const email = q.Contact?.Email?.trim() ?? "";
    if (!email) {
      throw new Error(
        `Quote ${args.quoteId}'s primary contact has no email on file. ` +
          `Pass a 'to' argument explicitly, or edit the contact in Prospect first.`,
      );
    }
    return email;
  };

  const result = await sendEntityEmail({
    entitySet: "Quotes",
    entityId: args.quoteId,
    to: args.to,
    cc: args.cc,
    bcc: args.bcc,
    subject: args.subject,
    messageBody: args.messageBody,
    emailTemplateCode: args.emailTemplateCode,
    attachment: args.attachPdf
      ? { documentTemplateCode: args.quoteTemplateCode, documentNameTemplate: `Quote Document {QuoteId}` }
      : undefined,
    defaultToResolver: resolveContactEmail,
  });

  // Best-effort enrichment: the SendMessage return value is the DocumentId of the
  // sent-email record (because CreateDocument: true is in the body). Fetch that
  // row to surface the server-resolved Sent date and From address.
  let sentAt: string | null = null;
  let fromAddress: string | null = null;
  try {
    const sent = await client.getById<DocumentRow>(
      "Documents",
      result.sentMessageDocumentId,
      "$select=DocumentId,Created,FromAddress,DocumentTypeCode,EmailSubject",
    );
    sentAt = sent.Created ?? null;
    fromAddress = sent.FromAddress ?? null;
  } catch { /* enrichment is best-effort */ }

  return [
    `Email sent for Quote #${args.quoteId}`,
    ``,
    `**Sent-email DocumentId:** ${result.sentMessageDocumentId}`,
    result.attachmentDocumentId !== undefined ? `**Attachment DocumentId:** ${result.attachmentDocumentId} — pass this to get_merge_output` : "",
    `**Email template:** ${result.emailTemplateCode}`,
    result.attachmentDocumentTemplateCode ? `**PDF template:** ${result.attachmentDocumentTemplateCode}` : `**PDF template:** (none — attachPdf=false)`,
    result.attachmentFilename ? `**Attachment filename:** ${result.attachmentFilename}` : "",
    `**Subject:** ${result.subject}`,
    `**To:** ${result.to}`,
    result.cc ? `**Cc:** ${result.cc}` : "",
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

export async function getMergeOutput(
  input: z.input<typeof getMergeOutputSchema>,
): Promise<string> {
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

function resolveSaveTarget(saveTo: string, filename: string): string {
  const abs = resolve(saveTo);
  try {
    if (statSync(abs).isDirectory()) {
      return resolve(abs, filename);
    }
  } catch { /* path doesn't exist, treat as file */ }
  return abs;
}
