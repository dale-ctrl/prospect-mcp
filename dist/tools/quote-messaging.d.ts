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
    /**
     * Which Document FK column to populate when creating the PDF-attachment shell
     * in step 4. Quote merges write `QuoteId`; Division merges write `DivisionId`.
     * Defaults are inferred from `entitySet` — override if the mapping isn't trivial.
     */
    documentParentKeyField?: string;
}
/** The entity-agnostic 7-step send composition (matching the Prospect365 UI HAR). */
export declare function sendEntityEmail(args: SendEntityEmailArgs): Promise<SendEntityEmailResult>;
export interface DocumentContentResult {
    documentId: number;
    bytes: Buffer;
    filename: string;
    mimeType: string;
    created: string | null;
    description: string | null;
}
export declare function getDocumentContent(documentId: number): Promise<DocumentContentResult>;
export declare const sendQuoteEmailSchema: z.ZodObject<{
    quoteId: z.ZodNumber;
    to: z.ZodOptional<z.ZodString>;
    cc: z.ZodOptional<z.ZodString>;
    bcc: z.ZodOptional<z.ZodString>;
    subject: z.ZodOptional<z.ZodString>;
    messageBody: z.ZodOptional<z.ZodString>;
    emailTemplateCode: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    quoteTemplateCode: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    attachPdf: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    attachmentNameTemplate: z.ZodDefault<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    quoteId: number;
    emailTemplateCode: string;
    quoteTemplateCode: string;
    attachPdf: boolean;
    attachmentNameTemplate: string;
    cc?: string | undefined;
    subject?: string | undefined;
    to?: string | undefined;
    bcc?: string | undefined;
    messageBody?: string | undefined;
}, {
    quoteId: number;
    cc?: string | undefined;
    emailTemplateCode?: string | undefined;
    subject?: string | undefined;
    to?: string | undefined;
    bcc?: string | undefined;
    messageBody?: string | undefined;
    quoteTemplateCode?: string | undefined;
    attachPdf?: boolean | undefined;
    attachmentNameTemplate?: string | undefined;
}>;
export declare const listQuoteTemplatesSchema: z.ZodObject<{
    kind: z.ZodDefault<z.ZodOptional<z.ZodEnum<["email", "pdf", "all"]>>>;
}, "strip", z.ZodTypeAny, {
    kind: "all" | "email" | "pdf";
}, {
    kind?: "all" | "email" | "pdf" | undefined;
}>;
export declare function listQuoteTemplates(input: z.input<typeof listQuoteTemplatesSchema>): Promise<string>;
export declare const getMergeOutputSchema: z.ZodObject<{
    documentId: z.ZodNumber;
    saveTo: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    documentId: number;
    saveTo?: string | undefined;
}, {
    documentId: number;
    saveTo?: string | undefined;
}>;
export declare function sendQuoteEmail(input: z.input<typeof sendQuoteEmailSchema>): Promise<string>;
export declare function getMergeOutput(input: z.input<typeof getMergeOutputSchema>): Promise<string>;
export {};
//# sourceMappingURL=quote-messaging.d.ts.map