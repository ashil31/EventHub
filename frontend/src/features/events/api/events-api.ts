import { apiClient } from '../../../lib/api/api-client';
import type { Event } from '../../../types/event';
import type { PaginatedResponse } from '../../../types/pagination';

/**
 * Matches backend/src/events/dto/list-events.dto.ts exactly — only
 * fields the backend actually accepts. `page`/`limit` are optional here
 * (the backend defaults them to 1/20 itself); the query layer normalizes
 * them before building a cache key (see `queries/keys.ts`).
 */
export interface EventListFilters {
  page?: number;
  limit?: number;
  search?: string;
  from?: string;
  to?: string;
}

/**
 * Matches backend/src/events/dto/create-event.dto.ts. Deliberately not
 * reusing `Event` (the response type) — the request has none of
 * `id`/`attendeeCount`/`availableSpots`/`createdBy`/timestamps, and
 * `description` is optional on write but nullable (never `undefined`) on
 * read. A shared type here would either lie about which fields a create
 * request may send or force every read call site to handle fields it
 * never gets (§ 6 — the two responsibilities genuinely differ).
 */
export interface CreateEventInput {
  title: string;
  description?: string;
  location: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
}

/** Matches backend/src/events/dto/update-event.dto.ts — every field of
 * `CreateEventInput`, optional (a PATCH may send any subset). */
export type UpdateEventInput = Partial<CreateEventInput>;

function buildListQuery(filters: EventListFilters): string {
  const params = new URLSearchParams();
  if (filters.page !== undefined) params.set('page', String(filters.page));
  if (filters.limit !== undefined) params.set('limit', String(filters.limit));
  if (filters.search) params.set('search', filters.search);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export const eventsApi = {
  listEvents: (filters: EventListFilters): Promise<PaginatedResponse<Event>> =>
    apiClient.get<PaginatedResponse<Event>>(
      `/events${buildListQuery(filters)}`,
    ),

  getEvent: (eventId: string): Promise<Event> =>
    apiClient.get<Event>(`/events/${eventId}`),

  createEvent: (input: CreateEventInput): Promise<Event> =>
    apiClient.post<Event>('/events', input),

  updateEvent: (eventId: string, input: UpdateEventInput): Promise<Event> =>
    apiClient.patch<Event>(`/events/${eventId}`, input),

  deleteEvent: (eventId: string): Promise<void> =>
    apiClient.delete<void>(`/events/${eventId}`),
};
