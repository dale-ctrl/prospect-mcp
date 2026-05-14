/**
 * MCP tool handlers for Lead (Opportunity) operations.
 * In Prospect365, "Opportunities" are modelled as Leads.
 */
import { z } from "zod";
export declare const searchOpportunitiesSchema: z.ZodObject<{
    description: z.ZodOptional<z.ZodString>;
    contactName: z.ZodOptional<z.ZodString>;
    divisionName: z.ZodOptional<z.ZodString>;
    salesPersonId: z.ZodOptional<z.ZodString>;
    statusDescription: z.ZodOptional<z.ZodString>;
    statusDetail: z.ZodOptional<z.ZodString>;
    pipelineId: z.ZodOptional<z.ZodString>;
    dateFrom: z.ZodOptional<z.ZodString>;
    dateTo: z.ZodOptional<z.ZodString>;
    includeClosed: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    top: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    top: number;
    includeClosed: boolean;
    description?: string | undefined;
    contactName?: string | undefined;
    divisionName?: string | undefined;
    salesPersonId?: string | undefined;
    statusDescription?: string | undefined;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    statusDetail?: string | undefined;
    pipelineId?: string | undefined;
}, {
    description?: string | undefined;
    contactName?: string | undefined;
    divisionName?: string | undefined;
    salesPersonId?: string | undefined;
    statusDescription?: string | undefined;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    top?: number | undefined;
    statusDetail?: string | undefined;
    pipelineId?: string | undefined;
    includeClosed?: boolean | undefined;
}>;
export declare const getOpportunitySchema: z.ZodObject<{
    leadId: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    leadId: number;
}, {
    leadId: number;
}>;
export declare const createOpportunitySchema: z.ZodObject<{
    contactId: z.ZodNumber;
    sizeId: z.ZodString;
    statusId: z.ZodString;
    divisionId: z.ZodOptional<z.ZodNumber>;
    addressId: z.ZodOptional<z.ZodNumber>;
    typeId: z.ZodOptional<z.ZodString>;
    pipelineId: z.ZodOptional<z.ZodString>;
    sourceId: z.ZodOptional<z.ZodString>;
    sourceOther: z.ZodOptional<z.ZodString>;
    marginId: z.ZodOptional<z.ZodString>;
    salesPersonId: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    situationSummary: z.ZodOptional<z.ZodString>;
    alternateReference: z.ZodOptional<z.ZodString>;
    value: z.ZodOptional<z.ZodNumber>;
    marginValue: z.ZodOptional<z.ZodNumber>;
    estimatedClose: z.ZodOptional<z.ZodString>;
    autocalculateValue: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    contactId: number;
    sizeId: string;
    statusId: string;
    value?: number | undefined;
    description?: string | undefined;
    salesPersonId?: string | undefined;
    divisionId?: number | undefined;
    alternateReference?: string | undefined;
    typeId?: string | undefined;
    pipelineId?: string | undefined;
    addressId?: number | undefined;
    sourceId?: string | undefined;
    sourceOther?: string | undefined;
    marginId?: string | undefined;
    situationSummary?: string | undefined;
    marginValue?: number | undefined;
    estimatedClose?: string | undefined;
    autocalculateValue?: boolean | undefined;
}, {
    contactId: number;
    sizeId: string;
    statusId: string;
    value?: number | undefined;
    description?: string | undefined;
    salesPersonId?: string | undefined;
    divisionId?: number | undefined;
    alternateReference?: string | undefined;
    typeId?: string | undefined;
    pipelineId?: string | undefined;
    addressId?: number | undefined;
    sourceId?: string | undefined;
    sourceOther?: string | undefined;
    marginId?: string | undefined;
    situationSummary?: string | undefined;
    marginValue?: number | undefined;
    estimatedClose?: string | undefined;
    autocalculateValue?: boolean | undefined;
}>;
export declare const updateOpportunitySchema: z.ZodObject<{
    leadId: z.ZodNumber;
    sizeId: z.ZodOptional<z.ZodString>;
    statusId: z.ZodOptional<z.ZodString>;
    typeId: z.ZodOptional<z.ZodString>;
    pipelineId: z.ZodOptional<z.ZodString>;
    sourceId: z.ZodOptional<z.ZodString>;
    sourceOther: z.ZodOptional<z.ZodString>;
    marginId: z.ZodOptional<z.ZodString>;
    salesPersonId: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    situationSummary: z.ZodOptional<z.ZodString>;
    alternateReference: z.ZodOptional<z.ZodString>;
    value: z.ZodOptional<z.ZodNumber>;
    marginValue: z.ZodOptional<z.ZodNumber>;
    estimatedClose: z.ZodOptional<z.ZodString>;
    autocalculateValue: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    leadId: number;
    value?: number | undefined;
    description?: string | undefined;
    salesPersonId?: string | undefined;
    alternateReference?: string | undefined;
    typeId?: string | undefined;
    pipelineId?: string | undefined;
    sizeId?: string | undefined;
    statusId?: string | undefined;
    sourceId?: string | undefined;
    sourceOther?: string | undefined;
    marginId?: string | undefined;
    situationSummary?: string | undefined;
    marginValue?: number | undefined;
    estimatedClose?: string | undefined;
    autocalculateValue?: boolean | undefined;
}, {
    leadId: number;
    value?: number | undefined;
    description?: string | undefined;
    salesPersonId?: string | undefined;
    alternateReference?: string | undefined;
    typeId?: string | undefined;
    pipelineId?: string | undefined;
    sizeId?: string | undefined;
    statusId?: string | undefined;
    sourceId?: string | undefined;
    sourceOther?: string | undefined;
    marginId?: string | undefined;
    situationSummary?: string | undefined;
    marginValue?: number | undefined;
    estimatedClose?: string | undefined;
    autocalculateValue?: boolean | undefined;
}>;
export declare const getLeadLookupsSchema: z.ZodObject<{
    kind: z.ZodDefault<z.ZodOptional<z.ZodEnum<["statuses", "statusDetails", "sizes", "sources", "types", "pipelines", "all"]>>>;
    includeObsolete: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    includeObsolete: boolean;
    kind: "all" | "types" | "statuses" | "statusDetails" | "sizes" | "sources" | "pipelines";
}, {
    includeObsolete?: boolean | undefined;
    kind?: "all" | "types" | "statuses" | "statusDetails" | "sizes" | "sources" | "pipelines" | undefined;
}>;
export declare function searchOpportunities(args: z.infer<typeof searchOpportunitiesSchema>): Promise<string>;
export declare function getOpportunity(args: z.infer<typeof getOpportunitySchema>): Promise<string>;
export declare function createOpportunity(args: z.infer<typeof createOpportunitySchema>): Promise<string>;
export declare function updateOpportunity(args: z.infer<typeof updateOpportunitySchema>): Promise<string>;
export declare function getLeadLookups(args: z.infer<typeof getLeadLookupsSchema>): Promise<string>;
//# sourceMappingURL=opportunities.d.ts.map