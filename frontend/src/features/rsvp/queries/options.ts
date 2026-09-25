import { queryOptions } from '@tanstack/react-query';
import { rsvpApi, type AttendeesPagination } from '../api/rsvp-api';
import { attendeeKeys, rsvpKeys } from './keys';

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

/**
 * `enabled: Boolean(eventId)` only, NOT an auth check — same split as
 * `eventsQueries.detail` (Phase 2 §27): this options object stays
 * auth-agnostic and reusable; the "only query when actually signed in"
 * gate belongs in the hook that calls it (`useRsvpStatus`), exactly
 * where `useCurrentUser` puts its own `enabled: hasToken` check, not
 * duplicated here.
 */
export const rsvpQueries = {
  status: (eventId: string) =>
    queryOptions({
      queryKey: rsvpKeys.status(eventId),
      queryFn: () => rsvpApi.getRsvpStatus(eventId),
      enabled: Boolean(eventId),
    }),
};
