/**
 * `update_division_address` — patches the registered Address on a Division.
 *
 * Addresses live on a separate OData entity (`Address`, entity set
 * `Addresses`) linked from the Division. This tool resolves the link and
 * PATCHes the Address row directly. Cross-entity behaviour is deliberately
 * kept in a dedicated tool rather than hidden inside `update_division`,
 * mirroring the precedent set by `update_division_versa_maintenance`.
 *
 * **Tenant note (verified live against WCG 2026-05-12).** The original spec
 * called for resolving the linked Address via `Division.MainAddressId`. On
 * the WCG tenant `MainAddressId` is null on every active Division sampled
 * (15/15); the populated column is `Division.AddressId`. This handler tries
 * `AddressId` first then falls back to `MainAddressId` so it works on both
 * tenant layouts.
 *
 * **Empty-string semantics.** An explicit `""` (or whitespace-only string)
 * is interpreted as "clear this line" — useful for removing a stale
 * `addressLine2` left over from an import. Only `undefined` keys are
 * skipped. Whitespace is trimmed from non-empty values before PATCH; if
 * the trimmed result is empty, the field is cleared.
 *
 * **`addressLine3` semantics on WCG.** `addressLine3` is Town/City. Don't
 * put county data there — that's `addressLine4`.
 */
import { z } from "zod";
export declare const updateDivisionAddressSchema: z.ZodObject<{
    divisionId: z.ZodOptional<z.ZodNumber>;
    addressId: z.ZodOptional<z.ZodNumber>;
    addressLine1: z.ZodOptional<z.ZodString>;
    addressLine2: z.ZodOptional<z.ZodString>;
    addressLine3: z.ZodOptional<z.ZodString>;
    addressLine4: z.ZodOptional<z.ZodString>;
    addressLine5: z.ZodOptional<z.ZodString>;
    postcode: z.ZodOptional<z.ZodString>;
    country: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    postcode?: string | undefined;
    divisionId?: number | undefined;
    addressLine1?: string | undefined;
    addressLine2?: string | undefined;
    addressLine3?: string | undefined;
    addressLine4?: string | undefined;
    addressLine5?: string | undefined;
    country?: string | undefined;
    addressId?: number | undefined;
}, {
    postcode?: string | undefined;
    divisionId?: number | undefined;
    addressLine1?: string | undefined;
    addressLine2?: string | undefined;
    addressLine3?: string | undefined;
    addressLine4?: string | undefined;
    addressLine5?: string | undefined;
    country?: string | undefined;
    addressId?: number | undefined;
}>;
export declare function updateDivisionAddress(input: z.input<typeof updateDivisionAddressSchema>): Promise<string>;
//# sourceMappingURL=division-address.d.ts.map