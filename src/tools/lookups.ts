/**
 * MCP tool handlers for supporting lookups — contacts, products, divisions, statuses.
 */

import { z } from "zod";
import { getClient } from "../client.js";
import type { Contact, Division, ProductItem, QuoteStatus } from "../types/prospect.js";

// ─── Schemas ───────────────────────────────────────────────────

export const searchContactsSchema = z.object({
  searchTerm: z.string().describe("Name, email, or phone number to search for"),
  top: z.number().optional().default(10).describe("Max results (default 10)"),
});

export const searchProductsSchema = z.object({
  searchTerm: z.string().describe("Product code (SKU) or description to search for"),
  salesAnalysisMin: z.number().optional().describe("Filter by SalesAnalysis nominal >= this value (e.g. 1000 for paper range 1000–1195)"),
  salesAnalysisMax: z.number().optional().describe("Filter by SalesAnalysis nominal <= this value"),
  top: z.number().optional().default(10).describe("Max results (default 10)"),
});

export const searchDivisionsSchema = z.object({
  searchTerm: z.string().describe("Company/division name or account code to search for"),
  top: z.number().optional().default(10).describe("Max results (default 10)"),
});

export const getQuoteStatusesSchema = z.object({});

// ─── Handlers ──────────────────────────────────────────────────

export async function searchContacts(args: z.infer<typeof searchContactsSchema>): Promise<string> {
  const client = getClient();
  const term = args.searchTerm;

  const filter = [
    `(contains(Forename,'${term}') or contains(Surname,'${term}') or contains(Email,'${term}') or contains(PhoneNumber,'${term}'))`,
    "StatusFlag ne 'D'",
  ].join(" and ");

  const params = [
    `$filter=${filter}`,
    `$expand=Division($select=DivisionId,Name,SalesLedgerId)`,
    `$select=ContactId,DivisionId,Forename,Surname,Email,PhoneNumber,MobilePhoneNumber,JobTitle,RecordLink`,
    `$top=${args.top || 10}`,
    `$orderby=Surname,Forename`,
  ].join("&");

  const result = await client.get<Contact>("Contacts", params);

  if (result.value.length === 0) {
    return `No contacts found matching "${term}".`;
  }

  const lines = result.value.map((c) => {
    const name = `${c.Forename || ""} ${c.Surname || ""}`.trim();
    const company = c.Division?.Name || "N/A";
    const account = c.Division?.SalesLedgerId || "";
    return [
      `**${name}** (ContactId: ${c.ContactId})`,
      `  Company: ${company}${account ? ` [${account}]` : ""} (DivisionId: ${c.DivisionId})`,
      `  Job: ${c.JobTitle || "N/A"} | Email: ${c.Email || "N/A"} | Phone: ${c.PhoneNumber || c.MobilePhoneNumber || "N/A"}`,
    ].join("\n");
  });

  return `Found ${result.value.length} contact(s):\n\n${lines.join("\n\n")}`;
}

export async function searchProducts(args: z.infer<typeof searchProductsSchema>): Promise<string> {
  const client = getClient();
  const term = args.searchTerm;

  const filterParts = [
    `(contains(ProductItemId,'${term}') or contains(Description,'${term}'))`,
    "Obsolete ne 1",
  ];
  if (args.salesAnalysisMin !== undefined) filterParts.push(`SalesAnalysis ge ${args.salesAnalysisMin}`);
  if (args.salesAnalysisMax !== undefined) filterParts.push(`SalesAnalysis le ${args.salesAnalysisMax}`);

  const params = [
    `$filter=${filterParts.join(" and ")}`,
    `$select=ProductItemId,Description,DecimalSellingPrice,DecimalCostPrice,DecimalQuantityAvailable,CategoryId,UnitDescription,SalesAnalysis`,
    `$top=${args.top || 10}`,
    `$orderby=ProductItemId`,
  ].join("&");

  const result = await client.get<ProductItem>("ProductItems", params);

  if (result.value.length === 0) {
    return `No products found matching "${term}".`;
  }

  const lines = result.value.map((p) => {
    return [
      `**${p.ProductItemId}** — ${p.Description || "(no description)"}`,
      `  Sell: £${p.DecimalSellingPrice?.toFixed(2) ?? "N/A"} | Cost: £${p.DecimalCostPrice?.toFixed(2) ?? "N/A"} | Stock: ${p.DecimalQuantityAvailable ?? "N/A"}`,
      `  Category: ${p.CategoryId || "N/A"} | Unit: ${p.UnitDescription || "N/A"} | Sales Nominal: ${p.SalesAnalysis ?? "N/A"}`,
    ].join("\n");
  });

  return `Found ${result.value.length} product(s):\n\n${lines.join("\n\n")}`;
}

export async function searchDivisions(args: z.infer<typeof searchDivisionsSchema>): Promise<string> {
  const client = getClient();
  const term = args.searchTerm;

  const filter = [
    `(contains(Name,'${term}') or contains(SalesLedgerId,'${term}'))`,
    "StatusFlag ne 'D'",
  ].join(" and ");

  const params = [
    `$filter=${filter}`,
    `$select=DivisionId,Name,SalesLedgerId,TerritoryCode,AccountManager,RecordLink`,
    `$expand=Address($select=AddressLine1,AddressLine2,AddressLine3,Postcode)`,
    `$top=${args.top || 10}`,
    `$orderby=Name`,
  ].join("&");

  const result = await client.get<Division>("Divisions", params);

  if (result.value.length === 0) {
    return `No divisions/companies found matching "${term}".`;
  }

  const lines = result.value.map((d) => {
    const addr = d.Address;
    const address = addr ? [addr.AddressLine1, addr.AddressLine2, addr.AddressLine3, addr.Postcode].filter(Boolean).join(", ") : "N/A";
    return [
      `**${d.Name}** (DivisionId: ${d.DivisionId})`,
      `  Account: ${d.SalesLedgerId || "N/A"} | Territory: ${d.TerritoryCode || "N/A"} | AM: ${d.AccountManager || "N/A"}`,
      `  Address: ${address}`,
    ].join("\n");
  });

  return `Found ${result.value.length} division(s):\n\n${lines.join("\n\n")}`;
}

export async function getQuoteStatuses(): Promise<string> {
  const client = getClient();

  const params = "$select=QuoteStatusCode,Description,DeadFlag&$orderby=QuoteStatusCode";
  const result = await client.get<QuoteStatus>("QuoteStatus", params);

  if (result.value.length === 0) {
    return "No quote statuses found.";
  }

  const lines = result.value.map((s) => {
    const dead = s.DeadFlag ? " ☠️ (dead/closed)" : "";
    return `- **${s.QuoteStatusCode}**: ${s.Description || "(unnamed)"}${dead}`;
  });

  return `Quote statuses:\n\n${lines.join("\n")}`;
}
