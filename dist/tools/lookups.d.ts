/**
 * MCP tool handlers for supporting lookups — contacts, products, divisions, statuses.
 */
import { z } from "zod";
export declare const searchContactsSchema: z.ZodObject<{
    searchTerm: z.ZodString;
    top: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    top: number;
    searchTerm: string;
}, {
    searchTerm: string;
    top?: number | undefined;
}>;
export declare const searchProductsSchema: z.ZodObject<{
    searchTerm: z.ZodString;
    salesAnalysisMin: z.ZodOptional<z.ZodNumber>;
    salesAnalysisMax: z.ZodOptional<z.ZodNumber>;
    top: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    top: number;
    searchTerm: string;
    salesAnalysisMin?: number | undefined;
    salesAnalysisMax?: number | undefined;
}, {
    searchTerm: string;
    top?: number | undefined;
    salesAnalysisMin?: number | undefined;
    salesAnalysisMax?: number | undefined;
}>;
export declare const getProductDetailSchema: z.ZodObject<{
    productItemId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    productItemId: string;
}, {
    productItemId: string;
}>;
export declare const divisionFiltersSchema: z.ZodObject<{
    customerType: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    relationship: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    territoryCode: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    accountManager: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    postcode: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    customDropdown1: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    customDropdown2: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    customDropdown3: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    customDropdown4: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    customDropdown5: z.ZodOptional<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    customerType?: string | undefined;
    relationship?: string | undefined;
    territoryCode?: string | undefined;
    accountManager?: string | undefined;
    postcode?: string | undefined;
    customDropdown1?: string | undefined;
    customDropdown2?: string | undefined;
    customDropdown3?: string | undefined;
    customDropdown4?: string | undefined;
    customDropdown5?: string | undefined;
}, {
    customerType?: string | undefined;
    relationship?: string | undefined;
    territoryCode?: string | undefined;
    accountManager?: string | undefined;
    postcode?: string | undefined;
    customDropdown1?: string | undefined;
    customDropdown2?: string | undefined;
    customDropdown3?: string | undefined;
    customDropdown4?: string | undefined;
    customDropdown5?: string | undefined;
}>;
export declare const searchDivisionsSchema: z.ZodObject<{
    searchTerm: z.ZodString;
    top: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    filters: z.ZodOptional<z.ZodObject<{
        customerType: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        relationship: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        territoryCode: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        accountManager: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        postcode: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        customDropdown1: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        customDropdown2: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        customDropdown3: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        customDropdown4: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        customDropdown5: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        customerType?: string | undefined;
        relationship?: string | undefined;
        territoryCode?: string | undefined;
        accountManager?: string | undefined;
        postcode?: string | undefined;
        customDropdown1?: string | undefined;
        customDropdown2?: string | undefined;
        customDropdown3?: string | undefined;
        customDropdown4?: string | undefined;
        customDropdown5?: string | undefined;
    }, {
        customerType?: string | undefined;
        relationship?: string | undefined;
        territoryCode?: string | undefined;
        accountManager?: string | undefined;
        postcode?: string | undefined;
        customDropdown1?: string | undefined;
        customDropdown2?: string | undefined;
        customDropdown3?: string | undefined;
        customDropdown4?: string | undefined;
        customDropdown5?: string | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    top: number;
    searchTerm: string;
    filters?: {
        customerType?: string | undefined;
        relationship?: string | undefined;
        territoryCode?: string | undefined;
        accountManager?: string | undefined;
        postcode?: string | undefined;
        customDropdown1?: string | undefined;
        customDropdown2?: string | undefined;
        customDropdown3?: string | undefined;
        customDropdown4?: string | undefined;
        customDropdown5?: string | undefined;
    } | undefined;
}, {
    searchTerm: string;
    top?: number | undefined;
    filters?: {
        customerType?: string | undefined;
        relationship?: string | undefined;
        territoryCode?: string | undefined;
        accountManager?: string | undefined;
        postcode?: string | undefined;
        customDropdown1?: string | undefined;
        customDropdown2?: string | undefined;
        customDropdown3?: string | undefined;
        customDropdown4?: string | undefined;
        customDropdown5?: string | undefined;
    } | undefined;
}>;
export declare const listDivisionsSchema: z.ZodObject<{
    filters: z.ZodOptional<z.ZodObject<{
        customerType: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        relationship: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        territoryCode: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        accountManager: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        postcode: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        customDropdown1: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        customDropdown2: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        customDropdown3: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        customDropdown4: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        customDropdown5: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        customerType?: string | undefined;
        relationship?: string | undefined;
        territoryCode?: string | undefined;
        accountManager?: string | undefined;
        postcode?: string | undefined;
        customDropdown1?: string | undefined;
        customDropdown2?: string | undefined;
        customDropdown3?: string | undefined;
        customDropdown4?: string | undefined;
        customDropdown5?: string | undefined;
    }, {
        customerType?: string | undefined;
        relationship?: string | undefined;
        territoryCode?: string | undefined;
        accountManager?: string | undefined;
        postcode?: string | undefined;
        customDropdown1?: string | undefined;
        customDropdown2?: string | undefined;
        customDropdown3?: string | undefined;
        customDropdown4?: string | undefined;
        customDropdown5?: string | undefined;
    }>>;
    fields: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    pageSize: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    skip: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    pageSize: number;
    fields?: string[] | undefined;
    filters?: {
        customerType?: string | undefined;
        relationship?: string | undefined;
        territoryCode?: string | undefined;
        accountManager?: string | undefined;
        postcode?: string | undefined;
        customDropdown1?: string | undefined;
        customDropdown2?: string | undefined;
        customDropdown3?: string | undefined;
        customDropdown4?: string | undefined;
        customDropdown5?: string | undefined;
    } | undefined;
    skip?: number | undefined;
}, {
    fields?: string[] | undefined;
    filters?: {
        customerType?: string | undefined;
        relationship?: string | undefined;
        territoryCode?: string | undefined;
        accountManager?: string | undefined;
        postcode?: string | undefined;
        customDropdown1?: string | undefined;
        customDropdown2?: string | undefined;
        customDropdown3?: string | undefined;
        customDropdown4?: string | undefined;
        customDropdown5?: string | undefined;
    } | undefined;
    pageSize?: number | undefined;
    skip?: number | undefined;
}>;
export declare const getQuoteStatusesSchema: z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>;
export declare function searchContacts(args: z.infer<typeof searchContactsSchema>): Promise<string>;
export declare function searchProducts(args: z.infer<typeof searchProductsSchema>): Promise<string>;
export declare function getProductDetail(args: z.infer<typeof getProductDetailSchema>): Promise<string>;
export declare function searchDivisions(args: z.infer<typeof searchDivisionsSchema>): Promise<string>;
export declare function listDivisions(args: z.infer<typeof listDivisionsSchema>): Promise<string>;
export declare function getQuoteStatuses(): Promise<string>;
//# sourceMappingURL=lookups.d.ts.map