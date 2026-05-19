/**
 * MCP tool handlers for Quote header operations.
 */
import { z } from "zod";
export declare const searchQuotesSchema: z.ZodObject<{
    description: z.ZodOptional<z.ZodString>;
    contactName: z.ZodOptional<z.ZodString>;
    divisionName: z.ZodOptional<z.ZodString>;
    salesPersonId: z.ZodOptional<z.ZodString>;
    statusDescription: z.ZodOptional<z.ZodString>;
    dateFrom: z.ZodOptional<z.ZodString>;
    dateTo: z.ZodOptional<z.ZodString>;
    top: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    top: number;
    description?: string | undefined;
    contactName?: string | undefined;
    divisionName?: string | undefined;
    salesPersonId?: string | undefined;
    statusDescription?: string | undefined;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
}, {
    description?: string | undefined;
    contactName?: string | undefined;
    divisionName?: string | undefined;
    salesPersonId?: string | undefined;
    statusDescription?: string | undefined;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    top?: number | undefined;
}>;
export declare const getQuoteSchema: z.ZodObject<{
    quoteId: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    quoteId: number;
}, {
    quoteId: number;
}>;
export declare const createQuoteSchema: z.ZodObject<{
    contactId: z.ZodNumber;
    leadId: z.ZodOptional<z.ZodNumber>;
    description: z.ZodOptional<z.ZodString>;
    salesPersonId: z.ZodOptional<z.ZodString>;
    orderDueDate: z.ZodOptional<z.ZodString>;
    priceExpiryDate: z.ZodOptional<z.ZodString>;
    customerOrderReference: z.ZodOptional<z.ZodString>;
    memo: z.ZodOptional<z.ZodString>;
    projectCode: z.ZodOptional<z.ZodString>;
    overallDiscountPercentage: z.ZodOptional<z.ZodNumber>;
    deliveryName: z.ZodOptional<z.ZodString>;
    deliveryAddressLine1: z.ZodOptional<z.ZodString>;
    deliveryAddressLine2: z.ZodOptional<z.ZodString>;
    deliveryAddressLine3: z.ZodOptional<z.ZodString>;
    deliveryPostcode: z.ZodOptional<z.ZodString>;
    deliveryCountry: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    contactId: number;
    description?: string | undefined;
    salesPersonId?: string | undefined;
    leadId?: number | undefined;
    orderDueDate?: string | undefined;
    priceExpiryDate?: string | undefined;
    customerOrderReference?: string | undefined;
    memo?: string | undefined;
    projectCode?: string | undefined;
    overallDiscountPercentage?: number | undefined;
    deliveryName?: string | undefined;
    deliveryAddressLine1?: string | undefined;
    deliveryAddressLine2?: string | undefined;
    deliveryAddressLine3?: string | undefined;
    deliveryPostcode?: string | undefined;
    deliveryCountry?: string | undefined;
}, {
    contactId: number;
    description?: string | undefined;
    salesPersonId?: string | undefined;
    leadId?: number | undefined;
    orderDueDate?: string | undefined;
    priceExpiryDate?: string | undefined;
    customerOrderReference?: string | undefined;
    memo?: string | undefined;
    projectCode?: string | undefined;
    overallDiscountPercentage?: number | undefined;
    deliveryName?: string | undefined;
    deliveryAddressLine1?: string | undefined;
    deliveryAddressLine2?: string | undefined;
    deliveryAddressLine3?: string | undefined;
    deliveryPostcode?: string | undefined;
    deliveryCountry?: string | undefined;
}>;
export declare const updateQuoteSchema: z.ZodObject<{
    quoteId: z.ZodNumber;
    leadId: z.ZodOptional<z.ZodNumber>;
    description: z.ZodOptional<z.ZodString>;
    salesPersonId: z.ZodOptional<z.ZodString>;
    orderNumber: z.ZodOptional<z.ZodString>;
    orderDueDate: z.ZodOptional<z.ZodString>;
    priceExpiryDate: z.ZodOptional<z.ZodString>;
    customerOrderReference: z.ZodOptional<z.ZodString>;
    memo: z.ZodOptional<z.ZodString>;
    projectCode: z.ZodOptional<z.ZodString>;
    overallDiscountPercentage: z.ZodOptional<z.ZodNumber>;
    deliveryName: z.ZodOptional<z.ZodString>;
    deliveryAddressLine1: z.ZodOptional<z.ZodString>;
    deliveryAddressLine2: z.ZodOptional<z.ZodString>;
    deliveryAddressLine3: z.ZodOptional<z.ZodString>;
    deliveryPostcode: z.ZodOptional<z.ZodString>;
    deliveryCountry: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    quoteId: number;
    description?: string | undefined;
    salesPersonId?: string | undefined;
    leadId?: number | undefined;
    orderDueDate?: string | undefined;
    priceExpiryDate?: string | undefined;
    customerOrderReference?: string | undefined;
    memo?: string | undefined;
    projectCode?: string | undefined;
    overallDiscountPercentage?: number | undefined;
    deliveryName?: string | undefined;
    deliveryAddressLine1?: string | undefined;
    deliveryAddressLine2?: string | undefined;
    deliveryAddressLine3?: string | undefined;
    deliveryPostcode?: string | undefined;
    deliveryCountry?: string | undefined;
    orderNumber?: string | undefined;
}, {
    quoteId: number;
    description?: string | undefined;
    salesPersonId?: string | undefined;
    leadId?: number | undefined;
    orderDueDate?: string | undefined;
    priceExpiryDate?: string | undefined;
    customerOrderReference?: string | undefined;
    memo?: string | undefined;
    projectCode?: string | undefined;
    overallDiscountPercentage?: number | undefined;
    deliveryName?: string | undefined;
    deliveryAddressLine1?: string | undefined;
    deliveryAddressLine2?: string | undefined;
    deliveryAddressLine3?: string | undefined;
    deliveryPostcode?: string | undefined;
    deliveryCountry?: string | undefined;
    orderNumber?: string | undefined;
}>;
export declare const duplicateQuoteSchema: z.ZodObject<{
    quoteId: z.ZodNumber;
    newDescription: z.ZodOptional<z.ZodString>;
    newContactId: z.ZodOptional<z.ZodNumber>;
    newSalesPersonId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    quoteId: number;
    newDescription?: string | undefined;
    newContactId?: number | undefined;
    newSalesPersonId?: string | undefined;
}, {
    quoteId: number;
    newDescription?: string | undefined;
    newContactId?: number | undefined;
    newSalesPersonId?: string | undefined;
}>;
export declare const addQuoteLineGroupSchema: z.ZodObject<{
    quoteId: z.ZodNumber;
    title: z.ZodString;
    showSubtotal: z.ZodOptional<z.ZodBoolean>;
    showPriceColumn: z.ZodOptional<z.ZodBoolean>;
    showDiscount: z.ZodOptional<z.ZodBoolean>;
    sequence: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    quoteId: number;
    title: string;
    showSubtotal?: boolean | undefined;
    showPriceColumn?: boolean | undefined;
    showDiscount?: boolean | undefined;
    sequence?: number | undefined;
}, {
    quoteId: number;
    title: string;
    showSubtotal?: boolean | undefined;
    showPriceColumn?: boolean | undefined;
    showDiscount?: boolean | undefined;
    sequence?: number | undefined;
}>;
export declare const deleteQuoteSchema: z.ZodObject<{
    quoteId: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    quoteId: number;
}, {
    quoteId: number;
}>;
export declare function searchQuotes(args: z.infer<typeof searchQuotesSchema>): Promise<string>;
export declare function getQuote(args: z.infer<typeof getQuoteSchema>): Promise<string>;
export declare function createQuote(args: z.infer<typeof createQuoteSchema>): Promise<string>;
export declare function updateQuote(args: z.infer<typeof updateQuoteSchema>): Promise<string>;
export declare function duplicateQuote(args: z.infer<typeof duplicateQuoteSchema>): Promise<string>;
export declare function addQuoteLineGroup(args: z.infer<typeof addQuoteLineGroupSchema>): Promise<string>;
export declare function deleteQuote(args: z.infer<typeof deleteQuoteSchema>): Promise<string>;
//# sourceMappingURL=quotes.d.ts.map