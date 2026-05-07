/**
 * MCP tool handlers for Sales Order operations.
 * Orders are typically created from quotes (Quote → Order conversion).
 * Most fields are read-only as orders flow from the accounts system.
 */
import { z } from "zod";
export declare const searchOrdersSchema: z.ZodObject<{
    orderNumber: z.ZodOptional<z.ZodString>;
    customerReference: z.ZodOptional<z.ZodString>;
    divisionId: z.ZodOptional<z.ZodNumber>;
    divisionName: z.ZodOptional<z.ZodString>;
    salesPersonId: z.ZodOptional<z.ZodString>;
    quoteId: z.ZodOptional<z.ZodNumber>;
    orderStatus: z.ZodOptional<z.ZodString>;
    dateFrom: z.ZodOptional<z.ZodString>;
    dateTo: z.ZodOptional<z.ZodString>;
    minValue: z.ZodOptional<z.ZodNumber>;
    top: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    top: number;
    divisionName?: string | undefined;
    salesPersonId?: string | undefined;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    quoteId?: number | undefined;
    orderNumber?: string | undefined;
    divisionId?: number | undefined;
    customerReference?: string | undefined;
    orderStatus?: string | undefined;
    minValue?: number | undefined;
}, {
    divisionName?: string | undefined;
    salesPersonId?: string | undefined;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    top?: number | undefined;
    quoteId?: number | undefined;
    orderNumber?: string | undefined;
    divisionId?: number | undefined;
    customerReference?: string | undefined;
    orderStatus?: string | undefined;
    minValue?: number | undefined;
}>;
export declare const getOrderSchema: z.ZodObject<{
    orderNumber: z.ZodString;
}, "strip", z.ZodTypeAny, {
    orderNumber: string;
}, {
    orderNumber: string;
}>;
export declare const reportOrdersByDivisionSchema: z.ZodObject<{
    divisionId: z.ZodNumber;
    dateFrom: z.ZodOptional<z.ZodString>;
    top: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    top: number;
    divisionId: number;
    dateFrom?: string | undefined;
}, {
    divisionId: number;
    dateFrom?: string | undefined;
    top?: number | undefined;
}>;
export declare function searchOrders(args: z.infer<typeof searchOrdersSchema>): Promise<string>;
export declare function getOrder(args: z.infer<typeof getOrderSchema>): Promise<string>;
export declare function reportOrdersByDivision(args: z.infer<typeof reportOrdersByDivisionSchema>): Promise<string>;
//# sourceMappingURL=orders.d.ts.map