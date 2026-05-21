/**
 * MCP tool handlers for Contact and Division creation/update.
 * Contacts belong to Divisions (companies) — creating a contact
 * for a new company requires creating the Division first.
 */
import { z } from "zod";
import { getClient } from "../client.js";
import { toCrmLink } from "../lib/urls.js";
import { resolveDropdownValue } from "./dropdowns.js";
import { resolveContactRole, resolveRoleCodeOrLabel } from "../lib/role-mapper.js";
// ─── Schemas ───────────────────────────────────────────────────
export const createDivisionSchema = z.object({
    name: z.string().describe("Company/organisation name"),
    companyId: z.number().int().positive().optional().describe("Optional CompanyId of an existing parent Company (e.g. a Trust). When set, the new Division is attached to that Company instead of creating a fresh one. Useful for adding MAT-member schools under their Trust's Company. Validates the target Company exists."),
    phoneNumber: z.string().optional().describe("Main phone number"),
    website: z.string().optional().describe("Company website URL"),
    relationship: z.string().optional().describe("Relationship type, e.g. 'Customer', 'Prospect', 'Supplier'"),
    salesLedgerId: z.string().optional().describe("Account code in the sales ledger"),
    territoryCode: z.string().optional().describe("AREA LOCATION — patches Division.TerritoryCode. Accepts FK code " +
        "(e.g. 'WGAREA137e6eff02e14d98942fe6b8baf5af77') or UI label (e.g. 'WG AREA')."),
    accountManager: z.string().optional().describe("Division.AccountManager — the 3-char user code (e.g. 'ML1', 'JL', 'DL'). " +
        "Use list_users to discover valid codes."),
    customerType: z.string().optional().describe("Alias for customDropdown2 — the user-visible 'Customer Type' dropdown on this tenant. " +
        "Backed by DivisionXtra/StandardDropdownField2. Pass the label as it appears in the UI, e.g. 'M.A.T.'."),
    // Custom dropdown slots — match the read-side filter shape. Each writes to
    // DivisionXtra/StandardDropdownField{N} via a follow-up PATCH after the
    // Division row is created.
    customDropdown1: z.string().optional().describe("Writes to DivisionXtra/StandardDropdownField1 (paperAccountManager on WCG). Accepts UI label or FK code."),
    customDropdown2: z.string().optional().describe("Writes to DivisionXtra/StandardDropdownField2 (customerType on WCG). Accepts UI label or FK code."),
    customDropdown3: z.string().optional().describe("Writes to DivisionXtra/StandardDropdownField3 (officeAllocated on WCG). Accepts UI label or FK code."),
    customDropdown4: z.string().optional().describe("Writes to DivisionXtra/StandardDropdownField4 (colouredPaperPriceList on WCG). Accepts UI label or FK code."),
    customDropdown5: z.string().optional().describe("Writes to DivisionXtra/StandardDropdownField5 (laminatingPouchesList on WCG). Accepts UI label or FK code."),
    // Built-in Division FKs from the Categorisation panel. Live verification on
    // DivisionId 2069 in round 3 confirmed all PATCH cleanly. Round 5 corrected
    // the standardIndustryCode label (it's SCHOOL STATUS on this tenant, not
    // SECTOR) and added sector → Division.LimitedId.
    standardIndustryCode: z.string().optional().describe("SCHOOL STATUS — patches Division.StandardIndustryCode. " +
        "Accepts FK code or UI label (e.g. 'ACADEMY', 'FREE SCHOOL', 'INDEPENDENT', 'LOCAL AUTHORITY', 'NOT A SCHOOL')."),
    sector: z.string().optional().describe("SECTOR — patches Division.LimitedId. Accepts FK code (e.g. 'a9ef19') or UI label (e.g. 'EDUCATION')."),
    deliveryZoneCode: z.string().optional().describe("Delivery Office — patches Division.DeliveryZoneCode. M.A.T. = '5ceeb6'. " +
        "Accepts the FK code or the UI label."),
    priorityId: z.number().int().optional().describe("Account Tier — patches Division.PriorityId (integer 1/2/3)."),
    turnoverId: z.string().optional().describe("Turnover band — patches Division.TurnoverId. Accepts the FK code or the UI label."),
    // Pupil Numbers maps to Division.Employees per WCG convention (Wave MAT
    // has Employees=446 for ~446 pupils). If a dedicated DivisionXtra slot
    // surfaces later, swap this over.
    pupilNumbers: z.number().int().optional().describe("Pupil Numbers — alias for Division.Employees on the WCG tenant (used as pupil count for schools/MATs)."),
    // TODO(area-location, school-status): not exposed yet. The Categorisation
    // panel of the WCG Division v91 layout shows AREA LOCATION and SCHOOL
    // STATUS, but the static metadata doesn't tell us which DivisionXtra slot
    // each maps to on this tenant. To identify:
    //   1. GET /Divisions(5516)?$expand=DivisionXtra and inspect every
    //      populated DivisionXtra field on Wave MAT.
    //   2. Look for FK-shaped values that aren't already in
    //      StandardDropdownField1..5. Likely candidates are
    //      StandardSearchTextField1..3 or StandardTextField1..10.
    //   3. Cross-reference with what the UI shows in the Categorisation panel.
    // Once identified, add typed parameters here and to list_dropdown_options.
    source: z.string().optional().describe("How this company was sourced"),
    longDescription: z.string().optional().describe("Notes about the company"),
    addressLine1: z.string().optional().describe("Address line 1"),
    addressLine2: z.string().optional().describe("Address line 2"),
    addressLine3: z.string().optional().describe("Address line 3 (town/city)"),
    addressLine4: z.string().optional().describe("Address line 4 (county)"),
    addressLine5: z.string().optional().describe("Address line 5"),
    postcode: z.string().optional().describe("Postcode"),
    country: z.string().optional().describe("Country"),
});
export const createContactSchema = z.object({
    divisionId: z.number().describe("DivisionId (company) this contact belongs to. Use search_divisions to find, or create_division to create a new company first."),
    forename: z.string().describe("First name"),
    surname: z.string().describe("Last name"),
    roleCode: z.string().optional().describe("Contact role — accepts the FK code (e.g. 'b730fd') OR a UI label / canonical role name (e.g. 'SENCO', 'Bursar / Finance / SBM'). When omitted, the connector auto-resolves from jobTitle / jobFunction using the WCG role-mapping rules; falls back to 'Office / Admin'."),
    title: z.string().optional().describe("Title (Mr, Mrs, Ms, Dr, etc.)"),
    jobTitle: z.string().optional().describe("Job title. Drives the auto role-resolver when roleCode is not supplied."),
    jobFunction: z.string().optional().describe("Job function — secondary input to the auto role-resolver. Tried after jobTitle. Not stored separately on the Contact."),
    department: z.string().optional().describe("Department"),
    email: z.string().optional().describe("Email address"),
    phoneNumber: z.string().optional().describe("Phone number"),
    mobilePhoneNumber: z.string().optional().describe("Mobile phone number"),
    salutation: z.string().optional().describe("How to address them in letters (e.g. 'Dear Dale')"),
    source: z.string().optional().describe("How this contact was sourced"),
});
export const updateContactSchema = z.object({
    contactId: z.number().describe("The ContactId to update"),
    forename: z.string().optional(),
    surname: z.string().optional(),
    title: z.string().optional(),
    jobTitle: z.string().optional().describe("Job title. When patched without an explicit roleCode, the connector also auto-resolves the role via the WCG mapping rules. Pass roleCode explicitly to keep the existing role."),
    jobFunction: z.string().optional().describe("Job function — secondary input to the auto role-resolver, used only when jobTitle is being patched and roleCode isn't supplied."),
    department: z.string().optional(),
    email: z.string().optional(),
    phoneNumber: z.string().optional(),
    mobilePhoneNumber: z.string().optional(),
    salutation: z.string().optional(),
    source: z.string().optional(),
    roleCode: z.string().optional().describe("Contact role — accepts the FK code (e.g. 'b730fd') OR a UI label (e.g. 'SENCO'). Explicit value wins over auto-resolution. Omit to leave the role unchanged unless jobTitle is also being patched (in which case auto-resolution kicks in)."),
});
export const updateDivisionSchema = z.object({
    divisionId: z.number().describe("The DivisionId to update"),
    companyId: z.number().int().positive().optional().describe("Re-parent this Division under a different Company (Trust/group). Validates the target Company exists. Use this for MAT-member schools that should sit under their Trust."),
    name: z.string().optional().describe("Company name"),
    phoneNumber: z.string().optional().describe("Phone number"),
    website: z.string().optional().describe("Website URL"),
    employees: z.number().optional().describe("Employee/pupil count"),
    relationship: z.string().optional().describe("Relationship type"),
    salesLedgerId: z.string().optional().describe("Account code"),
    territoryCode: z.string().optional().describe("AREA LOCATION — patches Division.TerritoryCode. Accepts FK code or UI label (e.g. 'WG AREA')."),
    accountManager: z.string().optional().describe("Division.AccountManager — the 3-char user code (e.g. 'ML1')."),
    customerType: z.string().optional().describe("Alias for customDropdown2. Writes to DivisionXtra/StandardDropdownField2 (NOT the dead Division.CustomerType column). " +
        "Pass the UI label, e.g. 'M.A.T.'."),
    customDropdown1: z.string().optional().describe("Writes to DivisionXtra/StandardDropdownField1. Accepts UI label or FK code."),
    customDropdown2: z.string().optional().describe("Writes to DivisionXtra/StandardDropdownField2. Accepts UI label or FK code."),
    customDropdown3: z.string().optional().describe("Writes to DivisionXtra/StandardDropdownField3. Accepts UI label or FK code."),
    customDropdown4: z.string().optional().describe("Writes to DivisionXtra/StandardDropdownField4. Accepts UI label or FK code."),
    customDropdown5: z.string().optional().describe("Writes to DivisionXtra/StandardDropdownField5. Accepts UI label or FK code."),
    standardIndustryCode: z.string().optional().describe("SCHOOL STATUS — patches Division.StandardIndustryCode. Accepts FK code or UI label (e.g. 'ACADEMY')."),
    sector: z.string().optional().describe("SECTOR — patches Division.LimitedId. Accepts FK code or UI label (e.g. 'EDUCATION')."),
    deliveryZoneCode: z.string().optional().describe("Delivery Office — patches Division.DeliveryZoneCode. Accepts FK code or UI label."),
    priorityId: z.number().int().optional().describe("Account Tier — patches Division.PriorityId (integer)."),
    turnoverId: z.string().optional().describe("Turnover band — patches Division.TurnoverId. Accepts FK code or UI label."),
    pupilNumbers: z.number().int().optional().describe("Pupil Numbers — alias for Division.Employees on the WCG tenant."),
    source: z.string().optional().describe("Source"),
    longDescription: z.string().optional().describe("Notes about the company"),
    locale: z.string().optional().describe("Locale"),
});
export const getContactRolesSchema = z.object({});
export const resolveContactRoleSchema = z.object({
    jobTitle: z.string().nullable().optional().describe("Job title to map (case-insensitive substring match against the WCG rule table)."),
    jobFunction: z.string().nullable().optional().describe("Job function — secondary input. Tried only if jobTitle yields no match."),
});
export const lookupCompanyInfoSchema = z.object({
    companyName: z.string().describe("Company name to search for online"),
    website: z.string().optional().describe("Company website URL if known — more accurate than name search"),
});
// ─── Handlers ──────────────────────────────────────────────────
const DEFAULT_ROLE_CODE = "271c0d"; // "Office / Admin"
const OPERATING_COMPANY_CODE = "A"; // Westcountry Group (single company)
/**
 * Build a {StandardDropdownField{N}: <FK code>} body from caller args.
 *
 * `customerType` is an alias for `customDropdown2`; an explicit `customDropdown2`
 * wins if both are supplied. Each value is resolved through the dropdown
 * cache so the caller can pass either the human label ('M.A.T.') or the
 * underlying FK string ('Entity.DivisionXtra.StandardDropdownField2.04a2188e').
 *
 * Returns null if no dropdown values were supplied.
 */
async function buildDivisionXtraDropdownBody(args) {
    const slots = [
        [1, args.customDropdown1],
        [2, args.customDropdown2 ?? args.customerType],
        [3, args.customDropdown3],
        [4, args.customDropdown4],
        [5, args.customDropdown5],
    ];
    const body = {};
    for (const [slot, val] of slots) {
        if (val !== undefined) {
            const code = await resolveDropdownValue(`customDropdown${slot}`, val);
            body[`StandardDropdownField${slot}`] = code;
        }
    }
    return Object.keys(body).length > 0 ? body : null;
}
/**
 * Resolve and apply the four built-in Division FK fields (SECTOR, Delivery
 * Office, Account Tier, Turnover) onto a body object. Each is a label-or-FK
 * passthrough except priorityId which is numeric.
 */
async function applyDivisionStandardFields(body, fields) {
    if (fields.standardIndustryCode !== undefined) {
        body.StandardIndustryCode = await resolveDropdownValue("standardIndustryCode", fields.standardIndustryCode);
    }
    if (fields.sector !== undefined) {
        body.LimitedId = await resolveDropdownValue("sector", fields.sector);
    }
    if (fields.deliveryZoneCode !== undefined) {
        body.DeliveryZoneCode = await resolveDropdownValue("deliveryZoneCode", fields.deliveryZoneCode);
    }
    if (fields.priorityId !== undefined) {
        // PriorityId is numeric. resolveDropdownValue returns a string code; cast back.
        const resolved = await resolveDropdownValue("priorityId", fields.priorityId);
        body.PriorityId = parseInt(resolved, 10);
    }
    if (fields.turnoverId !== undefined) {
        body.TurnoverId = await resolveDropdownValue("turnoverId", fields.turnoverId);
    }
}
/**
 * Upsert the DivisionXtra row for a Division. DivisionXtra has a 1:1 link to
 * Division (its primary key IS DivisionId). In practice Prospect auto-creates
 * the Xtra row alongside the Division, so PATCH is the common case; if the
 * row is somehow missing we fall back to POST.
 *
 * The "Customer Type" dropdown the WCG UI shows is StandardDropdownField2 —
 * NOT the dead Division.CustomerType built-in column, which 400s with code
 * -194 ('No primary key value for foreign key division_customertype').
 */
async function patchDivisionXtraDropdowns(divisionId, body) {
    const client = getClient();
    try {
        await client.patch("DivisionXtras", divisionId, body);
    }
    catch (err) {
        // If the Xtra row doesn't exist (rare), create it. Match on 404; let other errors propagate.
        const msg = err.message || "";
        if (/HTTP 404/.test(msg)) {
            await client.post("DivisionXtras", {
                DivisionId: divisionId,
                ...body,
            });
            return;
        }
        throw err;
    }
}
export async function createDivision(args) {
    const client = getClient();
    // Prospect hierarchy: Company → Division → Contact. The Prospect API does
    // NOT auto-create a parent Company — we explicitly POST one first. Without
    // this step the Division POST 400s on missing CompanyId.
    //
    // v1.6.0: when args.companyId is supplied, skip the Company-create step
    // and attach the new Division to that existing Company. This is how
    // MAT-member schools sit under a Trust's Company rather than getting a
    // fresh single-company Company alongside.
    let companyId;
    let attachedToExistingCompany = false;
    if (args.companyId !== undefined) {
        // Validate the target Company exists and isn't deleted.
        const target = await client.getById("Companies", args.companyId, "$select=CompanyId,Name,StatusFlag");
        if (target.StatusFlag === "D") {
            throw new Error(`Target CompanyId ${args.companyId} is deleted — cannot attach a new Division to it.`);
        }
        companyId = args.companyId;
        attachedToExistingCompany = true;
    }
    else {
        // Step 1: Create the Company (requires Name + TypeId "CUS" for customer)
        const company = await client.post("Companies", {
            Name: args.name,
            TypeId: "CUS",
        });
        companyId = company.CompanyId;
    }
    // Step 2: Create the Division under the Company. customerType / customDropdown*
    // are NOT included — those go to the linked DivisionXtra row in step 4.
    const divBody = {
        Name: args.name,
        CompanyId: companyId,
        OperatingCompanyCode: OPERATING_COMPANY_CODE,
    };
    if (args.phoneNumber !== undefined)
        divBody.PhoneNumber = args.phoneNumber;
    if (args.website !== undefined)
        divBody.Website = args.website;
    if (args.relationship !== undefined)
        divBody.Relationship = args.relationship;
    if (args.salesLedgerId !== undefined)
        divBody.SalesLedgerId = args.salesLedgerId;
    if (args.territoryCode !== undefined)
        divBody.TerritoryCode = args.territoryCode;
    if (args.accountManager !== undefined)
        divBody.AccountManager = args.accountManager;
    if (args.source !== undefined)
        divBody.Source = args.source;
    if (args.longDescription !== undefined)
        divBody.LongDescription = args.longDescription;
    if (args.pupilNumbers !== undefined)
        divBody.Employees = args.pupilNumbers;
    await applyDivisionStandardFields(divBody, args);
    const division = await client.post("Divisions", divBody);
    const divisionId = division.DivisionId;
    const addressId = division.AddressId;
    // Step 3: Update the address if any address fields were provided
    const hasAddress = args.addressLine1 || args.addressLine2 || args.addressLine3 ||
        args.addressLine4 || args.addressLine5 || args.postcode || args.country;
    if (hasAddress && addressId) {
        const addrBody = {};
        if (args.addressLine1 !== undefined)
            addrBody.AddressLine1 = args.addressLine1;
        if (args.addressLine2 !== undefined)
            addrBody.AddressLine2 = args.addressLine2;
        if (args.addressLine3 !== undefined)
            addrBody.AddressLine3 = args.addressLine3;
        if (args.addressLine4 !== undefined)
            addrBody.AddressLine4 = args.addressLine4;
        if (args.addressLine5 !== undefined)
            addrBody.AddressLine5 = args.addressLine5;
        if (args.postcode !== undefined)
            addrBody.Postcode = args.postcode;
        if (args.country !== undefined)
            addrBody.Country = args.country;
        await client.patch("Addresses", addressId, addrBody);
    }
    // Step 4: Write any dropdown values to DivisionXtra (the user-visible
    // "Customer Type" and four other custom dropdowns).
    const xtraBody = await buildDivisionXtraDropdownBody(args);
    if (xtraBody) {
        await patchDivisionXtraDropdowns(divisionId, xtraBody);
    }
    return [
        attachedToExistingCompany
            ? `Division created and attached to existing Company ${companyId}.`
            : `Company and Division created successfully!`,
        `**CompanyId:** ${companyId}${attachedToExistingCompany ? " (existing — re-used)" : " (newly created)"}`,
        `**DivisionId:** ${divisionId}`,
        `**Name:** ${division.Name || args.name}`,
        `**AddressId:** ${addressId}`,
        `**Website:** ${division.Website || "N/A"}`,
        `**Phone:** ${division.PhoneNumber || "N/A"}`,
        `**Created:** ${division.Created?.substring(0, 10) || "now"}`,
        `**CRM Link:** ${toCrmLink(division.RecordLink)}`,
        xtraBody ? `**Custom dropdowns set on DivisionXtra:** ${Object.keys(xtraBody).join(", ")}` : "",
        "",
        `Next: Use **create_contact** with DivisionId ${divisionId} to add people at this company.`,
    ].filter((l) => l !== "").join("\n");
}
export async function updateDivision(args) {
    const client = getClient();
    const { divisionId, ...fields } = args;
    // Built-in Division columns. customerType / customDropdown* are NOT here —
    // they target DivisionXtra and are dispatched separately below.
    const body = {};
    if (fields.name !== undefined)
        body.Name = fields.name;
    if (fields.phoneNumber !== undefined)
        body.PhoneNumber = fields.phoneNumber;
    if (fields.website !== undefined)
        body.Website = fields.website;
    if (fields.employees !== undefined)
        body.Employees = fields.employees;
    if (fields.pupilNumbers !== undefined)
        body.Employees = fields.pupilNumbers;
    if (fields.relationship !== undefined)
        body.Relationship = fields.relationship;
    if (fields.salesLedgerId !== undefined)
        body.SalesLedgerId = fields.salesLedgerId;
    if (fields.territoryCode !== undefined)
        body.TerritoryCode = fields.territoryCode;
    if (fields.accountManager !== undefined)
        body.AccountManager = fields.accountManager;
    if (fields.source !== undefined)
        body.Source = fields.source;
    if (fields.longDescription !== undefined)
        body.LongDescription = fields.longDescription;
    if (fields.locale !== undefined)
        body.Locale = fields.locale;
    if (fields.companyId !== undefined) {
        // Validate the target Company exists and isn't deleted before we PATCH —
        // Prospect's PATCH would otherwise return a misleading 500.
        const target = await client.getById("Companies", fields.companyId, "$select=CompanyId,StatusFlag");
        if (target.StatusFlag === "D") {
            throw new Error(`Target CompanyId ${fields.companyId} is deleted — cannot re-parent to it.`);
        }
        body.CompanyId = fields.companyId;
    }
    await applyDivisionStandardFields(body, fields);
    const xtraBody = await buildDivisionXtraDropdownBody(fields);
    if (Object.keys(body).length === 0 && !xtraBody) {
        return "No fields provided to update. Specify at least one field to change.";
    }
    const changedFields = [];
    if (Object.keys(body).length > 0) {
        await client.patch("Divisions", divisionId, body);
        changedFields.push(...Object.keys(body));
    }
    if (xtraBody) {
        await patchDivisionXtraDropdowns(divisionId, xtraBody);
        changedFields.push(...Object.keys(xtraBody).map((k) => `DivisionXtra.${k}`));
    }
    return `Division #${divisionId} updated successfully. Fields changed: ${changedFields.join(", ")}`;
}
/**
 * Resolve a caller-supplied roleCode (FK code OR UI label) to a canonical
 * FK code, or return null on no match. Hits the API once per call to grab
 * the live ContactRoles list (cheap; 11 rows on WCG tenant).
 *
 * Throws if the caller supplied a roleCode that doesn't match anything —
 * better to fail fast than silently default to Office/Admin and obscure
 * the typo.
 */
async function resolveExplicitRoleCode(input) {
    const client = getClient();
    const result = await client.get("ContactRoles", "$select=Code,Description&$filter=Obsolete eq 0");
    const resolved = resolveRoleCodeOrLabel(input, result.value);
    if (!resolved) {
        const list = result.value
            .map((r) => `  ${r.Code} — ${r.Description || "(no description)"}`)
            .join("\n");
        throw new Error(`Unknown contact role: "${input}". Pass either the FK code or a label that matches one of:\n${list}`);
    }
    return resolved;
}
export async function createContact(args) {
    const client = getClient();
    // Role resolution: explicit roleCode wins; otherwise auto-resolve from
    // jobTitle / jobFunction; otherwise default to Office/Admin.
    let resolvedRole;
    let autoResolution = null;
    if (args.roleCode !== undefined && args.roleCode !== "") {
        resolvedRole = await resolveExplicitRoleCode(args.roleCode);
    }
    else {
        autoResolution = resolveContactRole({
            jobTitle: args.jobTitle ?? null,
            jobFunction: args.jobFunction ?? null,
        });
        resolvedRole = { code: autoResolution.code, label: autoResolution.label };
    }
    const body = {
        DivisionId: args.divisionId,
        Forename: args.forename,
        Surname: args.surname,
        RoleCode: resolvedRole.code,
    };
    if (args.title !== undefined)
        body.Title = args.title;
    if (args.jobTitle !== undefined)
        body.JobTitle = args.jobTitle;
    if (args.department !== undefined)
        body.Department = args.department;
    if (args.email !== undefined)
        body.Email = args.email;
    if (args.phoneNumber !== undefined)
        body.PhoneNumber = args.phoneNumber;
    if (args.mobilePhoneNumber !== undefined)
        body.MobilePhoneNumber = args.mobilePhoneNumber;
    if (args.salutation !== undefined)
        body.Salutation = args.salutation;
    if (args.source !== undefined)
        body.Source = args.source;
    const created = await client.post("Contacts", body);
    const lines = [
        `Contact created successfully!`,
        `**ContactId:** ${created.ContactId}`,
        `**Name:** ${created.Forename || args.forename} ${created.Surname || args.surname}`,
        `**DivisionId:** ${created.DivisionId}`,
        `**Email:** ${created.Email || "N/A"}`,
        `**Phone:** ${created.PhoneNumber || "N/A"}`,
        `**Job Title:** ${created.JobTitle || "N/A"}`,
        `**Role:** ${resolvedRole.code} — ${resolvedRole.label}`,
    ];
    if (autoResolution) {
        lines.push(`**Role auto-resolved via:** ${autoResolution.matchedRule}`);
    }
    lines.push(`**CRM Link:** ${toCrmLink(created.RecordLink)}`);
    return lines.join("\n");
}
export async function updateContact(args) {
    const client = getClient();
    const { contactId, ...fields } = args;
    const body = {};
    if (fields.forename !== undefined)
        body.Forename = fields.forename;
    if (fields.surname !== undefined)
        body.Surname = fields.surname;
    if (fields.title !== undefined)
        body.Title = fields.title;
    if (fields.jobTitle !== undefined)
        body.JobTitle = fields.jobTitle;
    if (fields.department !== undefined)
        body.Department = fields.department;
    if (fields.email !== undefined)
        body.Email = fields.email;
    if (fields.phoneNumber !== undefined)
        body.PhoneNumber = fields.phoneNumber;
    if (fields.mobilePhoneNumber !== undefined)
        body.MobilePhoneNumber = fields.mobilePhoneNumber;
    if (fields.salutation !== undefined)
        body.Salutation = fields.salutation;
    if (fields.source !== undefined)
        body.Source = fields.source;
    // Role resolution:
    //   - Explicit roleCode wins outright.
    //   - Otherwise, only auto-resolve when the caller is patching jobTitle
    //     in this same call. Otherwise we'd silently overwrite the existing
    //     role on every unrelated update — a footgun for bulk re-edits.
    let roleSummary = null;
    if (fields.roleCode !== undefined && fields.roleCode !== "") {
        const r = await resolveExplicitRoleCode(fields.roleCode);
        body.RoleCode = r.code;
        roleSummary = { ...r, via: "explicit" };
    }
    else if (fields.jobTitle !== undefined) {
        const r = resolveContactRole({
            jobTitle: fields.jobTitle ?? null,
            jobFunction: fields.jobFunction ?? null,
        });
        body.RoleCode = r.code;
        roleSummary = { code: r.code, label: r.label, via: r.matchedRule };
    }
    if (Object.keys(body).length === 0) {
        return "No fields provided to update. Specify at least one field to change.";
    }
    await client.patch("Contacts", contactId, body);
    const summary = [`Contact #${contactId} updated. Fields changed: ${Object.keys(body).join(", ")}`];
    if (roleSummary) {
        summary.push(`Role set to ${roleSummary.code} — ${roleSummary.label} (via ${roleSummary.via}).`);
    }
    return summary.join("\n");
}
export async function resolveContactRoleHandler(args) {
    const r = resolveContactRole({
        jobTitle: args.jobTitle ?? null,
        jobFunction: args.jobFunction ?? null,
    });
    return [
        `**Resolved role:** ${r.code} — ${r.label}`,
        `**Matched rule:** ${r.matchedRule}`,
        `**Inputs:** jobTitle=${JSON.stringify(args.jobTitle ?? null)}, jobFunction=${JSON.stringify(args.jobFunction ?? null)}`,
        ``,
        `_This is a dry-run preview — no record is written. Use create_contact / update_contact with the same inputs to actually apply._`,
    ].join("\n");
}
export async function getContactRoles() {
    const client = getClient();
    const result = await client.get("ContactRoles", "$select=Code,Description&$filter=Obsolete eq 0&$orderby=Description");
    if (result.value.length === 0)
        return "No contact roles found.";
    const lines = result.value.map((r) => `- \`${r.Code}\` — ${r.Description || "(no description)"}`);
    return `## Contact Roles (${result.value.length})\n${lines.join("\n")}`;
}
export async function lookupCompanyInfo(args) {
    // This tool returns a structured prompt for Claude to use with web search.
    // The MCP server itself doesn't have web access — Claude Desktop does.
    // We return instructions for Claude to search and then call create_division/create_contact.
    const searchTarget = args.website || args.companyName;
    return [
        `## Company Lookup Request`,
        ``,
        `Please search the web for publicly available information about: **${args.companyName}**${args.website ? ` (website: ${args.website})` : ""}`,
        ``,
        `Look for:`,
        `- **Full company name** and any trading names`,
        `- **Address** (registered office or main office)`,
        `- **Phone number** (main switchboard)`,
        `- **Website URL**`,
        `- **Key contacts** — names, job titles, email addresses if publicly listed`,
        `- **Industry / sector** — what they do`,
        `- **Company size** — employees, turnover if available`,
        ``,
        `Once you have this information, use **create_division** to create the company in Prospect CRM, then **create_contact** for each person you find.`,
        ``,
        `Tip: Check the company's website "About", "Team", "Contact Us" pages. Also try LinkedIn and Companies House.`,
    ].join("\n");
}
//# sourceMappingURL=contacts.js.map