/**
 * MCP tool handlers for CalendarEvent operations.
 * Calendar events are linked to contacts/leads/divisions via CalendarEventLinks.
 */
import { z } from "zod";
export declare const searchCalendarEventsSchema: z.ZodObject<{
    subject: z.ZodOptional<z.ZodString>;
    ownerEmail: z.ZodOptional<z.ZodString>;
    dateFrom: z.ZodOptional<z.ZodString>;
    dateTo: z.ZodOptional<z.ZodString>;
    top: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    top: number;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    subject?: string | undefined;
    ownerEmail?: string | undefined;
}, {
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    top?: number | undefined;
    subject?: string | undefined;
    ownerEmail?: string | undefined;
}>;
export declare const getCalendarEventSchema: z.ZodObject<{
    eventId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    eventId: string;
}, {
    eventId: string;
}>;
export declare function searchCalendarEvents(args: z.infer<typeof searchCalendarEventsSchema>): Promise<string>;
export declare function getCalendarEvent(args: z.infer<typeof getCalendarEventSchema>): Promise<string>;
//# sourceMappingURL=calendar.d.ts.map