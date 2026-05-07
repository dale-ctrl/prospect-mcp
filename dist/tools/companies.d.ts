/**
 * MCP tool handlers for the Company entity (parent of Division).
 *
 * Hierarchy: Company → Division → Contact. The connector already creates a
 * Company explicitly inside create_division — these tools let callers read
 * and update Company-level fields after the fact, including the "Company
 * Group Type" shown in the Categorisation panel header.
 *
 * Company.TypeId (FK → CompanyType.Code, e.g. 'CUS') backs the Group Type.
 * The static metadata flags TypeId UpdateVisibility=never, but the Type
 * navigation property is UpdateVisibility=common — round 3 confirmed
 * Prospect's metadata flag is misleading on this tenant. Verify on first
 * live PATCH that companyGroupType writes through.
 */
import { z } from "zod";
export declare const getCompanySchema: z.ZodObject<{
    companyId: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    companyId: number;
}, {
    companyId: number;
}>;
export declare const updateCompanySchema: z.ZodObject<{
    companyId: z.ZodNumber;
    name: z.ZodOptional<z.ZodString>;
    companyGroupType: z.ZodOptional<z.ZodString>;
    source: z.ZodOptional<z.ZodString>;
    alternateReference: z.ZodOptional<z.ZodString>;
    longDescription: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    companyId: number;
    companyGroupType?: string | undefined;
    name?: string | undefined;
    source?: string | undefined;
    longDescription?: string | undefined;
    alternateReference?: string | undefined;
}, {
    companyId: number;
    companyGroupType?: string | undefined;
    name?: string | undefined;
    source?: string | undefined;
    longDescription?: string | undefined;
    alternateReference?: string | undefined;
}>;
export declare const listCompaniesSchema: z.ZodObject<{
    filters: z.ZodOptional<z.ZodObject<{
        name: z.ZodOptional<z.ZodString>;
        companyGroupType: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        companyGroupType?: string | undefined;
        name?: string | undefined;
    }, {
        companyGroupType?: string | undefined;
        name?: string | undefined;
    }>>;
    fields: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    pageSize: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    skip: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    pageSize: number;
    fields?: string[] | undefined;
    filters?: {
        companyGroupType?: string | undefined;
        name?: string | undefined;
    } | undefined;
    skip?: number | undefined;
}, {
    fields?: string[] | undefined;
    filters?: {
        companyGroupType?: string | undefined;
        name?: string | undefined;
    } | undefined;
    pageSize?: number | undefined;
    skip?: number | undefined;
}>;
export declare function getCompany(args: z.infer<typeof getCompanySchema>): Promise<string>;
export declare function updateCompany(args: z.infer<typeof updateCompanySchema>): Promise<string>;
export declare function listCompanies(args: z.infer<typeof listCompaniesSchema>): Promise<string>;
//# sourceMappingURL=companies.d.ts.map