/**
 * MCP tool handlers for Problem/Ticket (support case) operations.
 * Problems are service/support tickets linked to contacts, divisions, and optionally leads/inventories.
 */
import { z } from "zod";
export declare const searchProblemsSchema: z.ZodObject<{
    description: z.ZodOptional<z.ZodString>;
    divisionId: z.ZodOptional<z.ZodNumber>;
    divisionName: z.ZodOptional<z.ZodString>;
    contactId: z.ZodOptional<z.ZodNumber>;
    responsibleUser: z.ZodOptional<z.ZodString>;
    owner: z.ZodOptional<z.ZodString>;
    priority: z.ZodOptional<z.ZodNumber>;
    openOnly: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    dateFrom: z.ZodOptional<z.ZodString>;
    dateTo: z.ZodOptional<z.ZodString>;
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
    responsibleUser?: string | undefined;
    priority?: number | undefined;
    owner?: string | undefined;
}, {
    description?: string | undefined;
    divisionName?: string | undefined;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    top?: number | undefined;
    contactId?: number | undefined;
    divisionId?: number | undefined;
    responsibleUser?: string | undefined;
    openOnly?: boolean | undefined;
    priority?: number | undefined;
    owner?: string | undefined;
}>;
export declare const getProblemSchema: z.ZodObject<{
    problemId: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    problemId: number;
}, {
    problemId: number;
}>;
export declare const createProblemSchema: z.ZodObject<{
    contactId: z.ZodNumber;
    description: z.ZodString;
    ownerId: z.ZodString;
    responsibleUserId: z.ZodString;
    type1Id: z.ZodString;
    statusId: z.ZodString;
    supplierReference: z.ZodOptional<z.ZodString>;
    customerReference: z.ZodOptional<z.ZodString>;
    serialNumber: z.ZodOptional<z.ZodString>;
    priority: z.ZodOptional<z.ZodNumber>;
    situationSummary: z.ZodOptional<z.ZodString>;
    pipelineId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    description: string;
    contactId: number;
    statusId: string;
    ownerId: string;
    responsibleUserId: string;
    type1Id: string;
    serialNumber?: string | undefined;
    pipelineId?: string | undefined;
    situationSummary?: string | undefined;
    priority?: number | undefined;
    customerReference?: string | undefined;
    supplierReference?: string | undefined;
}, {
    description: string;
    contactId: number;
    statusId: string;
    ownerId: string;
    responsibleUserId: string;
    type1Id: string;
    serialNumber?: string | undefined;
    pipelineId?: string | undefined;
    situationSummary?: string | undefined;
    priority?: number | undefined;
    customerReference?: string | undefined;
    supplierReference?: string | undefined;
}>;
export declare const updateProblemSchema: z.ZodObject<{
    problemId: z.ZodNumber;
    description: z.ZodOptional<z.ZodString>;
    ownerId: z.ZodOptional<z.ZodString>;
    responsibleUserId: z.ZodOptional<z.ZodString>;
    type1Id: z.ZodOptional<z.ZodString>;
    statusId: z.ZodOptional<z.ZodString>;
    supplierReference: z.ZodOptional<z.ZodString>;
    customerReference: z.ZodOptional<z.ZodString>;
    serialNumber: z.ZodOptional<z.ZodString>;
    priority: z.ZodOptional<z.ZodNumber>;
    situationSummary: z.ZodOptional<z.ZodString>;
    pipelineId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    problemId: number;
    description?: string | undefined;
    serialNumber?: string | undefined;
    pipelineId?: string | undefined;
    statusId?: string | undefined;
    situationSummary?: string | undefined;
    priority?: number | undefined;
    customerReference?: string | undefined;
    ownerId?: string | undefined;
    responsibleUserId?: string | undefined;
    type1Id?: string | undefined;
    supplierReference?: string | undefined;
}, {
    problemId: number;
    description?: string | undefined;
    serialNumber?: string | undefined;
    pipelineId?: string | undefined;
    statusId?: string | undefined;
    situationSummary?: string | undefined;
    priority?: number | undefined;
    customerReference?: string | undefined;
    ownerId?: string | undefined;
    responsibleUserId?: string | undefined;
    type1Id?: string | undefined;
    supplierReference?: string | undefined;
}>;
export declare const getProblemLookupsSchema: z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>;
export declare function createProblem(args: z.infer<typeof createProblemSchema>): Promise<string>;
export declare function updateProblem(args: z.infer<typeof updateProblemSchema>): Promise<string>;
export declare function getProblemLookups(): Promise<string>;
export declare function searchProblems(args: z.infer<typeof searchProblemsSchema>): Promise<string>;
export declare function getProblem(args: z.infer<typeof getProblemSchema>): Promise<string>;
//# sourceMappingURL=problems.d.ts.map