/**
 * Cleanup + hierarchy tools (v1.6.0).
 *
 * Soft-delete tools: `delete_task`, `delete_enquiry`, `delete_activity_note`,
 * `delete_contact`. All four use Prospect's standard pattern — calling
 * `DELETE /<EntitySet>(id)` flips `StatusFlag` from `A` → `D`. The row stays;
 * the Prospect UI treats `StatusFlag = 'D'` as deleted and excludes it from
 * default views. Hard-delete is not exposed via OData. Verified live against
 * the WCG tenant 2026-05-08.
 *
 * `delete_contact` walks active dependencies (Quotes, Leads, Tasks) and
 * refuses with a listing if any are present — protects against orphaning
 * live sales activity. Override is not provided; clean up the dependents
 * first or do it via the Prospect UI.
 *
 * Hierarchy tools: `merge_division`, `move_contact`.
 *
 * `merge_division` walks each child entity attached to the source Division
 * and PATCHes it onto the target. The Prospect OData API exposes a bound
 * `Merge` action on Division but its metadata signature doesn't declare a
 * target parameter — it's not callable from the OData surface in any
 * reliable way. Manual orchestration is the supported path.
 *
 * Children we move:
 *   - Contacts (Contact.DivisionId)
 *   - Tasks (Task.DivisionId)
 *   - Enquiries (Enquiry.DivisionId)
 *   - Notepads filtered to ObjectType=division ObjectId=<source>
 *     (contact-attached notes ride along with their contact via the
 *      Contact.DivisionId roll-up; we just re-stamp the division-bound ones)
 *   - Leads (Lead.DivisionId)
 *   - Quotes (Quote.DivisionId)
 *
 * `Quote.DivisionId`, `Lead.DivisionId`, etc. are flagged
 * `meta:UpdateVisibility="never"` in the metadata; Prospect's misleading-
 * metadata pattern (same as v1.3.2 Notepad FKs, v1.4.0 Enquiry FKs, v1.5.0
 * CampaignActivityContact) means PATCH accepts them. Each PATCH is wrapped
 * in try/catch — a single child failing doesn't abort the merge; the
 * summary lists failures so the caller can fix them by hand.
 *
 * `move_contact` PATCHes Contact.DivisionId, then re-stamps any Task /
 * Notepad rows owned by that contact whose own DivisionId column points
 * to the OLD division (those would otherwise show up under the wrong
 * division on the activity feed).
 */
import { z } from "zod";
export declare const deleteTaskSchema: z.ZodObject<{
    taskId: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    taskId: number;
}, {
    taskId: number;
}>;
export declare const deleteEnquirySchema: z.ZodObject<{
    enquiryId: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    enquiryId: number;
}, {
    enquiryId: number;
}>;
export declare const deleteActivityNoteSchema: z.ZodObject<{
    noteId: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    noteId: number;
}, {
    noteId: number;
}>;
export declare const deleteContactSchema: z.ZodObject<{
    contactId: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    contactId: number;
}, {
    contactId: number;
}>;
export declare const mergeDivisionSchema: z.ZodObject<{
    sourceDivisionId: z.ZodNumber;
    targetDivisionId: z.ZodNumber;
    deleteSource: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    sourceDivisionId: number;
    targetDivisionId: number;
    deleteSource: boolean;
}, {
    sourceDivisionId: number;
    targetDivisionId: number;
    deleteSource?: boolean | undefined;
}>;
export declare const moveContactSchema: z.ZodObject<{
    contactId: z.ZodNumber;
    targetDivisionId: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    contactId: number;
    targetDivisionId: number;
}, {
    contactId: number;
    targetDivisionId: number;
}>;
export declare const reparentDivisionSchema: z.ZodObject<{
    divisionId: z.ZodNumber;
    companyId: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    divisionId: number;
    companyId: number;
}, {
    divisionId: number;
    companyId: number;
}>;
export declare function deleteTask(args: z.infer<typeof deleteTaskSchema>): Promise<string>;
export declare function deleteEnquiry(args: z.infer<typeof deleteEnquirySchema>): Promise<string>;
export declare function deleteActivityNote(args: z.infer<typeof deleteActivityNoteSchema>): Promise<string>;
export declare function deleteContact(args: z.infer<typeof deleteContactSchema>): Promise<string>;
export declare function mergeDivision(args: z.infer<typeof mergeDivisionSchema>): Promise<string>;
export declare function reparentDivision(args: z.infer<typeof reparentDivisionSchema>): Promise<string>;
export declare function moveContact(args: z.infer<typeof moveContactSchema>): Promise<string>;
//# sourceMappingURL=cleanup.d.ts.map