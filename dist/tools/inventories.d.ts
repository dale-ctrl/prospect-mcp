/**
 * MCP tool handlers for Inventory (asset/equipment tracking) operations.
 * Inventories track physical items/assets at customer sites, linked to divisions, contracts, and problems.
 */
import { z } from "zod";
export declare const searchInventoriesSchema: z.ZodObject<{
    description: z.ZodOptional<z.ZodString>;
    serialNumber: z.ZodOptional<z.ZodString>;
    divisionId: z.ZodOptional<z.ZodNumber>;
    divisionName: z.ZodOptional<z.ZodString>;
    productItemId: z.ZodOptional<z.ZodString>;
    dateFrom: z.ZodOptional<z.ZodString>;
    dateTo: z.ZodOptional<z.ZodString>;
    top: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    top: number;
    description?: string | undefined;
    divisionName?: string | undefined;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    productItemId?: string | undefined;
    divisionId?: number | undefined;
    serialNumber?: string | undefined;
}, {
    description?: string | undefined;
    divisionName?: string | undefined;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    top?: number | undefined;
    productItemId?: string | undefined;
    divisionId?: number | undefined;
    serialNumber?: string | undefined;
}>;
export declare const getInventorySchema: z.ZodObject<{
    inventoryId: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    inventoryId: number;
}, {
    inventoryId: number;
}>;
export declare function searchInventories(args: z.infer<typeof searchInventoriesSchema>): Promise<string>;
export declare function getInventory(args: z.infer<typeof getInventorySchema>): Promise<string>;
//# sourceMappingURL=inventories.d.ts.map