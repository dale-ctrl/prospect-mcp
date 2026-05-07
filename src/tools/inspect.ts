/**
 * inspect_division_categorisation_panel — diagnostic tool that flattens every
 * candidate field for the WCG "Customising Company → Categorisation" panel.
 *
 * Round-5 update: most labels are now mapped to typed parameters on
 * create_division/update_division:
 *   - AREA LOCATION       → Division.TerritoryCode (territoryCode param)
 *   - SCHOOL STATUS       → Division.StandardIndustryCode (standardIndustryCode param)
 *   - SECTOR              → Division.LimitedId (sector param)
 *   - Account Tier        → Division.PriorityId (priorityId param)
 *   - Delivery Office     → Division.DeliveryZoneCode (deliveryZoneCode param)
 *   - Customer Type       → DivisionXtra.StandardDropdownField2 (customerType / customDropdown2)
 *   - Paper AM            → DivisionXtra.StandardDropdownField1 (customDropdown1)
 *   - Office Allocated    → DivisionXtra.StandardDropdownField3 (customDropdown3)
 *   - Coloured Paper PL   → DivisionXtra.StandardDropdownField4 (customDropdown4)
 *   - Laminating Pouches  → DivisionXtra.StandardDropdownField5 (customDropdown5)
 *   - Pupil Numbers       → Division.Employees (pupilNumbers param)
 *
 * Still unmapped:
 *   - Interiors Account Manager — multi-row sub-grid backed by what looks
 *     like a dictionary-layer extension table. NO entity in the OData
 *     metadata combines DivisionId + UserCode + AssignmentType. The data
 *     reachable via this connector does not include the Interiors AM
 *     subform; resolving it needs an HTTP capture from the Prospect UI's
 *     Network tab while saving an Interiors AM assignment to identify the
 *     URL the UI hits.
 *
 * Output: every populated field across Division, DivisionXtra, parent Company,
 * and CompanyXtra. Nulls/empty strings are stripped.
 */

import { z } from "zod";
import { getClient } from "../client.js";

export const inspectDivisionCategorisationPanelSchema = z.object({
  divisionId: z.number().int().describe("DivisionId to inspect"),
});

function isMeaningful(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string" && value.trim() === "") return false;
  return true;
}

function stripEmpty(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith("@odata.")) continue;
    if (isMeaningful(v)) out[k] = v;
  }
  return out;
}

export async function inspectDivisionCategorisationPanel(
  args: z.infer<typeof inspectDivisionCategorisationPanelSchema>,
): Promise<string> {
  const client = getClient();

  // Fetch the Division with full DivisionXtra inline. No $select — we want
  // every field, since we don't know which slot holds the label.
  const sp = new URLSearchParams();
  sp.set("$expand", "DivisionXtra");
  const division = await client.getById<Record<string, unknown>>("Divisions", args.divisionId, sp.toString());

  const divisionXtra = (division.DivisionXtra ?? null) as Record<string, unknown> | null;

  // Fetch the parent Company (+ CompanyXtra) so the full Categorisation panel
  // surface is covered. Company-level fields like Group Type live here.
  let company: Record<string, unknown> | null = null;
  let companyXtra: Record<string, unknown> | null = null;
  const companyId = division.CompanyId;
  if (typeof companyId === "number") {
    try {
      const csp = new URLSearchParams();
      csp.set("$expand", "CompanyXtra");
      const c = await client.getById<Record<string, unknown>>("Companies", companyId, csp.toString());
      company = c;
      companyXtra = (c.CompanyXtra ?? null) as Record<string, unknown> | null;
    } catch {
      // Best-effort — don't fail the whole inspect if Company lookup fails.
    }
  }

  // Strip Division.DivisionXtra back out of the cleaned division payload so we
  // surface it as a top-level section.
  const divisionFlat = stripEmpty(division);
  delete divisionFlat.DivisionXtra;
  const companyFlat = company ? stripEmpty(company) : null;
  if (companyFlat) delete companyFlat.CompanyXtra;

  return JSON.stringify(
    {
      divisionId: args.divisionId,
      hint:
        "Categorisation panel labels and their backing fields: " +
        "AREA LOCATION → Division.TerritoryCode, SCHOOL STATUS → Division.StandardIndustryCode, SECTOR → Division.LimitedId, " +
        "Account Tier → Division.PriorityId, Delivery Office → Division.DeliveryZoneCode, " +
        "Pupil Numbers → Division.Employees. Customer-Type-style dropdowns live on DivisionXtra.StandardDropdownField1..5. " +
        "Interiors Account Manager (multi-row sub-grid) is NOT in the OData surface — capture the URL the Prospect UI hits when saving an assignment to identify its backing entity.",
      division: divisionFlat,
      divisionXtra: divisionXtra ? stripEmpty(divisionXtra) : null,
      company: companyFlat,
      companyXtra: companyXtra ? stripEmpty(companyXtra) : null,
    },
    null,
    2,
  );
}
