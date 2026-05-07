/**
 * MCP tool handlers for Quote header operations.
 */
import { z } from "zod";
import { getClient } from "../client.js";
const OPERATING_COMPANY_CODE = "A"; // Westcountry Group
const QUOTE_DESCRIPTION_MAX = 250; // Quote.Description column cap
// When a quote is linked to an opportunity, WCG policy is that the quote
// description must mirror the opportunity description so the two stay in sync
// across the pipeline. Returns null when the lead has no description on file
// (caller falls back to its own description arg in that case).
async function fetchOpportunityDescription(leadId) {
    const client = getClient();
    const lead = await client.getById("Leads", leadId, "$select=Description");
    const desc = lead.Description?.trim();
    if (!desc)
        return null;
    return desc.length > QUOTE_DESCRIPTION_MAX ? desc.slice(0, QUOTE_DESCRIPTION_MAX) : desc;
}
// ─── Schemas ───────────────────────────────────────────────────
export const searchQuotesSchema = z.object({
    description: z.string().optional().describe("Search term to match against quote description"),
    contactName: z.string().optional().describe("Contact name to filter by (partial match)"),
    divisionName: z.string().optional().describe("Company/division name to filter by"),
    salesPersonId: z.string().optional().describe("Salesperson user code, e.g. 'DL'"),
    statusDescription: z.string().optional().describe("Status description to filter by, e.g. 'Quote', 'Order'"),
    dateFrom: z.string().optional().describe("Filter quotes created on or after this date (ISO format)"),
    dateTo: z.string().optional().describe("Filter quotes created on or before this date (ISO format)"),
    top: z.number().optional().default(20).describe("Max results to return (default 20)"),
});
export const getQuoteSchema = z.object({
    quoteId: z.number().describe("The QuoteId to retrieve"),
});
export const createQuoteSchema = z.object({
    contactId: z.number().describe("ContactId for the customer. Use search_contacts to find this."),
    leadId: z.number().optional().describe("LeadId (opportunity) to link this quote to. Use search_opportunities to find. When supplied, the quote description is automatically copied from the opportunity's Description, overriding any `description` arg below."),
    description: z.string().optional().describe("Quote description/title. IGNORED when `leadId` is supplied — the opportunity's description is used instead. Only used when there is no linked opportunity, or as a fallback when the linked opportunity has no description on file."),
    salesPersonId: z.string().optional().describe("Salesperson user code, e.g. 'DL'"),
    orderDueDate: z.string().optional().describe("Due date in ISO format"),
    customerOrderReference: z.string().optional().describe("Customer's PO or reference number"),
    memo: z.string().optional().describe("Internal notes"),
    projectCode: z.string().optional().describe("WCG project code"),
    overallDiscountPercentage: z.number().optional().describe("Header-level discount percentage"),
    deliveryName: z.string().optional().describe("Delivery address name"),
    deliveryAddressLine1: z.string().optional().describe("Delivery address line 1"),
    deliveryAddressLine2: z.string().optional().describe("Delivery address line 2"),
    deliveryAddressLine3: z.string().optional().describe("Delivery address line 3 (town)"),
    deliveryPostcode: z.string().optional().describe("Delivery postcode"),
    deliveryCountry: z.string().optional().describe("Delivery country"),
});
export const updateQuoteSchema = z.object({
    quoteId: z.number().describe("The QuoteId to update"),
    leadId: z.number().optional().describe("LeadId (opportunity) to link this quote to. When supplied, the quote description is automatically re-copied from the opportunity's Description, overriding any `description` arg below."),
    description: z.string().optional().describe("New quote description. IGNORED when `leadId` is also being set on this update — the opportunity's description is used instead. Used as a fallback only when the linked opportunity has no description on file."),
    salesPersonId: z.string().optional(),
    orderNumber: z.string().optional(),
    orderDueDate: z.string().optional(),
    customerOrderReference: z.string().optional(),
    memo: z.string().optional(),
    projectCode: z.string().optional(),
    overallDiscountPercentage: z.number().optional(),
    deliveryName: z.string().optional(),
    deliveryAddressLine1: z.string().optional(),
    deliveryAddressLine2: z.string().optional(),
    deliveryAddressLine3: z.string().optional(),
    deliveryPostcode: z.string().optional(),
    deliveryCountry: z.string().optional(),
});
export const duplicateQuoteSchema = z.object({
    quoteId: z.number().describe("The QuoteId to duplicate"),
    newDescription: z.string().optional().describe("Description for the new quote. IGNORED when the original quote is linked to an opportunity — the opportunity's description is used instead so the duplicate stays in sync. Falls back to 'COPY - <original description>' only when there is no linked opportunity."),
    newContactId: z.number().optional().describe("ContactId for the new quote. If omitted, uses the same contact as the original."),
    newSalesPersonId: z.string().optional().describe("Salesperson for the new quote. If omitted, uses the same as the original."),
});
export const addQuoteLineGroupSchema = z.object({
    quoteId: z.number().describe("The QuoteId to add the group to"),
    title: z.string().describe("Group/section heading"),
    showSubtotal: z.boolean().optional().describe("Show a subtotal for this group (default true)"),
    showPriceColumn: z.boolean().optional().describe("Show the price column in this section (default true)"),
    showDiscount: z.boolean().optional().describe("Show the discount column (default true)"),
    sequence: z.number().optional().describe("Display order"),
});
export const deleteQuoteSchema = z.object({
    quoteId: z.number().describe("The QuoteId to delete. This is permanent."),
});
// ─── Handlers ──────────────────────────────────────────────────
export async function searchQuotes(args) {
    const client = getClient();
    const filters = [];
    const expand = "Contact($select=Forename,Surname;$expand=Division($select=Name)),Status($select=Description),SalesPerson($select=UserName)";
    if (args.description) {
        filters.push(`contains(Description,'${args.description}')`);
    }
    if (args.contactName) {
        filters.push(`(contains(Contact/Forename,'${args.contactName}') or contains(Contact/Surname,'${args.contactName}'))`);
    }
    if (args.divisionName) {
        filters.push(`contains(Contact/Division/Name,'${args.divisionName}')`);
    }
    if (args.salesPersonId) {
        filters.push(`SalesPersonId eq '${args.salesPersonId}'`);
    }
    if (args.statusDescription) {
        filters.push(`contains(Status/Description,'${args.statusDescription}')`);
    }
    if (args.dateFrom) {
        filters.push(`Created ge ${args.dateFrom}`);
    }
    if (args.dateTo) {
        filters.push(`Created le ${args.dateTo}`);
    }
    // Exclude deleted records
    filters.push("StatusFlag ne 'D'");
    const params = [
        `$expand=${expand}`,
        `$orderby=Created desc`,
        `$top=${args.top || 20}`,
        `$select=QuoteId,Description,OrderNumber,CustomerOrderReference,DecimalHomeNetValue,DecimalHomeGrossValue,MarginPercentage,QuoteDate,OrderDueDate,Created,RecordLink`,
    ];
    if (filters.length > 0) {
        params.push(`$filter=${filters.join(" and ")}`);
    }
    const result = await client.get("Quotes", params.join("&"));
    if (result.value.length === 0) {
        return "No quotes found matching the search criteria.";
    }
    const lines = result.value.map((q) => {
        const contact = q.Contact ? `${q.Contact.Forename || ""} ${q.Contact.Surname || ""}`.trim() : "N/A";
        const company = q.Contact?.Division?.Name || "N/A";
        const status = q.Status?.Description || "Unknown";
        const salesperson = q.SalesPerson?.UserName || q.SalesPersonId || "N/A";
        return [
            `**Quote #${q.QuoteId}** — ${q.Description || "(no description)"}`,
            `  Company: ${company} | Contact: ${contact}`,
            `  Status: ${status} | Salesperson: ${salesperson}`,
            `  Net: £${q.DecimalHomeNetValue?.toFixed(2) ?? "0.00"} | Gross: £${q.DecimalHomeGrossValue?.toFixed(2) ?? "0.00"} | Margin: ${q.MarginPercentage?.toFixed(1) ?? "N/A"}%`,
            `  Created: ${q.Created?.substring(0, 10) || "N/A"} | Due: ${q.OrderDueDate?.substring(0, 10) || "N/A"}`,
            `  Link: ${q.RecordLink || "N/A"}`,
        ].join("\n");
    });
    return `Found ${result.value.length} quote(s):\n\n${lines.join("\n\n")}`;
}
export async function getQuote(args) {
    const client = getClient();
    const expand = [
        "QuoteLines($select=LineId,ProductItemId,Description,DecimalQuantity,DecimalPrice,DecimalDiscountPercentage,DecimalNetValue,DecimalGrossValue,DecimalCostPrice,DecimalCostValue,MarginPercentage,Sequence,TaxCode;$orderby=Sequence)",
        "Contact($select=ContactId,Forename,Surname,Email,PhoneNumber;$expand=Division($select=DivisionId,Name,SalesLedgerId))",
        "Status($select=QuoteStatusCode,Description)",
        "SalesPerson($select=UserCode,UserName)",
        "QuoteXtra",
    ].join(",");
    const quote = await client.getById("Quotes", args.quoteId, `$expand=${expand}`);
    const contact = quote.Contact ? `${quote.Contact.Forename || ""} ${quote.Contact.Surname || ""}`.trim() : "N/A";
    const company = quote.Contact?.Division?.Name || "N/A";
    const accountCode = quote.Contact?.Division?.SalesLedgerId || "N/A";
    let output = [
        `# Quote #${quote.QuoteId}`,
        `**Description:** ${quote.Description || "(none)"}`,
        `**Status:** ${quote.Status?.Description || "Unknown"}`,
        `**Company:** ${company} (${accountCode})`,
        `**Contact:** ${contact} (ID: ${quote.ContactId})`,
        `**Salesperson:** ${quote.SalesPerson?.UserName || quote.SalesPersonId || "N/A"}`,
        `**PO/Order Number:** ${quote.OrderNumber || "N/A"}`,
        `**Customer Ref:** ${quote.CustomerOrderReference || "N/A"}`,
        `**Project Code:** ${quote.ProjectCode || "N/A"}`,
        `**Created:** ${quote.Created?.substring(0, 10) || "N/A"}`,
        `**Due Date:** ${quote.OrderDueDate?.substring(0, 10) || "N/A"}`,
        `**Discount:** ${quote.OverallDiscountPercentage ?? 0}%`,
        `**Memo:** ${quote.Memo || "(none)"}`,
        "",
        `## Totals`,
        `- Net: £${quote.DecimalHomeNetValue?.toFixed(2) ?? "0.00"}`,
        `- Gross: £${quote.DecimalHomeGrossValue?.toFixed(2) ?? "0.00"}`,
        `- Cost: £${quote.DecimalHomeCostValue?.toFixed(2) ?? "0.00"}`,
        `- Margin: ${quote.MarginPercentage?.toFixed(1) ?? "N/A"}%`,
        "",
        `## Delivery Address`,
        [quote.DeliveryName, quote.DeliveryAddressLine1, quote.DeliveryAddressLine2, quote.DeliveryAddressLine3, quote.DeliveryPostcode, quote.DeliveryCountry]
            .filter(Boolean)
            .join(", ") || "(none set)",
        "",
        `## Lines (${quote.QuoteLines?.length || 0})`,
    ].join("\n");
    if (quote.QuoteLines && quote.QuoteLines.length > 0) {
        const lineRows = quote.QuoteLines.map((l, i) => {
            return [
                `${i + 1}. **${l.ProductItemId || "—"}** — ${l.Description}`,
                `   Qty: ${l.DecimalQuantity ?? 0} × £${l.DecimalPrice?.toFixed(2) ?? "0.00"}`,
                `   Discount: ${l.DecimalDiscountPercentage?.toFixed(1) ?? "0"}% | Net: £${l.DecimalNetValue?.toFixed(2) ?? "0.00"} | Gross: £${l.DecimalGrossValue?.toFixed(2) ?? "0.00"}`,
                `   Cost: £${l.DecimalCostPrice?.toFixed(2) ?? "0.00"} | Margin: ${l.MarginPercentage?.toFixed(1) ?? "N/A"}%`,
                `   (LineId: ${l.LineId})`,
            ].join("\n");
        });
        output += "\n" + lineRows.join("\n\n");
    }
    else {
        output += "\n(No lines on this quote)";
    }
    // Include Xtra/custom fields if present
    const quoteAny = quote;
    const xtra = quoteAny.QuoteXtra;
    if (xtra) {
        output += "\n\n## Custom Fields (Xtra)";
        const xtraLines = [];
        for (let i = 1; i <= 10; i++) {
            const textVal = xtra[`StandardTextField${i}`];
            if (textVal != null && textVal !== "")
                xtraLines.push(`**Text ${i}:** ${textVal}`);
            const decVal = xtra[`StandardDecimalField${i}`];
            if (decVal != null)
                xtraLines.push(`**Decimal ${i}:** ${decVal}`);
        }
        for (let i = 1; i <= 5; i++) {
            const dateVal = xtra[`StandardDateField${i}`];
            if (dateVal != null)
                xtraLines.push(`**Date ${i}:** ${dateVal?.substring?.(0, 10) || dateVal}`);
            const boolVal = xtra[`StandardBooleanField${i}`];
            if (boolVal != null)
                xtraLines.push(`**Boolean ${i}:** ${boolVal}`);
        }
        output += "\n" + (xtraLines.length > 0 ? xtraLines.join("\n") : "(no custom fields set)");
    }
    output += `\n\n**CRM Link:** ${quote.RecordLink || "N/A"}`;
    return output;
}
export async function createQuote(args) {
    const client = getClient();
    const body = {
        ContactId: args.contactId,
        OperatingCompanyCode: OPERATING_COMPANY_CODE,
    };
    // WCG rule: when linked to an opportunity, the quote description always
    // mirrors the opportunity's. Caller's `description` is only used as a
    // fallback if the lead has no description on file.
    let resolvedDescription = args.description;
    let descriptionSource = args.description ? "argument" : "none";
    if (args.leadId !== undefined) {
        const fromLead = await fetchOpportunityDescription(args.leadId);
        if (fromLead) {
            resolvedDescription = fromLead;
            descriptionSource = "opportunity";
        }
    }
    // Map optional fields
    if (args.leadId !== undefined)
        body.LeadId = args.leadId;
    if (resolvedDescription !== undefined)
        body.Description = resolvedDescription;
    if (args.salesPersonId !== undefined)
        body.SalesPersonId = args.salesPersonId;
    if (args.orderDueDate !== undefined)
        body.OrderDueDate = args.orderDueDate;
    if (args.customerOrderReference !== undefined)
        body.CustomerOrderReference = args.customerOrderReference;
    if (args.memo !== undefined)
        body.Memo = args.memo;
    if (args.projectCode !== undefined)
        body.ProjectCode = args.projectCode;
    if (args.overallDiscountPercentage !== undefined)
        body.OverallDiscountPercentage = args.overallDiscountPercentage;
    if (args.deliveryName !== undefined)
        body.DeliveryName = args.deliveryName;
    if (args.deliveryAddressLine1 !== undefined)
        body.DeliveryAddressLine1 = args.deliveryAddressLine1;
    if (args.deliveryAddressLine2 !== undefined)
        body.DeliveryAddressLine2 = args.deliveryAddressLine2;
    if (args.deliveryAddressLine3 !== undefined)
        body.DeliveryAddressLine3 = args.deliveryAddressLine3;
    if (args.deliveryPostcode !== undefined)
        body.DeliveryPostcode = args.deliveryPostcode;
    if (args.deliveryCountry !== undefined)
        body.DeliveryCountry = args.deliveryCountry;
    const created = await client.post("Quotes", body);
    const descriptionNote = descriptionSource === "opportunity"
        ? " (copied from linked opportunity)"
        : args.leadId !== undefined && descriptionSource === "argument"
            ? " (linked opportunity has no description — used `description` arg as fallback)"
            : "";
    return [
        `✅ Quote created successfully!`,
        `**QuoteId:** ${created.QuoteId}`,
        `**Description:** ${created.Description || "(none)"}${descriptionNote}`,
        `**Contact:** ${created.ContactId}`,
        `**Status:** ${created.StatusId}`,
        `**Created:** ${created.Created?.substring(0, 10) || "now"}`,
        `**CRM Link:** ${created.RecordLink || "N/A"}`,
        "",
        `Next: Use **add_quote_line** with QuoteId ${created.QuoteId} to add line items.`,
    ].join("\n");
}
export async function updateQuote(args) {
    const client = getClient();
    const { quoteId, ...fields } = args;
    // WCG rule: when relinking to an opportunity, the quote description is
    // re-copied from that opportunity. Caller's `description` is only used as
    // a fallback if the lead has no description on file.
    let resolvedDescription = fields.description;
    let descriptionSource = fields.description !== undefined ? "argument" : "none";
    if (fields.leadId !== undefined) {
        const fromLead = await fetchOpportunityDescription(fields.leadId);
        if (fromLead) {
            resolvedDescription = fromLead;
            descriptionSource = "opportunity";
        }
    }
    // Build PATCH body from provided fields, mapping camelCase args → PascalCase API fields
    const body = {};
    if (fields.leadId !== undefined)
        body.LeadId = fields.leadId;
    if (resolvedDescription !== undefined)
        body.Description = resolvedDescription;
    if (fields.salesPersonId !== undefined)
        body.SalesPersonId = fields.salesPersonId;
    if (fields.orderNumber !== undefined)
        body.OrderNumber = fields.orderNumber;
    if (fields.orderDueDate !== undefined)
        body.OrderDueDate = fields.orderDueDate;
    if (fields.customerOrderReference !== undefined)
        body.CustomerOrderReference = fields.customerOrderReference;
    if (fields.memo !== undefined)
        body.Memo = fields.memo;
    if (fields.projectCode !== undefined)
        body.ProjectCode = fields.projectCode;
    if (fields.overallDiscountPercentage !== undefined)
        body.OverallDiscountPercentage = fields.overallDiscountPercentage;
    if (fields.deliveryName !== undefined)
        body.DeliveryName = fields.deliveryName;
    if (fields.deliveryAddressLine1 !== undefined)
        body.DeliveryAddressLine1 = fields.deliveryAddressLine1;
    if (fields.deliveryAddressLine2 !== undefined)
        body.DeliveryAddressLine2 = fields.deliveryAddressLine2;
    if (fields.deliveryAddressLine3 !== undefined)
        body.DeliveryAddressLine3 = fields.deliveryAddressLine3;
    if (fields.deliveryPostcode !== undefined)
        body.DeliveryPostcode = fields.deliveryPostcode;
    if (fields.deliveryCountry !== undefined)
        body.DeliveryCountry = fields.deliveryCountry;
    if (Object.keys(body).length === 0) {
        return "No fields provided to update. Specify at least one field to change.";
    }
    await client.patch("Quotes", quoteId, body);
    const noteParts = [];
    if (descriptionSource === "opportunity") {
        noteParts.push("Description was copied from the linked opportunity.");
    }
    else if (fields.leadId !== undefined && fields.description !== undefined && descriptionSource === "argument") {
        noteParts.push("Linked opportunity has no description on file — used `description` arg as fallback.");
    }
    const note = noteParts.length ? `\n${noteParts.join(" ")}` : "";
    return `✅ Quote #${quoteId} updated successfully. Fields changed: ${Object.keys(body).join(", ")}${note}`;
}
export async function duplicateQuote(args) {
    const client = getClient();
    // Step 1: Fetch the original quote with all lines
    const expand = [
        "QuoteLines($select=ProductItemId,Description,ExtendedDescription,DecimalPrice,DecimalCostPrice,DecimalDiscountPercentage,Sequence,TaxCode,GroupId,Quantity,QuantityDecimals;$orderby=Sequence)",
    ].join(",");
    const original = await client.getById("Quotes", args.quoteId, `$expand=${expand}`);
    // WCG rule: when the original quote is linked to an opportunity, the
    // duplicate stays linked to that same opportunity AND its description is
    // re-copied from the opportunity (so a refreshed opp description flows
    // through). Caller's `newDescription` is only used as a fallback.
    let resolvedDescription = args.newDescription;
    let descriptionSource = args.newDescription ? "argument" : "copy-prefix";
    if (original.LeadId != null) {
        const fromLead = await fetchOpportunityDescription(original.LeadId);
        if (fromLead) {
            resolvedDescription = fromLead;
            descriptionSource = "opportunity";
        }
    }
    if (resolvedDescription === undefined) {
        resolvedDescription = `COPY - ${original.Description || "Quote #" + original.QuoteId}`;
    }
    // Step 2: Create the new quote header
    const newHeader = {
        ContactId: args.newContactId || original.ContactId,
        OperatingCompanyCode: OPERATING_COMPANY_CODE,
        Description: resolvedDescription,
        SalesPersonId: args.newSalesPersonId || original.SalesPersonId,
    };
    if (original.LeadId != null)
        newHeader.LeadId = original.LeadId;
    if (original.OrderDueDate)
        newHeader.OrderDueDate = original.OrderDueDate;
    if (original.CustomerOrderReference)
        newHeader.CustomerOrderReference = original.CustomerOrderReference;
    if (original.Memo)
        newHeader.Memo = original.Memo;
    if (original.ProjectCode)
        newHeader.ProjectCode = original.ProjectCode;
    if (original.OverallDiscountPercentage)
        newHeader.OverallDiscountPercentage = original.OverallDiscountPercentage;
    if (original.DeliveryName)
        newHeader.DeliveryName = original.DeliveryName;
    if (original.DeliveryAddressLine1)
        newHeader.DeliveryAddressLine1 = original.DeliveryAddressLine1;
    if (original.DeliveryAddressLine2)
        newHeader.DeliveryAddressLine2 = original.DeliveryAddressLine2;
    if (original.DeliveryAddressLine3)
        newHeader.DeliveryAddressLine3 = original.DeliveryAddressLine3;
    if (original.DeliveryPostcode)
        newHeader.DeliveryPostcode = original.DeliveryPostcode;
    if (original.DeliveryCountry)
        newHeader.DeliveryCountry = original.DeliveryCountry;
    const newQuote = await client.post("Quotes", newHeader);
    const newQuoteId = newQuote.QuoteId;
    // Step 3: Copy all lines to the new quote
    let linesCopied = 0;
    const lines = original.QuoteLines || [];
    for (const line of lines) {
        const lineBody = {
            QuoteId: newQuoteId,
            Description: line.Description,
        };
        if (line.ProductItemId)
            lineBody.ProductItemId = line.ProductItemId;
        if (line.ExtendedDescription)
            lineBody.ExtendedDescription = line.ExtendedDescription;
        if (line.DecimalPrice != null)
            lineBody.DecimalPrice = line.DecimalPrice;
        if (line.DecimalCostPrice != null)
            lineBody.DecimalCostPrice = line.DecimalCostPrice;
        if (line.DecimalDiscountPercentage != null)
            lineBody.DecimalDiscountPercentage = line.DecimalDiscountPercentage;
        if (line.Sequence != null)
            lineBody.Sequence = line.Sequence;
        if (line.TaxCode)
            lineBody.TaxCode = line.TaxCode;
        // Copy quantity using raw integer fields
        const lineAny = line;
        if (lineAny.Quantity != null) {
            lineBody.Quantity = lineAny.Quantity;
            lineBody.QuantityDecimals = lineAny.QuantityDecimals ?? 0;
        }
        await client.post("QuoteLines", lineBody);
        linesCopied++;
    }
    const descriptionNote = descriptionSource === "opportunity"
        ? " (copied from linked opportunity)"
        : original.LeadId != null && descriptionSource === "argument"
            ? " (linked opportunity has no description — used `newDescription` arg as fallback)"
            : original.LeadId != null && descriptionSource === "copy-prefix"
                ? " (linked opportunity has no description — fell back to COPY prefix)"
                : "";
    return [
        `Quote duplicated successfully!`,
        `**Original:** Quote #${args.quoteId} — ${original.Description || "(no description)"}`,
        `**New QuoteId:** ${newQuoteId}`,
        `**Description:** ${newQuote.Description}${descriptionNote}`,
        `**Lines copied:** ${linesCopied}`,
        `**Contact:** ${newQuote.ContactId}`,
        original.LeadId != null ? `**Linked opportunity:** Lead #${original.LeadId} (carried from original)` : "",
        `**CRM Link:** ${newQuote.RecordLink || "N/A"}`,
    ].filter(Boolean).join("\n");
}
export async function addQuoteLineGroup(args) {
    const client = getClient();
    const body = {
        QuoteId: args.quoteId,
        Title: args.title,
    };
    if (args.showSubtotal !== undefined)
        body.ShowSubtotal = args.showSubtotal;
    if (args.showPriceColumn !== undefined)
        body.ShowPriceColumn = args.showPriceColumn;
    if (args.showDiscount !== undefined)
        body.ShowDiscount = args.showDiscount;
    if (args.sequence !== undefined)
        body.Sequence = args.sequence;
    const created = await client.post("QuoteLineGroups", body);
    return [
        `Group added to Quote #${args.quoteId}`,
        `**GroupId:** ${created.GroupId}`,
        `**Title:** ${created.Title || args.title}`,
        "",
        `Use **add_quote_line** with groupId: ${created.GroupId} to add lines to this section.`,
    ].join("\n");
}
export async function deleteQuote(args) {
    const client = getClient();
    await client.delete("Quotes", args.quoteId);
    return `Quote #${args.quoteId} deleted successfully.`;
}
//# sourceMappingURL=quotes.js.map