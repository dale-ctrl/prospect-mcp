/**
 * MCP tool handlers for financial data — Sales Invoices, Sales Transactions,
 * and account-level financial reports.
 */

import { z } from "zod";
import { getClient } from "../client.js";

// ─── Schemas ──────────────────────────────────────────────────

export const searchSalesInvoicesSchema = z.object({
  invoiceNumber: z.string().optional().describe("Invoice number (partial match)"),
  divisionId: z.number().optional().describe("Filter by DivisionId"),
  salesLedgerId: z.string().optional().describe("Account code / sales ledger ID"),
  dateFrom: z.string().optional().describe("Invoice date on or after (ISO date)"),
  dateTo: z.string().optional().describe("Invoice date on or before (ISO date)"),
  minValue: z.number().optional().describe("Minimum net value"),
  top: z.number().optional().default(20).describe("Max results (default 20)"),
});

export const getSalesInvoiceSchema = z.object({
  operatingCompanyCode: z.string().optional().default("A").describe("Operating company code (default 'A')"),
  invoiceNumber: z.string().describe("The invoice number to retrieve"),
});

export const searchSalesTransactionsSchema = z.object({
  invoiceNumber: z.string().optional().describe("Invoice number (partial match)"),
  orderNumber: z.string().optional().describe("Order number (partial match)"),
  productItemId: z.string().optional().describe("Product item ID (partial match)"),
  productDescription: z.string().optional().describe("Product description (partial match)"),
  divisionId: z.number().optional().describe("Filter by DivisionId"),
  salesLedgerId: z.string().optional().describe("Account code / sales ledger ID"),
  dateFrom: z.string().optional().describe("Invoice date on or after (ISO date)"),
  dateTo: z.string().optional().describe("Invoice date on or before (ISO date)"),
  top: z.number().optional().default(50).describe("Max results (default 50)"),
});

export const reportAccountFinancialsSchema = z.object({
  divisionId: z.number().describe("DivisionId to report on"),
  dateFrom: z.string().optional().describe("Transactions on or after (ISO date)"),
  dateTo: z.string().optional().describe("Transactions on or before (ISO date)"),
  top: z.number().optional().default(50).describe("Max invoice/transaction rows (default 50)"),
});

// ─── Handlers ─────────────────────────────────────────────────

export async function searchSalesInvoices(args: z.infer<typeof searchSalesInvoicesSchema>): Promise<string> {
  const client = getClient();
  // OperatingCompanyCode is part of the composite key — required to scope the collection.
  const filters: string[] = [`OperatingCompanyCode eq 'A'`];

  if (args.invoiceNumber) filters.push(`contains(InvoiceNumber,'${args.invoiceNumber}')`);
  if (args.salesLedgerId) filters.push(`SalesLedgerId eq '${args.salesLedgerId}'`);
  if (args.divisionId) {
    // SalesInvoiceHeader has no DivisionId field — resolve to SalesLedgerId via Division lookup.
    const div = await client.getById<Record<string, unknown>>(
      "Divisions", args.divisionId, "$select=SalesLedgerId"
    );
    const ledgerId = div.SalesLedgerId as string | null;
    if (ledgerId) filters.push(`SalesLedgerId eq '${ledgerId}'`);
  }
  if (args.dateFrom) filters.push(`InvoiceDate ge ${args.dateFrom}`);
  if (args.dateTo) filters.push(`InvoiceDate le ${args.dateTo}`);
  if (args.minValue) filters.push(`BaseNetValue ge ${args.minValue}`);

  const params = [
    filters.length > 0 ? `$filter=${filters.join(" and ")}` : "",
    `$select=InvoiceNumber,CreditNoteNumber,SalesOrderHeaderId,AccountsId,SalesLedgerId,InvoiceDate,DueDate,BaseNetValue,BaseTaxValue,BaseGrossValue`,
    `$orderby=InvoiceDate desc`,
    `$top=${args.top || 20}`,
  ].filter(Boolean).join("&");

  const result = await client.get<Record<string, unknown>>("SalesInvoiceHeaders", params);
  if (result.value.length === 0) return "No sales invoices found matching the criteria.";

  const lines = result.value.map((inv) => {
    const date = (inv.InvoiceDate as string)?.substring(0, 10) || "N/A";
    const due = (inv.DueDate as string)?.substring(0, 10) || "N/A";

    return [
      `**Invoice ${inv.InvoiceNumber}**${inv.CreditNoteNumber ? ` (Credit: ${inv.CreditNoteNumber})` : ""}`,
      `  Account: ${inv.SalesLedgerId || "N/A"}`,
      `  Date: ${date} | Due: ${due}`,
      `  Net: £${(inv.BaseNetValue as number)?.toFixed(2) ?? "0.00"} | Tax: £${(inv.BaseTaxValue as number)?.toFixed(2) ?? "0.00"} | Gross: £${(inv.BaseGrossValue as number)?.toFixed(2) ?? "0.00"}`,
      `  Customer Ref: ${inv.CustomerReference || "N/A"}`,
    ].join("\n");
  });

  return `Found ${result.value.length} invoice(s):\n\n${lines.join("\n\n")}`;
}

export async function getSalesInvoice(args: z.infer<typeof getSalesInvoiceSchema>): Promise<string> {
  const client = getClient();
  const opCode = args.operatingCompanyCode || "A";

  // Composite key: OperatingCompanyCode + InvoiceNumber
  const inv = await client.getById<Record<string, unknown>>(
    "SalesInvoiceHeaders",
    `OperatingCompanyCode='${opCode}',InvoiceNumber='${args.invoiceNumber}'`
  );

  return [
    `# Sales Invoice ${inv.InvoiceNumber}`,
    inv.CreditNoteNumber ? `**Credit Note:** ${inv.CreditNoteNumber}` : "",
    `**DivisionId:** ${inv.DivisionId || "N/A"}`,
    `**Account Code:** ${inv.SalesLedgerId || "N/A"}`,
    `**Customer Ref:** ${inv.CustomerReference || "N/A"}`,
    "",
    `## Dates`,
    `- Invoice Date: ${(inv.InvoiceDate as string)?.substring(0, 10) || "N/A"}`,
    `- Due Date: ${(inv.DueDate as string)?.substring(0, 10) || "N/A"}`,
    "",
    `## Values`,
    `- Net: £${(inv.NetValue as number)?.toFixed(2) ?? "0.00"}`,
    `- Tax: £${(inv.TaxValue as number)?.toFixed(2) ?? "0.00"}`,
    `- Gross: £${(inv.GrossValue as number)?.toFixed(2) ?? "0.00"}`,
    "",
    `## Base Currency Values`,
    `- Base Net: £${(inv.BaseNetValue as number)?.toFixed(2) ?? "0.00"}`,
    `- Base Tax: £${(inv.BaseTaxValue as number)?.toFixed(2) ?? "0.00"}`,
    `- Base Gross: £${(inv.BaseGrossValue as number)?.toFixed(2) ?? "0.00"}`,
    "",
    `**Order ID:** ${inv.SalesOrderHeaderId || "N/A"}`,
    `**Accounts ID:** ${inv.AccountsId || "N/A"}`,
  ].filter(Boolean).join("\n");
}

export async function searchSalesTransactions(args: z.infer<typeof searchSalesTransactionsSchema>): Promise<string> {
  const client = getClient();
  const filters: string[] = [];

  if (args.invoiceNumber) filters.push(`contains(InvoiceNumber,'${args.invoiceNumber}')`);
  if (args.orderNumber) filters.push(`contains(OrderNumber,'${args.orderNumber}')`);
  if (args.productItemId) filters.push(`contains(ProductItemId,'${args.productItemId}')`);
  if (args.productDescription) filters.push(`contains(ProductDescription,'${args.productDescription}')`);
  if (args.divisionId) {
    // SalesTransaction has no DivisionId field — resolve to account code via Division lookup.
    const div = await client.getById<Record<string, unknown>>(
      "Divisions", args.divisionId, "$select=SalesLedgerId"
    );
    const ledgerId = div.SalesLedgerId as string | null;
    if (ledgerId) filters.push(`Account eq '${ledgerId}'`);
  }
  if (args.salesLedgerId) filters.push(`Account eq '${args.salesLedgerId}'`);
  if (args.dateFrom) filters.push(`InvoiceDate ge ${args.dateFrom}`);
  if (args.dateTo) filters.push(`InvoiceDate le ${args.dateTo}`);

  const params = [
    filters.length > 0 ? `$filter=${filters.join(" and ")}` : "",
    `$select=Id,DocumentId,LineNumber,InvoiceNumber,OrderNumber,ProductItemId,ProductDescription,InvoiceDate,Account,TransactionType,CalculatedPrice,CalculatedInvoiceQuantity,CalculatedLineValue`,
    `$orderby=InvoiceDate desc`,
    `$top=${args.top || 50}`,
  ].filter(Boolean).join("&");

  const result = await client.get<Record<string, unknown>>("SalesTransactions", params);
  if (result.value.length === 0) return "No sales transactions found matching the criteria.";

  const lines = result.value.map((t) => {
    const date = (t.InvoiceDate as string)?.substring(0, 10) || "N/A";

    return [
      `**${t.ProductItemId || "—"}** — ${t.ProductDescription || "(no description)"}`,
      `  Invoice: ${t.InvoiceNumber || "N/A"} | Order: ${t.OrderNumber || "N/A"} | Line: ${t.LineNumber}`,
      `  Account: ${t.Account || "N/A"}`,
      `  Type: ${t.TransactionType || "N/A"} | Qty: ${t.CalculatedInvoiceQuantity ?? 0} x £${(t.CalculatedPrice as number)?.toFixed(2) ?? "0.00"} = £${(t.CalculatedLineValue as number)?.toFixed(2) ?? "0.00"}`,
      `  Date: ${date}`,
    ].join("\n");
  });

  return `Found ${result.value.length} transaction(s):\n\n${lines.join("\n\n")}`;
}

export async function reportAccountFinancials(args: z.infer<typeof reportAccountFinancialsSchema>): Promise<string> {
  const client = getClient();

  // Get division details first
  const div = await client.getById<Record<string, unknown>>(
    "Divisions", args.divisionId, "$select=DivisionId,Name,SalesLedgerId"
  );

  const salesLedgerId = div.SalesLedgerId as string | null;

  // Build date filters
  const dateFilters: string[] = [];
  if (args.dateFrom) dateFilters.push(`InvoiceDate ge ${args.dateFrom}`);
  if (args.dateTo) dateFilters.push(`InvoiceDate le ${args.dateTo}`);

  // Fetch invoices — SalesInvoiceHeader has no DivisionId; filter by SalesLedgerId + OperatingCompanyCode
  const invFilters: string[] = [`OperatingCompanyCode eq 'A'`];
  if (salesLedgerId) invFilters.push(`SalesLedgerId eq '${salesLedgerId}'`);
  invFilters.push(...dateFilters);
  const invParams = [
    `$filter=${invFilters.join(" and ")}`,
    `$select=InvoiceNumber,CreditNoteNumber,InvoiceDate,NetValue,GrossValue,CustomerReference`,
    `$orderby=InvoiceDate desc`,
    `$top=${args.top || 50}`,
  ].join("&");

  const invoices = await client.get<Record<string, unknown>>("SalesInvoiceHeaders", invParams);

  // Fetch transactions — SalesTransaction has no DivisionId; filter by Account (= SalesLedgerId)
  const txFilters: string[] = [];
  if (salesLedgerId) txFilters.push(`Account eq '${salesLedgerId}'`);
  txFilters.push(...dateFilters);
  const txParams = [
    txFilters.length > 0 ? `$filter=${txFilters.join(" and ")}` : "",
    `$select=InvoiceNumber,OrderNumber,ProductItemId,ProductDescription,TransactionType,CalculatedInvoiceQuantity,CalculatedPrice,CalculatedLineValue,InvoiceDate`,
    `$orderby=InvoiceDate desc`,
    `$top=${args.top || 50}`,
  ].filter(Boolean).join("&");

  const transactions = await client.get<Record<string, unknown>>("SalesTransactions", txParams);

  // Calculate totals
  let totalNet = 0;
  let totalGross = 0;
  for (const inv of invoices.value) {
    totalNet += (inv.NetValue as number) || 0;
    totalGross += (inv.GrossValue as number) || 0;
  }

  let output = [
    `# Financial Summary — ${div.Name}`,
    `**DivisionId:** ${args.divisionId}`,
    `**Account Code:** ${salesLedgerId || "N/A"}`,
    args.dateFrom || args.dateTo ? `**Period:** ${args.dateFrom || "..."} to ${args.dateTo || "..."}` : "",
    "",
    `## Invoice Summary`,
    `**Total Invoices:** ${invoices.value.length}`,
    `**Total Net:** £${totalNet.toFixed(2)}`,
    `**Total Gross:** £${totalGross.toFixed(2)}`,
  ].filter(Boolean).join("\n");

  if (invoices.value.length > 0) {
    output += "\n\n### Recent Invoices\n";
    const invLines = invoices.value.slice(0, 20).map((inv) => {
      const date = (inv.InvoiceDate as string)?.substring(0, 10) || "N/A";
      return `- ${inv.InvoiceNumber}${inv.CreditNoteNumber ? ` (CN: ${inv.CreditNoteNumber})` : ""} | ${date} | Net: £${(inv.NetValue as number)?.toFixed(2) ?? "0.00"} | Ref: ${inv.CustomerReference || "N/A"}`;
    });
    output += invLines.join("\n");
  }

  if (transactions.value.length > 0) {
    output += `\n\n## Recent Transactions (${transactions.value.length})\n`;
    const txLines = transactions.value.slice(0, 30).map((t) => {
      const date = (t.InvoiceDate as string)?.substring(0, 10) || "N/A";
      return `- ${t.ProductItemId || "—"}: ${t.ProductDescription || "N/A"} | ${t.TransactionType || "N/A"} | Qty: ${t.CalculatedInvoiceQuantity ?? 0} x £${(t.CalculatedPrice as number)?.toFixed(2) ?? "0.00"} = £${(t.CalculatedLineValue as number)?.toFixed(2) ?? "0.00"} | Inv: ${t.InvoiceNumber || "N/A"} | ${date}`;
    });
    output += txLines.join("\n");
  }

  return output;
}
