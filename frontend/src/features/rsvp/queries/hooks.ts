import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { eventKeys } from '../../events/queries/keys';
import { rsvpApi, type AttendeesPagination } from '../api/rsvp-api';
import { attendeeKeys } from './keys';
import { attendeesQueries } from './options';

export function useEventAttendees(
  eventId: string,
  pagination: AttendeesPagination = {},
) {
  return useQuery(attendeesQueries.list(eventId, pagination));
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
 * Invalidates the event detail (attendeeCount/availableSpots changed) and
 * every attendee-list page for this event. Deliberately does NOT
 * invalidate `eventKeys.lists()` — every open list view will self-correct
 * within its normal 60s staleTime/next window-focus refetch, and
 * invalidating every filtered/paginated event list on every single RSVP
 * across the whole app would be exactly the over-invalidation § 23 warns
 * against for a cost (a few seconds of list staleness) nobody asked to
 * avoid.
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
    },
  });
}
