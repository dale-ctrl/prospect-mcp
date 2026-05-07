/**
 * MCP tool handlers for Document operations.
 * Documents are emails, letters, notes, and files attached to contacts/divisions/quotes/leads.
 */
import { z } from "zod";
export declare const searchDocumentsSchema: z.ZodObject<{
    divisionId: z.ZodOptional<z.ZodNumber>;
    contactId: z.ZodOptional<z.ZodNumber>;
    quoteId: z.ZodOptional<z.ZodNumber>;
    leadId: z.ZodOptional<z.ZodNumber>;
    description: z.ZodOptional<z.ZodString>;
    emailSubject: z.ZodOptional<z.ZodString>;
    dateFrom: z.ZodOptional<z.ZodString>;
    dateTo: z.ZodOptional<z.ZodString>;
    top: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    top: number;
    description?: string | undefined;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    quoteId?: number | undefined;
    contactId?: number | undefined;
    leadId?: number | undefined;
    divisionId?: number | undefined;
    emailSubject?: string | undefined;
}, {
    description?: string | undefined;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    top?: number | undefined;
    quoteId?: number | undefined;
    contactId?: number | undefined;
    leadId?: number | undefined;
    divisionId?: number | undefined;
    emailSubject?: string | undefined;
}>;
export declare const getDocumentSchema: z.ZodObject<{
    documentId: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    documentId: number;
}, {
    documentId: number;
}>;
export declare const getDocumentTypesSchema: z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>;
export declare function searchDocuments(args: z.infer<typeof searchDocumentsSchema>): Promise<string>;
export declare function getDocument(args: z.infer<typeof getDocumentSchema>): Promise<string>;
export declare function getDocumentTypes(): Promise<string>;
//# sourceMappingURL=documents.d.ts.map