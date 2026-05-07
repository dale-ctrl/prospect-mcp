/**
 * MCP tool handlers for Job (service delivery / project) operations.
 * Jobs track work against divisions/contacts, linked to quotes, leads, and problems.
 */
import { z } from "zod";
export declare const searchJobsSchema: z.ZodObject<{
    description: z.ZodOptional<z.ZodString>;
    divisionId: z.ZodOptional<z.ZodNumber>;
    divisionName: z.ZodOptional<z.ZodString>;
    contactId: z.ZodOptional<z.ZodNumber>;
    manager: z.ZodOptional<z.ZodString>;
    customerReference: z.ZodOptional<z.ZodString>;
    dateFrom: z.ZodOptional<z.ZodString>;
    dateTo: z.ZodOptional<z.ZodString>;
    openOnly: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    top: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    top: number;
    openOnly: boolean;
    description?: string | undefined;
    divisionName?: string | undefined;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    contactId?: number | undefined;
    divisionId?: number | undefined;
    customerReference?: string | undefined;
    manager?: string | undefined;
}, {
    description?: string | undefined;
    divisionName?: string | undefined;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    top?: number | undefined;
    contactId?: number | undefined;
    divisionId?: number | undefined;
    openOnly?: boolean | undefined;
    customerReference?: string | undefined;
    manager?: string | undefined;
}>;
export declare const getJobSchema: z.ZodObject<{
    jobId: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    jobId: number;
}, {
    jobId: number;
}>;
export declare const createJobSchema: z.ZodObject<{
    divisionId: z.ZodNumber;
    description: z.ZodString;
    typeCode: z.ZodString;
    statusCode: z.ZodString;
    contactId: z.ZodOptional<z.ZodNumber>;
    leadId: z.ZodOptional<z.ZodNumber>;
    problemId: z.ZodOptional<z.ZodNumber>;
    quoteId: z.ZodOptional<z.ZodNumber>;
    customerReference: z.ZodOptional<z.ZodString>;
    alternateReference: z.ZodOptional<z.ZodString>;
    targetStartDate: z.ZodOptional<z.ZodString>;
    targetEndDate: z.ZodOptional<z.ZodString>;
    actualStartDate: z.ZodOptional<z.ZodString>;
    actualEndDate: z.ZodOptional<z.ZodString>;
    manager: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    description: string;
    divisionId: number;
    statusCode: string;
    typeCode: string;
    quoteId?: number | undefined;
    contactId?: number | undefined;
    leadId?: number | undefined;
    alternateReference?: string | undefined;
    customerReference?: string | undefined;
    problemId?: number | undefined;
    manager?: string | undefined;
    targetStartDate?: string | undefined;
    targetEndDate?: string | undefined;
    actualStartDate?: string | undefined;
    actualEndDate?: string | undefined;
}, {
    description: string;
    divisionId: number;
    statusCode: string;
    typeCode: string;
    quoteId?: number | undefined;
    contactId?: number | undefined;
    leadId?: number | undefined;
    alternateReference?: string | undefined;
    customerReference?: string | undefined;
    problemId?: number | undefined;
    manager?: string | undefined;
    targetStartDate?: string | undefined;
    targetEndDate?: string | undefined;
    actualStartDate?: string | undefined;
    actualEndDate?: string | undefined;
}>;
export declare const updateJobSchema: z.ZodObject<{
    jobId: z.ZodNumber;
    description: z.ZodOptional<z.ZodString>;
    typeCode: z.ZodOptional<z.ZodString>;
    statusCode: z.ZodOptional<z.ZodString>;
    contactId: z.ZodOptional<z.ZodNumber>;
    leadId: z.ZodOptional<z.ZodNumber>;
    problemId: z.ZodOptional<z.ZodNumber>;
    quoteId: z.ZodOptional<z.ZodNumber>;
    customerReference: z.ZodOptional<z.ZodString>;
    alternateReference: z.ZodOptional<z.ZodString>;
    targetStartDate: z.ZodOptional<z.ZodString>;
    targetEndDate: z.ZodOptional<z.ZodString>;
    actualStartDate: z.ZodOptional<z.ZodString>;
    actualEndDate: z.ZodOptional<z.ZodString>;
    manager: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    jobId: number;
    description?: string | undefined;
    quoteId?: number | undefined;
    contactId?: number | undefined;
    leadId?: number | undefined;
    alternateReference?: string | undefined;
    statusCode?: string | undefined;
    customerReference?: string | undefined;
    problemId?: number | undefined;
    typeCode?: string | undefined;
    manager?: string | undefined;
    targetStartDate?: string | undefined;
    targetEndDate?: string | undefined;
    actualStartDate?: string | undefined;
    actualEndDate?: string | undefined;
}, {
    jobId: number;
    description?: string | undefined;
    quoteId?: number | undefined;
    contactId?: number | undefined;
    leadId?: number | undefined;
    alternateReference?: string | undefined;
    statusCode?: string | undefined;
    customerReference?: string | undefined;
    problemId?: number | undefined;
    typeCode?: string | undefined;
    manager?: string | undefined;
    targetStartDate?: string | undefined;
    targetEndDate?: string | undefined;
    actualStartDate?: string | undefined;
    actualEndDate?: string | undefined;
}>;
export declare const getJobLookupsSchema: z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>;
export declare function createJob(args: z.infer<typeof createJobSchema>): Promise<string>;
export declare function updateJob(args: z.infer<typeof updateJobSchema>): Promise<string>;
export declare function getJobLookups(): Promise<string>;
export declare function searchJobs(args: z.infer<typeof searchJobsSchema>): Promise<string>;
export declare function getJob(args: z.infer<typeof getJobSchema>): Promise<string>;
//# sourceMappingURL=jobs.d.ts.map