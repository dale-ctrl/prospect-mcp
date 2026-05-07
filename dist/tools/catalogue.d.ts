/**
 * MCP tool handlers for Product Catalogue (categories/families),
 * Contact Preferences, and Division Sales History.
 */
import { z } from "zod";
export declare const getProductCategoriesSchema: z.ZodObject<{
    includeObsolete: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    includeObsolete: boolean;
}, {
    includeObsolete?: boolean | undefined;
}>;
export declare const searchProductsByCategorySchema: z.ZodObject<{
    categoryId: z.ZodString;
    top: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    top: number;
    categoryId: string;
}, {
    categoryId: string;
    top?: number | undefined;
}>;
export declare const getContactPreferencesSchema: z.ZodObject<{
    contactId: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    contactId: number;
}, {
    contactId: number;
}>;
export declare const getDivisionSalesHistorySchema: z.ZodObject<{
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
export declare const createInventorySchema: z.ZodObject<{
    divisionId: z.ZodNumber;
    description: z.ZodString;
    typeId: z.ZodString;
    statusCode: z.ZodString;
    serialNumber: z.ZodOptional<z.ZodString>;
    productItemId: z.ZodOptional<z.ZodString>;
    location: z.ZodOptional<z.ZodString>;
    versionNumber: z.ZodOptional<z.ZodString>;
    instances: z.ZodOptional<z.ZodNumber>;
    extendedDescription: z.ZodOptional<z.ZodString>;
    documentRef: z.ZodOptional<z.ZodString>;
    invoiceNumber: z.ZodOptional<z.ZodString>;
    manufacturerReference: z.ZodOptional<z.ZodString>;
    contractReference: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    description: string;
    divisionId: number;
    typeId: string;
    statusCode: string;
    productItemId?: string | undefined;
    extendedDescription?: string | undefined;
    serialNumber?: string | undefined;
    location?: string | undefined;
    versionNumber?: string | undefined;
    instances?: number | undefined;
    documentRef?: string | undefined;
    invoiceNumber?: string | undefined;
    manufacturerReference?: string | undefined;
    contractReference?: string | undefined;
}, {
    description: string;
    divisionId: number;
    typeId: string;
    statusCode: string;
    productItemId?: string | undefined;
    extendedDescription?: string | undefined;
    serialNumber?: string | undefined;
    location?: string | undefined;
    versionNumber?: string | undefined;
    instances?: number | undefined;
    documentRef?: string | undefined;
    invoiceNumber?: string | undefined;
    manufacturerReference?: string | undefined;
    contractReference?: string | undefined;
}>;
export declare const updateInventorySchema: z.ZodObject<{
    inventoryId: z.ZodNumber;
    description: z.ZodOptional<z.ZodString>;
    serialNumber: z.ZodOptional<z.ZodString>;
    location: z.ZodOptional<z.ZodString>;
    versionNumber: z.ZodOptional<z.ZodString>;
    instances: z.ZodOptional<z.ZodNumber>;
    extendedDescription: z.ZodOptional<z.ZodString>;
    documentRef: z.ZodOptional<z.ZodString>;
    invoiceNumber: z.ZodOptional<z.ZodString>;
    manufacturerReference: z.ZodOptional<z.ZodString>;
    contractReference: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    inventoryId: number;
    description?: string | undefined;
    extendedDescription?: string | undefined;
    serialNumber?: string | undefined;
    location?: string | undefined;
    versionNumber?: string | undefined;
    instances?: number | undefined;
    documentRef?: string | undefined;
    invoiceNumber?: string | undefined;
    manufacturerReference?: string | undefined;
    contractReference?: string | undefined;
}, {
    inventoryId: number;
    description?: string | undefined;
    extendedDescription?: string | undefined;
    serialNumber?: string | undefined;
    location?: string | undefined;
    versionNumber?: string | undefined;
    instances?: number | undefined;
    documentRef?: string | undefined;
    invoiceNumber?: string | undefined;
    manufacturerReference?: string | undefined;
    contractReference?: string | undefined;
}>;
export declare const getInventoryLookupsSchema: z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>;
export declare function getProductCategories(args: z.infer<typeof getProductCategoriesSchema>): Promise<string>;
export declare function searchProductsByCategory(args: z.infer<typeof searchProductsByCategorySchema>): Promise<string>;
export declare function getContactPreferences(args: z.infer<typeof getContactPreferencesSchema>): Promise<string>;
export declare function getDivisionSalesHistory(args: z.infer<typeof getDivisionSalesHistorySchema>): Promise<string>;
export declare function createInventory(args: z.infer<typeof createInventorySchema>): Promise<string>;
export declare function updateInventory(args: z.infer<typeof updateInventorySchema>): Promise<string>;
export declare function getInventoryLookups(): Promise<string>;
//# sourceMappingURL=catalogue.d.ts.map