/**
 * MCP tool handlers for activity notes (Prospect "Notepads" entity).
 *
 * Notepads back the activity-feed notes you see in the Prospect UI when you
 * open a Division, Contact, Lead, Enquiry, or Quote. The OData entity is
 * `Notepads`; ObjectType + ObjectId is the polymorphic link to the parent
 * record.
 *
 * Write recipe (verified live against the WCG tenant 2026-05-08):
 *
 * - All targets: send `ObjectType` (lowercase: division|contact|lead|enquiry|quote),
 *   `ObjectId` (string-form numeric id), `Text`, plus optional UserCode /
 *   DateTime / Visibility / Pinned / External / Tags / Recall fields.
 * - Parent FK columns (`ContactId`, `DivisionId`, `EnquiryId`) are flagged
 *   `UpdateVisibility="never"` in the metadata, but POST accepts them — and
 *   the activity feed needs them populated for cross-entity rollup. So we
 *   resolve and set them server-side at create time:
 *     · contact note → set ContactId + DivisionId (looked up from Contact)
 *     · lead note    → set DivisionId (looked up from Lead)
 *     · enquiry note → set EnquiryId + DivisionId (looked up from Enquiry)
 *     · quote note   → set DivisionId (looked up from Quote)
 *     · division note → set DivisionId (= the target itself)
 * - If we don't set DivisionId, the note still attaches to the immediate
 *   parent but won't bubble up to the Division activity feed. Real notes
 *   created via the UI always have DivisionId set, so we mirror that.
 */
import { z } from "zod";
export declare const createActivityNoteSchema: z.ZodObject<{
    objectType: z.ZodEnum<["division", "contact", "lead", "enquiry", "quote"]>;
    objectId: z.ZodNumber;
    text: z.ZodString;
    dateTime: z.ZodOptional<z.ZodString>;
    pinned: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    tags: z.ZodOptional<z.ZodString>;
    external: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    visibility: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    recallUser: z.ZodOptional<z.ZodString>;
    recallDateTime: z.ZodOptional<z.ZodString>;
    userCode: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    pinned: boolean;
    objectType: "contact" | "lead" | "division" | "enquiry" | "quote";
    objectId: number;
    text: string;
    external: boolean;
    visibility: number;
    dateTime?: string | undefined;
    tags?: string | undefined;
    recallUser?: string | undefined;
    recallDateTime?: string | undefined;
    userCode?: string | undefined;
}, {
    objectType: "contact" | "lead" | "division" | "enquiry" | "quote";
    objectId: number;
    text: string;
    pinned?: boolean | undefined;
    dateTime?: string | undefined;
    tags?: string | undefined;
    external?: boolean | undefined;
    visibility?: number | undefined;
    recallUser?: string | undefined;
    recallDateTime?: string | undefined;
    userCode?: string | undefined;
}>;
export declare const searchActivityNotesSchema: z.ZodObject<{
    divisionId: z.ZodOptional<z.ZodNumber>;
    contactId: z.ZodOptional<z.ZodNumber>;
    enquiryId: z.ZodOptional<z.ZodNumber>;
    objectType: z.ZodOptional<z.ZodEnum<["division", "contact", "lead", "enquiry", "quote"]>>;
    objectId: z.ZodOptional<z.ZodNumber>;
    user: z.ZodOptional<z.ZodString>;
    pinnedOnly: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    dateFrom: z.ZodOptional<z.ZodString>;
    dateTo: z.ZodOptional<z.ZodString>;
    top: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    top: number;
    pinnedOnly: boolean;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    contactId?: number | undefined;
    divisionId?: number | undefined;
    enquiryId?: number | undefined;
    user?: string | undefined;
    objectType?: "contact" | "lead" | "division" | "enquiry" | "quote" | undefined;
    objectId?: number | undefined;
}, {
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    top?: number | undefined;
    contactId?: number | undefined;
    divisionId?: number | undefined;
    enquiryId?: number | undefined;
    user?: string | undefined;
    objectType?: "contact" | "lead" | "division" | "enquiry" | "quote" | undefined;
    objectId?: number | undefined;
    pinnedOnly?: boolean | undefined;
}>;
export declare function createActivityNote(args: z.infer<typeof createActivityNoteSchema>): Promise<string>;
export declare function searchActivityNotes(args: z.infer<typeof searchActivityNotesSchema>): Promise<string>;
//# sourceMappingURL=notes.d.ts.map