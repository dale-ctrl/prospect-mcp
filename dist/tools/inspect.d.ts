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
export declare const inspectDivisionCategorisationPanelSchema: z.ZodObject<{
    divisionId: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    divisionId: number;
}, {
    divisionId: number;
}>;
export declare function inspectDivisionCategorisationPanel(args: z.infer<typeof inspectDivisionCategorisationPanelSchema>): Promise<string>;
//# sourceMappingURL=inspect.d.ts.map