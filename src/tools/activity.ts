/**
 * MCP tool handlers for Activity Feed and Spoke History.
 * Activity feeds are the audit trail of all CRM actions.
 * Spoke history tracks communication touchpoints with contacts/leads.
 */

import { z } from "zod";
import { getClient } from "../client.js";

// ─── Helpers ──────────────────────────────────────────────────

async function resolveUser(input: string): Promise<string> {
  const client = getClient();
  const result = await client.get<{ UserCode: string; UserName: string }>(
    "Users", "$select=UserCode,UserName&$filter=Obsolete eq 0"
  );
  const trimmed = input.trim().toUpperCase();
  const byCode = result.value.find(u => u.UserCode.toUpperCase() === trimmed);
  if (byCode) return byCode.UserCode;
  const byName = result.value.find(u => (u.UserName || "").toUpperCase().includes(trimmed));
  if (byName) return byName.UserCode;
  return input;
}

// ─── Schemas ──────────────────────────────────────────────────

export const searchActivityFeedSchema = z.object({
  divisionId: z.number().optional().describe("Filter by DivisionId"),
  contactId: z.number().optional().describe("Filter by ContactId"),
  leadId: z.number().optional().describe("Filter by LeadId"),
  user: z.string().optional().describe("Filter by user who performed the action — name or code"),
  dateFrom: z.string().optional().describe("Activities on or after (ISO date)"),
  dateTo: z.string().optional().describe("Activities on or before (ISO date)"),
  top: z.number().optional().default(30).describe("Max results (default 30)"),
});

export const searchSpokeHistorySchema = z.object({
  contactId: z.number().optional().describe("Filter by ContactId"),
  divisionId: z.number().optional().describe("Filter by DivisionId"),
  leadId: z.number().optional().describe("Filter by LeadId"),
  user: z.string().optional().describe("Filter by user — name or code"),
  dateFrom: z.string().optional().describe("On or after (ISO date)"),
  dateTo: z.string().optional().describe("On or before (ISO date)"),
  top: z.number().optional().default(20).describe("Max results (default 20)"),
});

export const searchRecallsSchema = z.object({
  entity: z.enum(["contact", "lead"]).describe("Which recall type to search"),
  user: z.string().optional().describe("Filter by recall user — name or code"),
  dateFrom: z.string().optional().describe("Recall date on or after (ISO date)"),
  dateTo: z.string().optional().describe("Recall date on or before (ISO date)"),
  overdueOnly: z.boolean().optional().default(false).describe("Only recalls that are overdue (past their date)"),
  top: z.number().optional().default(20).describe("Max results (default 20)"),
});

// ─── Handlers ─────────────────────────────────────────────────

export async function searchActivityFeed(args: z.infer<typeof searchActivityFeedSchema>): Promise<string> {
  const client = getClient();
  const filters: string[] = [];

  if (args.divisionId) filters.push(`DivisionId eq ${args.divisionId}`);
  if (args.contactId) filters.push(`ContactId eq ${args.contactId}`);
  if (args.leadId) filters.push(`LeadId eq ${args.leadId}`);
  if (args.dateFrom) filters.push(`Created ge ${args.dateFrom}`);
  if (args.dateTo) filters.push(`Created le ${args.dateTo}`);

  if (args.user) {
    const code = await resolveUser(args.user);
    filters.push(`ActionUserCode eq '${code}'`);
  }

  const expand = "ActionUser($select=UserName)";
  const params = [
    filters.length > 0 ? `$filter=${filters.join(" and ")}` : "",
    `$expand=${expand}`,
    `$select=Id,TypeId,Data,ActionUserCode,Created,DivisionId,ContactId,LeadId,ProblemId,EnquiryId`,
    `$orderby=Created desc`,
    `$top=${args.top || 30}`,
  ].filter(Boolean).join("&");

  const result = await client.get<Record<string, unknown>>("ActivityFeeds", params);
  if (result.value.length === 0) return "No activity feed entries found.";

  const lines = result.value.map((a) => {
    const user = (a.ActionUser as Record<string, unknown>)?.UserName || a.ActionUserCode || "N/A";
    const date = (a.Created as string)?.substring(0, 16).replace("T", " ") || "N/A";
    const data = a.Data ? (a.Data as string).substring(0, 120) : "";

    const refs: string[] = [];
    if (a.DivisionId) refs.push(`Div:${a.DivisionId}`);
    if (a.ContactId) refs.push(`Contact:${a.ContactId}`);
    if (a.LeadId) refs.push(`Lead:${a.LeadId}`);
    if (a.ProblemId) refs.push(`Problem:${a.ProblemId}`);
    if (a.EnquiryId) refs.push(`Enquiry:${a.EnquiryId}`);

    return [
      `**${date}** — ${a.TypeId || "action"} by ${user}`,
      refs.length > 0 ? `  Refs: ${refs.join(" | ")}` : "",
      data ? `  ${data}` : "",
    ].filter(Boolean).join("\n");
  });

  return `Activity feed (${result.value.length} entries):\n\n${lines.join("\n\n")}`;
}

export async function searchSpokeHistory(args: z.infer<typeof searchSpokeHistorySchema>): Promise<string> {
  const client = getClient();
  const filters: string[] = [];

  if (args.contactId) filters.push(`ContactId eq ${args.contactId}`);
  if (args.divisionId) filters.push(`DivisionId eq ${args.divisionId}`);
  if (args.leadId) filters.push(`LeadId eq ${args.leadId}`);
  if (args.dateFrom) filters.push(`Start ge ${args.dateFrom}`);
  if (args.dateTo) filters.push(`Start le ${args.dateTo}`);

  if (args.user) {
    const code = await resolveUser(args.user);
    filters.push(`User eq '${code}'`);
  }

  const params = [
    filters.length > 0 ? `$filter=${filters.join(" and ")}` : "",
    `$select=HistoryId,SpokeCode,Start,Finish,User,TransferredTo,ContactId,LeadId,ProblemId,DivisionId`,
    `$orderby=Start desc`,
    `$top=${args.top || 20}`,
  ].filter(Boolean).join("&");

  const result = await client.get<Record<string, unknown>>("SpokeHistories", params);
  if (result.value.length === 0) return "No spoke history found.";

  const lines = result.value.map((s) => {
    const start = (s.Start as string)?.substring(0, 16).replace("T", " ") || "N/A";
    const finish = (s.Finish as string)?.substring(0, 16).replace("T", " ") || "";
    const transferred = s.TransferredTo ? ` → ${s.TransferredTo}` : "";

    const refs: string[] = [];
    if (s.DivisionId) refs.push(`Div:${s.DivisionId}`);
    if (s.ContactId) refs.push(`Contact:${s.ContactId}`);
    if (s.LeadId) refs.push(`Lead:${s.LeadId}`);

    return `**${start}**${finish ? ` to ${finish}` : ""} — ${s.SpokeCode || "spoke"} by ${s.User}${transferred}${refs.length > 0 ? ` | ${refs.join(", ")}` : ""}`;
  });

  return `Spoke history (${result.value.length} entries):\n\n${lines.join("\n")}`;
}

export async function searchRecalls(args: z.infer<typeof searchRecallsSchema>): Promise<string> {
  const client = getClient();
  const entitySet = args.entity === "contact" ? "ContactRecalls" : "LeadRecalls";
  const idField = args.entity === "contact" ? "ContactId" : "LeadId";
  const filters: string[] = ["StatusFlag ne 'D'"];

  if (args.dateFrom) filters.push(`RecallDate ge ${args.dateFrom}`);
  if (args.dateTo) filters.push(`RecallDate le ${args.dateTo}`);
  if (args.overdueOnly) filters.push(`RecallDate lt ${new Date().toISOString().substring(0, 10)}`);

  if (args.user) {
    const code = await resolveUser(args.user);
    filters.push(`RecallUserId eq '${code}'`);
  }

  const expand = "RecallUser($select=UserName)";
  const params = [
    `$filter=${filters.join(" and ")}`,
    `$expand=${expand}`,
    `$select=${idField},RecallDate,RecallUserId`,
    `$orderby=RecallDate`,
    `$top=${args.top || 20}`,
  ].join("&");

  const result = await client.get<Record<string, unknown>>(entitySet, params);
  if (result.value.length === 0) return `No ${args.entity} recalls found.`;

  const lines = result.value.map((r) => {
    const user = (r.RecallUser as Record<string, unknown>)?.UserName || r.RecallUserId || "N/A";
    const date = (r.RecallDate as string)?.substring(0, 10) || "N/A";
    const isOverdue = new Date(r.RecallDate as string) < new Date();
    return `- **${date}**${isOverdue ? " [OVERDUE]" : ""} — ${args.entity} #${r[idField]} — for ${user}`;
  });

  return `## ${args.entity === "contact" ? "Contact" : "Lead"} Recalls (${result.value.length})\n${lines.join("\n")}`;
}
