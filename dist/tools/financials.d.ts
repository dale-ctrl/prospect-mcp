/**
 * MCP tool handlers for financial data — Sales Invoices, Sales Transactions,
 * and account-level financial reports.
 */
import { z } from "zod";
export declare const searchSalesInvoicesSchema: z.ZodObject<{
    invoiceNumber: z.ZodOptional<z.ZodString>;
    divisionId: z.ZodOptional<z.ZodNumber>;
    salesLedgerId: z.ZodOptional<z.ZodString>;
    dateFrom: z.ZodOptional<z.ZodString>;
    dateTo: z.ZodOptional<z.ZodString>;
    minValue: z.ZodOptional<z.ZodNumber>;
    top: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    top: number;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    divisionId?: number | undefined;
    salesLedgerId?: string | undefined;
    invoiceNumber?: string | undefined;
    minValue?: number | undefined;
}, {
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    top?: number | undefined;
    divisionId?: number | undefined;
    salesLedgerId?: string | undefined;
    invoiceNumber?: string | undefined;
    minValue?: number | undefined;
}>;
export declare const getSalesInvoiceSchema: z.ZodObject<{
    operatingCompanyCode: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    invoiceNumber: z.ZodString;
}, "strip", z.ZodTypeAny, {
    invoiceNumber: string;
    operatingCompanyCode: string;
}, {
    invoiceNumber: string;
    operatingCompanyCode?: string | undefined;
}>;
export declare const searchSalesTransactionsSchema: z.ZodObject<{
    invoiceNumber: z.ZodOptional<z.ZodString>;
    orderNumber: z.ZodOptional<z.ZodString>;
    productItemId: z.ZodOptional<z.ZodString>;
    productDescription: z.ZodOptional<z.ZodString>;
    divisionId: z.ZodOptional<z.ZodNumber>;
    salesLedgerId: z.ZodOptional<z.ZodString>;
    dateFrom: z.ZodOptional<z.ZodString>;
    dateTo: z.ZodOptional<z.ZodString>;
    top: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    top: number;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    orderNumber?: string | undefined;
    productItemId?: string | undefined;
    divisionId?: number | undefined;
    salesLedgerId?: string | undefined;
    invoiceNumber?: string | undefined;
    productDescription?: string | undefined;
}, {
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    top?: number | undefined;
    orderNumber?: string | undefined;
    productItemId?: string | undefined;
    divisionId?: number | undefined;
    salesLedgerId?: string | undefined;
    invoiceNumber?: string | undefined;
    productDescription?: string | undefined;
}>;
export declare const reportAccountFinancialsSchema: z.ZodObject<{
    divisionId: z.ZodNumber;
    dateFrom: z.ZodOptional<z.ZodString>;
    dateTo: z.ZodOptional<z.ZodString>;
    top: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    top: number;
    divisionId: number;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
}, {
    divisionId: number;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    top?: number | undefined;
}>;
export declare function searchSalesInvoices(args: z.infer<typeof searchSalesInvoicesSchema>): Promise<string>;
export declare function getSalesInvoice(args: z.infer<typeof getSalesInvoiceSchema>): Promise<string>;
export declare function searchSalesTransactions(args: z.infer<typeof searchSalesTransactionsSchema>): Promise<string>;
export declare function reportAccountFinancials(args: z.infer<typeof reportAccountFinancialsSchema>): Promise<string>;
//# sourceMappingURL=financials.d.ts.map