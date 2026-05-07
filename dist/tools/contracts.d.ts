/**
 * MCP tool handlers for Contract and ContractSchedule operations.
 * Contracts are agreements with divisions. Each contract has one or more schedules (terms/periods).
 */
import { z } from "zod";
export declare const searchContractsSchema: z.ZodObject<{
    divisionId: z.ZodOptional<z.ZodNumber>;
    divisionName: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    alternateReference: z.ZodOptional<z.ZodString>;
    currentOnly: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    top: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    top: number;
    currentOnly: boolean;
    description?: string | undefined;
    divisionName?: string | undefined;
    divisionId?: number | undefined;
    alternateReference?: string | undefined;
}, {
    description?: string | undefined;
    divisionName?: string | undefined;
    top?: number | undefined;
    divisionId?: number | undefined;
    alternateReference?: string | undefined;
    currentOnly?: boolean | undefined;
}>;
export declare const getContractSchema: z.ZodObject<{
    contractId: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    contractId: number;
}, {
    contractId: number;
}>;
export declare const searchContractSchedulesSchema: z.ZodObject<{
    contractId: z.ZodOptional<z.ZodNumber>;
    divisionId: z.ZodOptional<z.ZodNumber>;
    currentOnly: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    expiringBefore: z.ZodOptional<z.ZodString>;
    top: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    top: number;
    currentOnly: boolean;
    divisionId?: number | undefined;
    contractId?: number | undefined;
    expiringBefore?: string | undefined;
}, {
    top?: number | undefined;
    divisionId?: number | undefined;
    currentOnly?: boolean | undefined;
    contractId?: number | undefined;
    expiringBefore?: string | undefined;
}>;
export declare const createContractSchema: z.ZodObject<{
    divisionId: z.ZodNumber;
    typeCode: z.ZodString;
    contractDesc: z.ZodOptional<z.ZodString>;
    details: z.ZodOptional<z.ZodString>;
    alternateReference: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    divisionId: number;
    typeCode: string;
    alternateReference?: string | undefined;
    contractDesc?: string | undefined;
    details?: string | undefined;
}, {
    divisionId: number;
    typeCode: string;
    alternateReference?: string | undefined;
    contractDesc?: string | undefined;
    details?: string | undefined;
}>;
export declare const updateContractSchema: z.ZodObject<{
    contractId: z.ZodNumber;
    typeCode: z.ZodOptional<z.ZodString>;
    contractDesc: z.ZodOptional<z.ZodString>;
    details: z.ZodOptional<z.ZodString>;
    alternateReference: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    contractId: number;
    alternateReference?: string | undefined;
    typeCode?: string | undefined;
    contractDesc?: string | undefined;
    details?: string | undefined;
}, {
    contractId: number;
    alternateReference?: string | undefined;
    typeCode?: string | undefined;
    contractDesc?: string | undefined;
    details?: string | undefined;
}>;
export declare const getContractLookupsSchema: z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>;
export declare function createContract(args: z.infer<typeof createContractSchema>): Promise<string>;
export declare function updateContract(args: z.infer<typeof updateContractSchema>): Promise<string>;
export declare function getContractLookups(): Promise<string>;
export declare function searchContracts(args: z.infer<typeof searchContractsSchema>): Promise<string>;
export declare function getContract(args: z.infer<typeof getContractSchema>): Promise<string>;
export declare function searchContractSchedules(args: z.infer<typeof searchContractSchedulesSchema>): Promise<string>;
//# sourceMappingURL=contracts.d.ts.map