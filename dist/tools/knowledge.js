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
import { readFileSync, appendFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";
// ─── Path resolution ──────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
/**
 * Resolve where knowledge files live. Exported for tests; the real
 * `KNOWLEDGE_DIR` constant below calls this once at module load.
 */
export function resolveKnowledgeDir(env = process.env) {
    // 1. Explicit override always wins
    if (env.WCG_KNOWLEDGE_PATH)
        return env.WCG_KNOWLEDGE_PATH;
    // 2. WCG OneDrive convention — every team member has the same layout,
    //    so default to it whenever the folder is present. This makes
    //    team-wide knowledge sharing work with zero per-user config.
    const wcgOneDrive = join(homedir(), "OneDrive - Westcountry Group", "Estimating Team", "Claude");
    if (existsSync(wcgOneDrive))
        return wcgOneDrive;
    // 3. Last-resort per-machine fallback. Used by non-WCG installs and
    //    by tests. NOT durable on Cowork's rpm cache install model.
    return join(__dirname, "..", "..", "reference");
}
const KNOWLEDGE_DIR = resolveKnowledgeDir();
const LESSONS_FILE = join(KNOWLEDGE_DIR, "quoting-lessons.md");
const PRODUCT_NOTES_FILE = join(KNOWLEDGE_DIR, "product-notes.md");
function ensureDir() {
    if (!existsSync(KNOWLEDGE_DIR)) {
        mkdirSync(KNOWLEDGE_DIR, { recursive: true });
    }
}
function readKnowledgeFile(filePath) {
    if (!existsSync(filePath))
        return "";
    return readFileSync(filePath, "utf-8");
}
function appendToFile(filePath, content) {
    ensureDir();
    appendFileSync(filePath, content, "utf-8");
}
// ─── Schemas ──────────────────────────────────────────────────
export const saveQuotingLessonSchema = z.object({
    lesson: z.string().describe("The lesson or correction to save. Be specific — include product names, quantities, sizes, and what was wrong vs what's correct."),
    category: z.string().optional().describe("Category for this lesson, e.g. 'wall-pockets', 'pricing', 'configuration', 'process'. Defaults to 'general'."),
});
export const saveProductNoteSchema = z.object({
    productName: z.string().describe("Product name or type this note applies to"),
    note: z.string().describe("The note to save — configuration details, gotchas, special rules, etc."),
});
export const getQuotingKnowledgeSchema = z.object({});
export const searchQuotingLessonsSchema = z.object({
    searchTerm: z.string().optional().describe("Search term to filter lessons (optional — returns all if omitted)"),
});
// ─── Handlers ─────────────────────────────────────────────────
export async function saveQuotingLesson(args) {
    const category = args.category || "general";
    const timestamp = new Date().toISOString().substring(0, 10);
    const entry = `\n### ${timestamp} [${category}]\n${args.lesson}\n`;
    appendToFile(LESSONS_FILE, entry);
    return `Lesson saved to quoting knowledge base:\n\n**Category:** ${category}\n**Lesson:** ${args.lesson}\n\nThis will be available in all future conversations.`;
}
export async function saveProductNote(args) {
    const timestamp = new Date().toISOString().substring(0, 10);
    const entry = `\n### ${args.productName} (${timestamp})\n${args.note}\n`;
    appendToFile(PRODUCT_NOTES_FILE, entry);
    return `Product note saved:\n\n**Product:** ${args.productName}\n**Note:** ${args.note}\n\nThis will be available in all future conversations.`;
}
export async function getQuotingKnowledge() {
    const lessons = readKnowledgeFile(LESSONS_FILE);
    const productNotes = readKnowledgeFile(PRODUCT_NOTES_FILE);
    const sections = [];
    if (lessons.trim()) {
        sections.push(`# Quoting Lessons & Corrections\n${lessons}`);
    }
    if (productNotes.trim()) {
        sections.push(`# Product Notes\n${productNotes}`);
    }
    if (sections.length === 0) {
        return "No quoting lessons or product notes saved yet. Use save_quoting_lesson or save_product_note to start building the knowledge base.";
    }
    return sections.join("\n\n---\n\n");
}
export async function searchQuotingLessons(args) {
    const lessons = readKnowledgeFile(LESSONS_FILE);
    const productNotes = readKnowledgeFile(PRODUCT_NOTES_FILE);
    const allContent = lessons + "\n" + productNotes;
    if (!allContent.trim()) {
        return "No quoting knowledge saved yet.";
    }
    if (!args.searchTerm) {
        return allContent;
    }
    // Split into sections and filter
    const sections = allContent.split(/(?=^### )/m);
    const term = args.searchTerm.toUpperCase();
    const matches = sections.filter(s => s.toUpperCase().includes(term));
    if (matches.length === 0) {
        return `No quoting lessons found matching "${args.searchTerm}".`;
    }
    return `Found ${matches.length} matching entries:\n\n${matches.join("\n")}`;
}
//# sourceMappingURL=knowledge.js.map