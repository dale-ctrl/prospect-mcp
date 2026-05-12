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
import { getClient } from "../client.js";
// ─── Schema ─────────────────────────────────────────────────────────────
// Plain ZodObject — exposes `.shape` for MCP tool registration. The
// "divisionId OR addressId" cross-field constraint can't live on a
// ZodObject (refine() returns ZodEffects, which loses .shape), so it's
// enforced explicitly inside the handler instead.
export const updateDivisionAddressSchema = z.object({
    divisionId: z.number().int().positive().optional().describe("DivisionId to update. Either `divisionId` or `addressId` is required. " +
        "When supplied, the linked AddressId is resolved automatically (preferring " +
        "Division.AddressId, falling back to Division.MainAddressId)."),
    addressId: z.number().int().positive().optional().describe("AddressId — pass directly if already resolved (e.g. from a prior lookup). " +
        "Either `divisionId` or `addressId` is required."),
    addressLine1: z.string().optional().describe("Street address line 1."),
    addressLine2: z.string().optional().describe("Street address line 2."),
    addressLine3: z.string().optional().describe("Town / city (WCG convention)."),
    addressLine4: z.string().optional().describe("County / region (WCG convention)."),
    addressLine5: z.string().optional().describe("Additional address line (rare)."),
    postcode: z.string().optional().describe("Postcode. Foreign postcodes accepted as-is (no UK-format validation)."),
    country: z.string().optional().describe("Country (e.g. 'United Kingdom', 'Germany', 'Malta'). Optional."),
});
// camelCase input → PascalCase Address column. Anything not in this map is
// not patched (we don't blindly forward keys onto the Address row).
const FIELD_MAP = {
    addressLine1: "AddressLine1",
    addressLine2: "AddressLine2",
    addressLine3: "AddressLine3",
    addressLine4: "AddressLine4",
    addressLine5: "AddressLine5",
    postcode: "Postcode",
    country: "Country",
};
// ─── Helpers ────────────────────────────────────────────────────────────
/**
 * Trim a supplied string value. An explicit "" or whitespace-only string is
 * preserved as "" so the PATCH clears the field. Returns undefined if the
 * value itself is undefined (no PATCH for this key).
 */
function normaliseValue(v) {
    if (v === undefined)
        return undefined;
    const trimmed = v.trim();
    // Whitespace-only collapses to "" (clear). An explicit "" caller intent
    // already resolves here. Both paths produce "" which Prospect accepts as
    // a clear.
    return trimmed;
}
async function resolveAddressIdFromDivision(divisionId) {
    const client = getClient();
    const division = await client.getById("Divisions", divisionId, "$select=DivisionId,AddressId,MainAddressId,StatusFlag");
    if (division.StatusFlag === "D") {
        throw new Error(`Division ${divisionId} is soft-deleted (StatusFlag='D') — restore it before editing its address.`);
    }
    // Prefer AddressId (the populated column on the WCG tenant) and fall back
    // to MainAddressId for forks/tenants that use the alternate column.
    const id = division.AddressId ?? division.MainAddressId;
    if (!id) {
        throw new Error(`Division ${divisionId} has no linked Address record (both AddressId and MainAddressId are null).`);
    }
    return id;
}
// ─── Handler ────────────────────────────────────────────────────────────
export async function updateDivisionAddress(input) {
    const args = updateDivisionAddressSchema.parse(input);
    // Cross-field constraint — see comment on the schema.
    if (args.divisionId === undefined && args.addressId === undefined) {
        throw new Error("Must supply divisionId or addressId.");
    }
    const client = getClient();
    const addressId = args.addressId ?? (await resolveAddressIdFromDivision(args.divisionId));
    // Build PATCH body. `undefined` keys → skipped. `""` and whitespace-only →
    // explicit clear (forwarded as ""). Trimmed otherwise.
    const body = {};
    const changedCamel = [];
    for (const [camel, pascal] of Object.entries(FIELD_MAP)) {
        const raw = args[camel];
        const v = normaliseValue(raw);
        if (v !== undefined) {
            body[pascal] = v;
            changedCamel.push(camel);
        }
    }
    if (Object.keys(body).length === 0) {
        return "No fields supplied; no change.";
    }
    try {
        await client.patch("Addresses", addressId, body);
    }
    catch (err) {
        const msg = err.message || "";
        if (/HTTP 404/.test(msg)) {
            throw new Error(`Address ${addressId} not found.`);
        }
        throw err;
    }
    return `Address ${addressId} updated. Fields changed: ${changedCamel.join(", ")}.`;
}
//# sourceMappingURL=division-address.js.map