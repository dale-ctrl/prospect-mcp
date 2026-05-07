/**
 * Extended MCP tool handlers — deep lookups for contacts, users, leads, divisions.
 * These provide the full context Claude needs when creating/managing quotes.
 */
import { z } from "zod";
export declare const getContactDetailsSchema: z.ZodObject<{
    contactId: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    contactId: number;
}, {
    contactId: number;
}>;
export declare const getDivisionDetailsSchema: z.ZodObject<{
    divisionId: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    divisionId: number;
}, {
    divisionId: number;
}>;
export declare const getUsersSchema: z.ZodObject<{
    activeOnly: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    activeOnly: boolean;
}, {
    activeOnly?: boolean | undefined;
}>;
export declare const searchLeadsSchema: z.ZodObject<{
    description: z.ZodOptional<z.ZodString>;
    contactName: z.ZodOptional<z.ZodString>;
    divisionName: z.ZodOptional<z.ZodString>;
    responsibleUser: z.ZodOptional<z.ZodString>;
    top: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    top: number;
    description?: string | undefined;
    contactName?: string | undefined;
    divisionName?: string | undefined;
    responsibleUser?: string | undefined;
}, {
    description?: string | undefined;
    contactName?: string | undefined;
    divisionName?: string | undefined;
    top?: number | undefined;
    responsibleUser?: string | undefined;
}>;
export declare const getLeadDetailsSchema: z.ZodObject<{
    leadId: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    leadId: number;
}, {
    leadId: number;
}>;
/**
 * Get FULL contact details including Division, Address, and all key fields.
 * This is the go-to tool before creating a quote — gives you ContactId,
 * DivisionId, AddressId, account codes, and the full address.
 */
export declare function getContactDetails(args: z.infer<typeof getContactDetailsSchema>): Promise<string>;
/**
 * Get full division details with address and key contacts.
 */
export declare function getDivisionDetails(args: z.infer<typeof getDivisionDetailsSchema>): Promise<string>;
/**
 * List all CRM users (salespeople). Essential for knowing valid SalesPersonId codes.
 */
export declare function getUsers(args: z.infer<typeof getUsersSchema>): Promise<string>;
/**
 * Search for opportunities/leads.
 */
export declare function searchLeads(args: z.infer<typeof searchLeadsSchema>): Promise<string>;
/**
 * Get full details of a lead/opportunity including contact, division, quotes.
 */
export declare function getLeadDetails(args: z.infer<typeof getLeadDetailsSchema>): Promise<string>;
//# sourceMappingURL=extended.d.ts.map