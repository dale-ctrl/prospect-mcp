/**
 * MCP tool handlers for CalendarEvent operations.
 * Calendar events are linked to contacts/leads/divisions via CalendarEventLinks.
 */

import { z } from "zod";
import { getClient } from "../client.js";

// ─── Schemas ──────────────────────────────────────────────────

export const searchCalendarEventsSchema = z.object({
  subject: z.string().optional().describe("Search in event subject (partial match)"),
  ownerEmail: z.string().optional().describe("Filter by owner email address"),
  dateFrom: z.string().optional().describe("Events starting on or after (ISO date)"),
  dateTo: z.string().optional().describe("Events starting on or before (ISO date)"),
  top: z.number().optional().default(20).describe("Max results (default 20)"),
});

export const getCalendarEventSchema = z.object({
  eventId: z.string().describe("The EventId (string) to retrieve"),
});

// ─── Handlers ─────────────────────────────────────────────────

export async function searchCalendarEvents(args: z.infer<typeof searchCalendarEventsSchema>): Promise<string> {
  const client = getClient();
  const filters: string[] = [];

  if (args.subject) filters.push(`contains(Subject,'${args.subject}')`);
  if (args.ownerEmail) filters.push(`OwnerEmail eq '${args.ownerEmail}'`);
  if (args.dateFrom) filters.push(`StartDate ge ${args.dateFrom}`);
  if (args.dateTo) filters.push(`StartDate le ${args.dateTo}`);

  const params = [
    filters.length > 0 ? `$filter=${filters.join(" and ")}` : "",
    `$select=EventId,Subject,Description,StartDate,EndDate,StartDateTimeZone,EndDateTimeZone,FreeBusyStatusId,LocationNames,OwnerEmail,SystemName`,
    `$orderby=StartDate desc`,
    `$top=${args.top || 20}`,
  ].filter(Boolean).join("&");

  const result = await client.get<Record<string, unknown>>("CalendarEvents", params);
  if (result.value.length === 0) return "No calendar events found matching the criteria.";

  const lines = result.value.map((e) => {
    const start = (e.StartDate as string)?.substring(0, 16).replace("T", " ") || "N/A";
    const end = (e.EndDate as string)?.substring(0, 16).replace("T", " ") || "N/A";

    return [
      `**Event** — ${e.Subject || "(untitled)"}`,
      `  ID: ${e.EventId}`,
      `  ${start} → ${end}`,
      `  Owner: ${e.OwnerEmail || "N/A"} | Location: ${e.LocationNames || "N/A"}`,
      `  System: ${e.SystemName || "N/A"}`,
    ].join("\n");
  });

  return `Found ${result.value.length} calendar event(s):\n\n${lines.join("\n\n")}`;
}

export async function getCalendarEvent(args: z.infer<typeof getCalendarEventSchema>): Promise<string> {
  const client = getClient();

  const e = await client.getById<Record<string, unknown>>(
    "CalendarEvents", `'${args.eventId}'`,
    `$select=EventId,Subject,Description,StartDate,EndDate,StartDateTimeZone,EndDateTimeZone,FreeBusyStatusId,LocationNames,OwnerEmail,CategoryIds,AttendeesRequired,AttendeesOptional,SystemName`
  );

  return [
    `# Calendar Event`,
    `**Subject:** ${e.Subject || "N/A"}`,
    `**EventId:** ${e.EventId}`,
    `**Start:** ${(e.StartDate as string)?.substring(0, 16).replace("T", " ") || "N/A"} (${e.StartDateTimeZone || "N/A"})`,
    `**End:** ${(e.EndDate as string)?.substring(0, 16).replace("T", " ") || "N/A"} (${e.EndDateTimeZone || "N/A"})`,
    `**Owner:** ${e.OwnerEmail || "N/A"}`,
    `**Location:** ${e.LocationNames || "N/A"}`,
    `**Free/Busy:** ${e.FreeBusyStatusId || "N/A"}`,
    `**System:** ${e.SystemName || "N/A"}`,
    "",
    `## Attendees`,
    `**Required:** ${e.AttendeesRequired || "N/A"}`,
    `**Optional:** ${e.AttendeesOptional || "N/A"}`,
    "",
    `## Description`,
    (e.Description as string) || "(none)",
  ].join("\n");
}
