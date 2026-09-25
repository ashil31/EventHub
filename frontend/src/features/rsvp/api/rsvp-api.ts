import { apiClient } from '../../../lib/api/api-client';
import type { Attendee, RsvpResult, RsvpStatus } from '../../../types/attendee';
import type { PaginatedResponse } from '../../../types/pagination';

/** Matches backend/src/rsvp/dto/list-attendees.dto.ts. */
export interface AttendeesPagination {
  page?: number;
  limit?: number;
}

function buildAttendeesQuery(pagination: AttendeesPagination): string {
  const params = new URLSearchParams();
  if (pagination.page !== undefined) {
    params.set('page', String(pagination.page));
  }
  if (pagination.limit !== undefined) {
    params.set('limit', String(pagination.limit));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

/**
 * No `userId` parameter anywhere here (§ 16) — the authenticated user
 * comes from the JWT the API client already attaches; the backend
 * determines who is RSVPing, never the request body.
 */
export const rsvpApi = {
  getRsvpStatus: (eventId: string): Promise<RsvpStatus> =>
    apiClient.get<RsvpStatus>(`/events/${eventId}/rsvp`),

  rsvp: (eventId: string): Promise<RsvpResult> =>
    apiClient.post<RsvpResult>(`/events/${eventId}/rsvp`),

  cancelRsvp: (eventId: string): Promise<void> =>
    apiClient.delete<void>(`/events/${eventId}/rsvp`),

  getEventAttendees: (
    eventId: string,
    pagination: AttendeesPagination,
  ): Promise<PaginatedResponse<Attendee>> =>
    apiClient.get<PaginatedResponse<Attendee>>(
      `/events/${eventId}/attendees${buildAttendeesQuery(pagination)}`,
    ),
};
