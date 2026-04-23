/**
 * MCP tool handlers for Booking (resource scheduling) operations.
 * Bookings are time-based reservations assigned to users, linked to contacts/divisions via BookingLinks.
 */

import { z } from "zod";
import { getClient } from "../client.js";

// ─── Schemas ──────────────────────────────────────────────────

export const searchBookingsSchema = z.object({
  description: z.string().optional().describe("Search in booking description (partial match)"),
  bookingFor: z.string().optional().describe("User the booking is for — name or code"),
  dateFrom: z.string().optional().describe("Bookings starting on or after (ISO date)"),
  dateTo: z.string().optional().describe("Bookings starting on or before (ISO date)"),
  top: z.number().optional().default(20).describe("Max results (default 20)"),
});

export const getBookingSchema = z.object({
  bookingId: z.number().describe("The BookingId to retrieve"),
});

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

export const createBookingSchema = z.object({
  description: z.string().describe("Booking description/subject"),
  bookingFor: z.string().describe("User the booking is for — user code or name"),
  typeCode: z.string().describe("Booking type code — use get_booking_lookups to list available types"),
  statusCode: z.string().describe("Booking status code — use get_booking_lookups to list available statuses"),
  extendedDescription: z.string().optional().describe("Extended notes/description"),
  startDateTime: z.string().optional().describe("Start date/time in ISO format"),
  endDateTime: z.string().optional().describe("End date/time in ISO format"),
});

export const updateBookingSchema = z.object({
  bookingId: z.number().describe("The BookingId to update"),
  description: z.string().optional().describe("Booking description"),
  bookingFor: z.string().optional().describe("User the booking is for — code or name"),
  typeCode: z.string().optional().describe("Booking type code"),
  statusCode: z.string().optional().describe("Booking status code"),
  extendedDescription: z.string().optional().describe("Extended notes"),
  startDateTime: z.string().optional().describe("Start date/time in ISO format"),
  endDateTime: z.string().optional().describe("End date/time in ISO format"),
});

export const getBookingLookupsSchema = z.object({});

export async function createBooking(args: z.infer<typeof createBookingSchema>): Promise<string> {
  const client = getClient();

  const userCode = await resolveUser(args.bookingFor);

  const body: Record<string, unknown> = {
    Description: args.description,
    BookingFor: userCode,
    TypeCode: args.typeCode,
    StatusCode: args.statusCode,
  };

  if (args.extendedDescription !== undefined) body.ExtendedDescription = args.extendedDescription;
  if (args.startDateTime !== undefined) body.StartDateTime = args.startDateTime;
  if (args.endDateTime !== undefined) body.EndDateTime = args.endDateTime;

  const created = await client.post<Record<string, unknown>>("Bookings", body);

  return [
    `Booking created successfully!`,
    `**BookingId:** ${created.BookingId}`,
    `**Description:** ${created.Description || args.description}`,
    `**For:** ${userCode}`,
    `**Type:** ${args.typeCode}`,
    `**Status:** ${args.statusCode}`,
  ].join("\n");
}

export async function updateBooking(args: z.infer<typeof updateBookingSchema>): Promise<string> {
  const client = getClient();
  const { bookingId, ...fields } = args;

  const body: Record<string, unknown> = {};
  if (fields.description !== undefined) body.Description = fields.description;
  if (fields.typeCode !== undefined) body.TypeCode = fields.typeCode;
  if (fields.statusCode !== undefined) body.StatusCode = fields.statusCode;
  if (fields.extendedDescription !== undefined) body.ExtendedDescription = fields.extendedDescription;
  if (fields.startDateTime !== undefined) body.StartDateTime = fields.startDateTime;
  if (fields.endDateTime !== undefined) body.EndDateTime = fields.endDateTime;

  if (fields.bookingFor !== undefined) {
    body.BookingFor = await resolveUser(fields.bookingFor);
  }

  if (Object.keys(body).length === 0) {
    return "No fields provided to update. Specify at least one field to change.";
  }

  await client.patch<Record<string, unknown>>("Bookings", bookingId, body);

  return `Booking #${bookingId} updated successfully. Fields changed: ${Object.keys(body).join(", ")}`;
}

export async function getBookingLookups(): Promise<string> {
  const client = getClient();

  const [types, statuses] = await Promise.all([
    client.get<{ TypeCode: string; Description: string }>(
      "BookingTypes", "$select=TypeCode,Description&$orderby=Description"
    ),
    client.get<{ StatusCode: string; Description: string }>(
      "BookingStatus", "$select=StatusCode,Description&$orderby=Description"
    ),
  ]);

  const typeLines = types.value.map(t => `- \`${t.TypeCode}\` — ${t.Description}`);
  const statusLines = statuses.value.map(s => `- \`${s.StatusCode}\` — ${s.Description}`);

  return [
    `## Booking Types (${types.value.length})`,
    typeLines.join("\n"),
    "",
    `## Booking Statuses (${statuses.value.length})`,
    statusLines.join("\n"),
  ].join("\n");
}

// ─── Handlers ─────────────────────────────────────────────────

export async function searchBookings(args: z.infer<typeof searchBookingsSchema>): Promise<string> {
  const client = getClient();
  const filters: string[] = ["StatusFlag ne 'D'"];

  if (args.description) filters.push(`contains(Description,'${args.description}')`);
  if (args.dateFrom) filters.push(`StartDateTime ge ${args.dateFrom}`);
  if (args.dateTo) filters.push(`StartDateTime le ${args.dateTo}`);

  if (args.bookingFor) {
    const code = await resolveUser(args.bookingFor);
    filters.push(`BookingFor eq '${code}'`);
  }

  const expand = "BookingForUser($select=UserName),Type($select=Description),Status($select=Description)";
  const params = [
    `$filter=${filters.join(" and ")}`,
    `$expand=${expand}`,
    `$select=BookingId,Description,StartDateTime,EndDateTime,BookingFor,Created`,
    `$orderby=StartDateTime desc`,
    `$top=${args.top || 20}`,
  ].join("&");

  const result = await client.get<Record<string, unknown>>("Bookings", params);
  if (result.value.length === 0) return "No bookings found matching the criteria.";

  const lines = result.value.map((b) => {
    const user = (b.BookingForUser as Record<string, unknown>)?.UserName || b.BookingFor || "N/A";
    const type = (b.Type as Record<string, unknown>)?.Description || "N/A";
    const status = (b.Status as Record<string, unknown>)?.Description || "N/A";
    const start = (b.StartDateTime as string)?.substring(0, 16).replace("T", " ") || "N/A";
    const end = (b.EndDateTime as string)?.substring(0, 16).replace("T", " ") || "N/A";

    return [
      `**Booking #${b.BookingId}** — ${b.Description || "(untitled)"}`,
      `  For: ${user} | Type: ${type} | Status: ${status}`,
      `  ${start} → ${end}`,
    ].join("\n");
  });

  return `Found ${result.value.length} booking(s):\n\n${lines.join("\n\n")}`;
}

export async function getBooking(args: z.infer<typeof getBookingSchema>): Promise<string> {
  const client = getClient();
  const expand = [
    "BookingForUser($select=UserName)",
    "Type($select=Description)",
    "Status($select=Description)",
    "BookingLinks($select=LinkId,ObjectType,ObjectId,Comments)",
  ].join(",");

  const b = await client.getById<Record<string, unknown>>("Bookings", args.bookingId, `$expand=${expand}`);

  const user = (b.BookingForUser as Record<string, unknown>)?.UserName || b.BookingFor || "N/A";
  const type = (b.Type as Record<string, unknown>)?.Description || "N/A";
  const status = (b.Status as Record<string, unknown>)?.Description || "N/A";
  const links = (b.BookingLinks as Array<Record<string, unknown>>) || [];

  let output = [
    `# Booking #${b.BookingId}`,
    `**Description:** ${b.Description || "N/A"}`,
    `**For:** ${user}`,
    `**Type:** ${type} | **Status:** ${status}`,
    `**Start:** ${(b.StartDateTime as string)?.substring(0, 16).replace("T", " ") || "N/A"}`,
    `**End:** ${(b.EndDateTime as string)?.substring(0, 16).replace("T", " ") || "N/A"}`,
    `**Created:** ${(b.Created as string)?.substring(0, 10) || "N/A"}`,
    "",
    b.ExtendedDescription ? `## Notes\n${b.ExtendedDescription}\n` : "",
    `## Linked Records (${links.length})`,
  ].filter(Boolean).join("\n");

  if (links.length > 0) {
    const linkLines = links.map(l =>
      `- ${l.ObjectType} #${l.ObjectId}${l.Comments ? ` — ${l.Comments}` : ""}`
    );
    output += "\n" + linkLines.join("\n");
  } else {
    output += "\n(none)";
  }

  return output;
}
