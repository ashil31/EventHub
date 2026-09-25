import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAuthToken } from '../../../lib/api/auth-token';
import { eventKeys } from '../../events/queries/keys';
import { rsvpApi, type AttendeesPagination } from '../api/rsvp-api';
import { attendeeKeys, rsvpKeys } from './keys';
import { attendeesQueries, rsvpQueries } from './options';

export function useEventAttendees(
  eventId: string,
  pagination: AttendeesPagination = {},
) {
  return useQuery(attendeesQueries.list(eventId, pagination));
}

/**
 * `enabled: getAuthToken() !== null` — the exact same gate
 * `useCurrentUser` uses (Phase 3), for the exact same reason: with no
 * token there is nothing to check, and firing this anyway would be a
 * guaranteed 401 for every anonymous visitor viewing an event (§8/§9 of
 * the Phase 6 brief — never send an authenticated-only request just to
 * discover that auth is required).
 */
export function useRsvpStatus(eventId: string) {
  return useQuery({
    ...rsvpQueries.status(eventId),
    enabled: Boolean(eventId) && getAuthToken() !== null,
  });
}

/**
 * RSVP has server-side capacity constraints the client can't evaluate
 * (§ 24/§ 46) — the response is authoritative, but it's `RsvpResult`, not
 * a full `Event`, so it can't replace `eventKeys.detail(eventId)`
 * directly (§ H of Phase 0). Invalidation, not an optimistic update: a
 * "join" that might fail with 409 (full/duplicate/already-started) is
 * exactly the case where showing a success state before the server
 * confirms it would be actively misleading, and § 24 explicitly calls
 * this out as the case optimistic UI is NOT worth it for.
 *
 * Invalidates the event detail (attendeeCount/availableSpots changed),
 * every attendee-list page for this event, and (Phase 6, added alongside
 * `useRsvpStatus`) this user's own RSVP-status query — without this, the
 * status cache from before the join would keep reporting "not attending"
 * until an unrelated remount/refetch. Deliberately does NOT invalidate
 * `eventKeys.lists()` — every open list view will self-correct within its
 * normal 60s staleTime/next window-focus refetch, and invalidating every
 * filtered/paginated event list on every single RSVP across the whole app
 * would be exactly the over-invalidation § 23 warns against for a cost (a
 * few seconds of list staleness) nobody asked to avoid.
 */
export function useRsvp(eventId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => rsvpApi.rsvp(eventId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: eventKeys.detail(eventId),
      });
      void queryClient.invalidateQueries({
        queryKey: attendeeKeys.listsForEvent(eventId),
      });
      void queryClient.invalidateQueries({
        queryKey: rsvpKeys.status(eventId),
      });
    },
  });
}

/** Same invalidation scope as `useRsvp`, same reasoning. */
export function useCancelRsvp(eventId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => rsvpApi.cancelRsvp(eventId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: eventKeys.detail(eventId),
      });
      void queryClient.invalidateQueries({
        queryKey: attendeeKeys.listsForEvent(eventId),
      });
      void queryClient.invalidateQueries({
        queryKey: rsvpKeys.status(eventId),
      });
    },
  });
}
