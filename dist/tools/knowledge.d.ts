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
 *   1. WCG_KNOWLEDGE_PATH env var — explicit override for non-standard setups
 *      or testing. Power-user escape hatch.
 *   2. WCG OneDrive default — %USERPROFILE%\OneDrive - Westcountry Group\
 *      Estimating Team\Claude. Used automatically when the folder exists,
 *      so every WCG team member gets shared knowledge with zero config.
 *      Added in v1.19.1 so the env var can be dropped from
 *      claude_desktop_config.json without losing team-wide sharing.
 *   3. Fallback to <plugin-root>/reference/ — per-machine, no team sharing.
 *      Used by non-WCG installs (CI, tests, anyone outside the org).
 *      Note: on Cowork's rpm cache install model, this folder gets wiped
 *      on every plugin update — so it's never a long-term store.
 */
import { z } from "zod";
/**
 * Resolve where knowledge files live. Exported for tests; the real
 * `KNOWLEDGE_DIR` constant below calls this once at module load.
 */
export declare function resolveKnowledgeDir(env?: NodeJS.ProcessEnv): string;
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