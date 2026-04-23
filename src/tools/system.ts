/**
 * MCP tool handlers for System configuration — entity layouts, custom fields, and system options.
 */

import { z } from "zod";
import { getClient } from "../client.js";

// ─── Schemas ──────────────────────────────────────────────────

export const searchSystemOptionsSchema = z.object({
  option: z.string().optional().describe("Search in option name (partial match)"),
  group: z.string().optional().describe("Filter by option group"),
  top: z.number().optional().default(50).describe("Max results (default 50)"),
});

export const getEntityFieldsSchema = z.object({
  entityId: z.string().describe("Entity identifier (e.g. 'Contact', 'Division', 'Lead', 'Quote'). Lists all custom and system fields defined for this entity."),
  customOnly: z.boolean().optional().default(false).describe("Only show custom (non-core) fields"),
});

export const getEntityLayoutSchema = z.object({
  entityId: z.string().describe("Entity identifier (e.g. 'Contact', 'Division', 'Lead')"),
});

// ─── Handlers ─────────────────────────────────────────────────

export async function searchSystemOptions(args: z.infer<typeof searchSystemOptionsSchema>): Promise<string> {
  const client = getClient();
  const filters: string[] = ["Visible eq 1"];

  if (args.option) filters.push(`contains(Option,'${args.option}')`);
  if (args.group) filters.push(`Group eq '${args.group}'`);

  const params = [
    `$filter=${filters.join(" and ")}`,
    `$select=Option,Value,Description,Group`,
    `$orderby=Group,Option`,
    `$top=${args.top || 50}`,
  ].join("&");

  const result = await client.get<Record<string, unknown>>("SystemOptions", params);
  if (result.value.length === 0) return "No system options found.";

  const lines = result.value.map((o) => {
    const val = (o.Value as string)?.substring(0, 80) || "N/A";
    return `- **${o.Option}** = \`${val}\`${(o.Value as string)?.length > 80 ? "..." : ""}\n  ${o.Description || "N/A"}${o.Group ? ` [${o.Group}]` : ""}`;
  });

  return `## System Options (${result.value.length})\n\n${lines.join("\n\n")}`;
}

export async function getEntityFields(args: z.infer<typeof getEntityFieldsSchema>): Promise<string> {
  const client = getClient();
  const filters = [`EntityId eq '${args.entityId}'`, "Obsolete eq false"];
  if (args.customOnly) filters.push("Core eq false");

  const params = [
    `$filter=${filters.join(" and ")}`,
    `$select=EntityId,ColumnName,FieldName,Core,ApiVisible,Identifier`,
    `$orderby=FieldName`,
    `$top=200`,
  ].join("&");

  const result = await client.get<Record<string, unknown>>("EntityFields", params);
  if (result.value.length === 0) return `No fields found for entity "${args.entityId}".`;

  const custom = result.value.filter(f => !f.Core);
  const core = result.value.filter(f => f.Core);

  let output = `# Fields for ${args.entityId} (${result.value.length} total)\n`;

  if (custom.length > 0) {
    const customLines = custom.map(
      (f) => `- **${f.FieldName}** (column: ${f.ColumnName})${f.ApiVisible ? "" : " [hidden from API]"}${f.Identifier ? " [identifier]" : ""}`
    );
    output += `\n## Custom Fields (${custom.length})\n${customLines.join("\n")}`;
  }

  if (!args.customOnly && core.length > 0) {
    const coreLines = core.map(
      (f) => `- **${f.FieldName}** (column: ${f.ColumnName})${f.ApiVisible ? "" : " [hidden]"}`
    );
    output += `\n\n## Core Fields (${core.length})\n${coreLines.join("\n")}`;
  }

  return output;
}

export async function getEntityLayout(args: z.infer<typeof getEntityLayoutSchema>): Promise<string> {
  const client = getClient();

  const params = [
    `$filter=EntityId eq '${args.entityId}'`,
    `$select=EntityId,Version,Dictionary`,
    `$top=5`,
  ].join("&");

  const result = await client.get<Record<string, unknown>>("EntityLayouts", params);
  if (result.value.length === 0) return `No layout found for entity "${args.entityId}".`;

  const lines = result.value.map((l) =>
    `- **${l.EntityId}** v${l.Version} — Dictionary: ${l.Dictionary || "N/A"}`
  );

  return `## Entity Layouts for ${args.entityId}\n${lines.join("\n")}`;
}
