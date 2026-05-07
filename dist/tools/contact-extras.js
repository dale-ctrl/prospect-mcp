/**
 * MCP tool handlers for additional contact details — extra emails and phone numbers.
 */
import { z } from "zod";
import { getClient } from "../client.js";
// ─── Schemas ──────────────────────────────────────────────────
export const getContactExtrasSchema = z.object({
    contactId: z.number().describe("ContactId to get additional emails and phone numbers for"),
});
// ─── Handlers ─────────────────────────────────────────────────
export async function getContactExtras(args) {
    const client = getClient();
    const sections = [];
    // Additional emails
    const emails = await client.get("AdditionalEmails", `$filter=ContactId eq ${args.contactId} and StatusFlag ne 'D'&$select=Id,Email,Description,Priority&$orderby=Priority`);
    if (emails.value.length > 0) {
        const lines = emails.value.map((e) => `- **${e.Email}** — ${e.Description || "N/A"}${e.Priority === 1 ? " [PRIMARY]" : ""}`);
        sections.push(`## Additional Emails (${emails.value.length})\n${lines.join("\n")}`);
    }
    // Additional phone numbers
    const phones = await client.get("AdditionalPhoneNumbers", `$filter=ContactId eq ${args.contactId} and StatusFlag ne 'D'&$select=AddPhoneId,PhoneNumber,Description,TypeCode,Priority&$orderby=Priority`);
    if (phones.value.length > 0) {
        const lines = phones.value.map((p) => `- **${p.PhoneNumber}** — ${p.Description || "N/A"} (${p.TypeCode || "general"})${p.Priority === 1 ? " [PRIMARY]" : ""}`);
        sections.push(`## Additional Phone Numbers (${phones.value.length})\n${lines.join("\n")}`);
    }
    if (sections.length === 0) {
        return `No additional emails or phone numbers found for contact ${args.contactId}.`;
    }
    return `# Additional Contact Details (Contact ${args.contactId})\n\n${sections.join("\n\n")}`;
}
//# sourceMappingURL=contact-extras.js.map