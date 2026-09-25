import { queryOptions } from '@tanstack/react-query';
import { rsvpApi, type AttendeesPagination } from '../api/rsvp-api';
import { attendeeKeys } from './keys';

/**
 * `staleTime: 15s` — shorter than the app default (60s) per § 26:
 * "attendees, potentially shorter because RSVP changes can affect it."
 * Still not `0` — this list is being actively invalidated by the RSVP/
 * cancel mutations themselves (`queries/hooks.ts`) whenever it's this
 * session's own action that changed it; the shorter stale time only
 * matters for catching a *different* user's concurrent RSVP.
 */
export const attendeesQueries = {
  list: (eventId: string, pagination: AttendeesPagination) =>
    queryOptions({
      queryKey: attendeeKeys.list(eventId, pagination),
      queryFn: () => rsvpApi.getEventAttendees(eventId, pagination),
      enabled: Boolean(eventId),
      staleTime: 15 * 1000,
    }),
};
