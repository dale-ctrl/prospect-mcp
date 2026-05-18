/**
 * MCP tool handlers for persistent knowledge — quoting lessons, product notes,
 * and corrections that Claude learns from user feedback.
 *
 * This acts as a CRM-specific memory system. When a user corrects Claude
 * (e.g. "a double wall pocket actually needs 6 benches, not 4"), Claude
 * saves the correction here. Next conversation, it reads the file and
 * gets it right.
 *
 * Storage location resolution (in priority order):
 *   1. WCG_KNOWLEDGE_PATH env var — point at a shared folder (e.g. a OneDrive
 *      path) for team-wide knowledge sharing. RECOMMENDED for WCG team use.
 *   2. Fallback to <plugin-root>/reference/ — per-machine, no team sharing.
 *      Kept for backwards compatibility with installs that haven't been
 *      configured yet.
 */
import { z } from "zod";
export declare const saveQuotingLessonSchema: z.ZodObject<{
    lesson: z.ZodString;
    category: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    lesson: string;
    category?: string | undefined;
}, {
    lesson: string;
    category?: string | undefined;
}>;
export declare const saveProductNoteSchema: z.ZodObject<{
    productName: z.ZodString;
    note: z.ZodString;
}, "strip", z.ZodTypeAny, {
    productName: string;
    note: string;
}, {
    productName: string;
    note: string;
}>;
export declare const getQuotingKnowledgeSchema: z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>;
export declare const searchQuotingLessonsSchema: z.ZodObject<{
    searchTerm: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    searchTerm?: string | undefined;
}, {
    searchTerm?: string | undefined;
}>;
export declare function saveQuotingLesson(args: z.infer<typeof saveQuotingLessonSchema>): Promise<string>;
export declare function saveProductNote(args: z.infer<typeof saveProductNoteSchema>): Promise<string>;
export declare function getQuotingKnowledge(): Promise<string>;
export declare function searchQuotingLessons(args: z.infer<typeof searchQuotingLessonsSchema>): Promise<string>;
//# sourceMappingURL=knowledge.d.ts.map