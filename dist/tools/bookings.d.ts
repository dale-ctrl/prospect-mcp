/**
 * MCP tool handlers for Booking (resource scheduling) operations.
 * Bookings are time-based reservations assigned to users, linked to contacts/divisions via BookingLinks.
 */
import { z } from "zod";
export declare const searchBookingsSchema: z.ZodObject<{
    description: z.ZodOptional<z.ZodString>;
    bookingFor: z.ZodOptional<z.ZodString>;
    dateFrom: z.ZodOptional<z.ZodString>;
    dateTo: z.ZodOptional<z.ZodString>;
    top: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    top: number;
    description?: string | undefined;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    bookingFor?: string | undefined;
}, {
    description?: string | undefined;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    top?: number | undefined;
    bookingFor?: string | undefined;
}>;
export declare const getBookingSchema: z.ZodObject<{
    bookingId: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    bookingId: number;
}, {
    bookingId: number;
}>;
export declare const createBookingSchema: z.ZodObject<{
    description: z.ZodString;
    bookingFor: z.ZodString;
    typeCode: z.ZodString;
    statusCode: z.ZodString;
    extendedDescription: z.ZodOptional<z.ZodString>;
    startDateTime: z.ZodOptional<z.ZodString>;
    endDateTime: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    description: string;
    statusCode: string;
    bookingFor: string;
    typeCode: string;
    extendedDescription?: string | undefined;
    startDateTime?: string | undefined;
    endDateTime?: string | undefined;
}, {
    description: string;
    statusCode: string;
    bookingFor: string;
    typeCode: string;
    extendedDescription?: string | undefined;
    startDateTime?: string | undefined;
    endDateTime?: string | undefined;
}>;
export declare const updateBookingSchema: z.ZodObject<{
    bookingId: z.ZodNumber;
    description: z.ZodOptional<z.ZodString>;
    bookingFor: z.ZodOptional<z.ZodString>;
    typeCode: z.ZodOptional<z.ZodString>;
    statusCode: z.ZodOptional<z.ZodString>;
    extendedDescription: z.ZodOptional<z.ZodString>;
    startDateTime: z.ZodOptional<z.ZodString>;
    endDateTime: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    bookingId: number;
    description?: string | undefined;
    extendedDescription?: string | undefined;
    statusCode?: string | undefined;
    bookingFor?: string | undefined;
    typeCode?: string | undefined;
    startDateTime?: string | undefined;
    endDateTime?: string | undefined;
}, {
    bookingId: number;
    description?: string | undefined;
    extendedDescription?: string | undefined;
    statusCode?: string | undefined;
    bookingFor?: string | undefined;
    typeCode?: string | undefined;
    startDateTime?: string | undefined;
    endDateTime?: string | undefined;
}>;
export declare const getBookingLookupsSchema: z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>;
export declare function createBooking(args: z.infer<typeof createBookingSchema>): Promise<string>;
export declare function updateBooking(args: z.infer<typeof updateBookingSchema>): Promise<string>;
export declare function getBookingLookups(): Promise<string>;
export declare function searchBookings(args: z.infer<typeof searchBookingsSchema>): Promise<string>;
export declare function getBooking(args: z.infer<typeof getBookingSchema>): Promise<string>;
//# sourceMappingURL=bookings.d.ts.map