/**
 * MCP tool handlers for additional contact details — extra emails and phone numbers.
 */
import { z } from "zod";
export declare const getContactExtrasSchema: z.ZodObject<{
    contactId: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    contactId: number;
}, {
    contactId: number;
}>;
export declare function getContactExtras(args: z.infer<typeof getContactExtrasSchema>): Promise<string>;
//# sourceMappingURL=contact-extras.d.ts.map