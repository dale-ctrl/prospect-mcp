/**
 * MCP tool handlers for Inventory (asset/equipment tracking) operations.
 * Inventories track physical items/assets at customer sites, linked to divisions, contracts, and problems.
 */

import { z } from "zod";
import { getClient } from "../client.js";

// ─── Schemas ──────────────────────────────────────────────────

export const searchInventoriesSchema = z.object({
  description: z.string().optional().describe("Search in description (partial match)"),
  serialNumber: z.string().optional().describe("Serial number (partial match)"),
  divisionId: z.number().optional().describe("Filter by DivisionId (company)"),
  divisionName: z.string().optional().describe("Company name (partial match)"),
  productItemId: z.string().optional().describe("Product code/SKU"),
  dateFrom: z.string().optional().describe("Created on or after (ISO date)"),
  dateTo: z.string().optional().describe("Created on or before (ISO date)"),
  top: z.number().optional().default(20).describe("Max results (default 20)"),
});

export const getInventorySchema = z.object({
  inventoryId: z.number().describe("The InventoryId to retrieve"),
});

// ─── Handlers ─────────────────────────────────────────────────

export async function searchInventories(args: z.infer<typeof searchInventoriesSchema>): Promise<string> {
  const client = getClient();
  const filters: string[] = ["StatusFlag ne 'D'"];

  if (args.description) filters.push(`contains(Description,'${args.description}')`);
  if (args.serialNumber) filters.push(`contains(SerialNumber,'${args.serialNumber}')`);
  if (args.divisionId) filters.push(`DivisionId eq ${args.divisionId}`);
  if (args.divisionName) filters.push(`contains(Division/Name,'${args.divisionName}')`);
  if (args.productItemId) filters.push(`ProductItemId eq '${args.productItemId}'`);
  if (args.dateFrom) filters.push(`Created ge ${args.dateFrom}`);
  if (args.dateTo) filters.push(`Created le ${args.dateTo}`);

  const expand = "Division($select=Name),Status($select=Description),Type($select=Description)";
  const params = [
    `$filter=${filters.join(" and ")}`,
    `$expand=${expand}`,
    `$select=InventoryId,Description,SerialNumber,ProductItemId,Location,Commissioned,Decommissioned,DivisionId,Instances,RecordLink,Created`,
    `$orderby=Created desc`,
    `$top=${args.top || 20}`,
  ].join("&");

  const result = await client.get<Record<string, unknown>>("Inventories", params);
  if (result.value.length === 0) return "No inventory items found matching the criteria.";

  const lines = result.value.map((inv) => {
    const company = (inv.Division as Record<string, unknown>)?.Name || "N/A";
    const status = (inv.Status as Record<string, unknown>)?.Description || "N/A";
    const type = (inv.Type as Record<string, unknown>)?.Description || "N/A";
    const commissioned = (inv.Commissioned as string)?.substring(0, 10) || "N/A";

    return [
      `**Inventory #${inv.InventoryId}** — ${inv.Description || "(untitled)"}`,
      `  Company: ${company} | Type: ${type} | Status: ${status}`,
      `  Serial: ${inv.SerialNumber || "N/A"} | Product: ${inv.ProductItemId || "N/A"} | Qty: ${inv.Instances ?? 1}`,
      `  Commissioned: ${commissioned} | Location: ${(inv.Location as string)?.substring(0, 60) || "N/A"}`,
    ].join("\n");
  });

  return `Found ${result.value.length} inventory item(s):\n\n${lines.join("\n\n")}`;
}

export async function getInventory(args: z.infer<typeof getInventorySchema>): Promise<string> {
  const client = getClient();
  const expand = [
    "Division($select=DivisionId,Name,SalesLedgerId)",
    "Status($select=Description)",
    "Type($select=Description)",
  ].join(",");

  const inv = await client.getById<Record<string, unknown>>("Inventories", args.inventoryId, `$expand=${expand}`);

  const company = (inv.Division as Record<string, unknown>)?.Name || "N/A";
  const status = (inv.Status as Record<string, unknown>)?.Description || "N/A";
  const type = (inv.Type as Record<string, unknown>)?.Description || "N/A";

  return [
    `# Inventory #${inv.InventoryId}`,
    `**Description:** ${inv.Description || "N/A"}`,
    `**Type:** ${type} | **Status:** ${status}`,
    `**Company:** ${company} (DivisionId: ${inv.DivisionId || "N/A"})`,
    `**Product:** ${inv.ProductItemId || "N/A"}`,
    `**Serial Number:** ${inv.SerialNumber || "N/A"}`,
    `**Version:** ${inv.VersionNumber || "N/A"}`,
    `**Instances:** ${inv.Instances ?? 1}`,
    `**Location:** ${inv.Location || "N/A"}`,
    "",
    `## Dates`,
    `- Commissioned: ${(inv.Commissioned as string)?.substring(0, 10) || "N/A"}`,
    `- Decommissioned: ${(inv.Decommissioned as string)?.substring(0, 10) || "N/A"}`,
    `- Manufacturer Warranty: ${(inv.ManufacturerWarranty as string)?.substring(0, 10) || "N/A"}`,
    `- Created: ${(inv.Created as string)?.substring(0, 10) || "N/A"}`,
    "",
    `## References`,
    `**Document Ref:** ${inv.DocumentRef || "N/A"}`,
    `**Invoice Number:** ${inv.InvoiceNumber || "N/A"}`,
    `**Contract Ref:** ${inv.ContractReference || "N/A"}`,
    `**Manufacturer Ref:** ${inv.ManufacturerReference || "N/A"}`,
    "",
    inv.ExtendedDescription ? `## Notes\n${inv.ExtendedDescription}` : "",
    `**CRM Link:** ${inv.RecordLink || "N/A"}`,
  ].filter(Boolean).join("\n");
}
