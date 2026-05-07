/**
 * MCP tool handlers for System configuration — entity layouts, custom fields, and system options.
 */
import { z } from "zod";
export declare const searchSystemOptionsSchema: z.ZodObject<{
    option: z.ZodOptional<z.ZodString>;
    group: z.ZodOptional<z.ZodString>;
    top: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    top: number;
    option?: string | undefined;
    group?: string | undefined;
}, {
    top?: number | undefined;
    option?: string | undefined;
    group?: string | undefined;
}>;
export declare const getEntityFieldsSchema: z.ZodObject<{
    entityId: z.ZodString;
    customOnly: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    entityId: string;
    customOnly: boolean;
}, {
    entityId: string;
    customOnly?: boolean | undefined;
}>;
export declare const getEntityLayoutSchema: z.ZodObject<{
    entityId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    entityId: string;
}, {
    entityId: string;
}>;
export declare function searchSystemOptions(args: z.infer<typeof searchSystemOptionsSchema>): Promise<string>;
export declare function getEntityFields(args: z.infer<typeof getEntityFieldsSchema>): Promise<string>;
export declare function getEntityLayout(args: z.infer<typeof getEntityLayoutSchema>): Promise<string>;
//# sourceMappingURL=system.d.ts.map