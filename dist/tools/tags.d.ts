/**
 * MCP tool handlers for Tags and Tag Assignments.
 * Tags can be applied across entities: contacts, divisions, leads, quotes, campaigns, products, etc.
 */
import { z } from "zod";
export declare const getTagsSchema: z.ZodObject<{
    includeObsolete: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    includeObsolete: boolean;
}, {
    includeObsolete?: boolean | undefined;
}>;
export declare const searchTagAssignmentsSchema: z.ZodObject<{
    tagId: z.ZodOptional<z.ZodString>;
    tagDescription: z.ZodOptional<z.ZodString>;
    contactId: z.ZodOptional<z.ZodNumber>;
    divisionId: z.ZodOptional<z.ZodNumber>;
    leadId: z.ZodOptional<z.ZodNumber>;
    quoteId: z.ZodOptional<z.ZodNumber>;
    productItemId: z.ZodOptional<z.ZodString>;
    top: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    top: number;
    quoteId?: number | undefined;
    contactId?: number | undefined;
    leadId?: number | undefined;
    productItemId?: string | undefined;
    divisionId?: number | undefined;
    tagId?: string | undefined;
    tagDescription?: string | undefined;
}, {
    top?: number | undefined;
    quoteId?: number | undefined;
    contactId?: number | undefined;
    leadId?: number | undefined;
    productItemId?: string | undefined;
    divisionId?: number | undefined;
    tagId?: string | undefined;
    tagDescription?: string | undefined;
}>;
export declare function getTags(args: z.infer<typeof getTagsSchema>): Promise<string>;
export declare function searchTagAssignments(args: z.infer<typeof searchTagAssignmentsSchema>): Promise<string>;
//# sourceMappingURL=tags.d.ts.map