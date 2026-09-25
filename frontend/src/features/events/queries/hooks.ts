import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { attendeeKeys } from '../../rsvp/queries/keys';
import {
  eventsApi,
  type CreateEventInput,
  type EventListFilters,
  type UpdateEventInput,
} from '../api/events-api';
import { eventKeys } from './keys';
import { eventsQueries } from './options';

export function useEvents(filters: EventListFilters) {
  return useQuery(eventsQueries.list(filters));
}

/** `enabled: Boolean(eventId)` lives in `eventsQueries.detail` itself
 * (§ 27) so it applies consistently everywhere that query options object
 * is used, not just here. */
export function useEvent(eventId: string) {
  return useQuery(eventsQueries.detail(eventId));
}

/**
 * The response is the authoritative full `Event` (§ 22), so it seeds the
 * detail cache directly via `setQueryData` instead of waiting for a
 * refetch — a navigation straight to the new event's detail page then
 * renders instantly from cache. Lists still get invalidated (not
 * updated) because the new event's position within any given filtered/
 * paginated list isn't something this response can tell us.
 */
export function useCreateEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateEventInput) => eventsApi.createEvent(input),
    onSuccess: (event) => {
      queryClient.setQueryData(eventKeys.detail(event.id), event);
      void queryClient.invalidateQueries({ queryKey: eventKeys.lists() });
    },
  });
}

export function useUpdateEvent(eventId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateEventInput) =>
      eventsApi.updateEvent(eventId, input),
    onSuccess: (event) => {
      queryClient.setQueryData(eventKeys.detail(eventId), event);
      void queryClient.invalidateQueries({ queryKey: eventKeys.lists() });
    },
  });
}

/**
 * Removes (not just invalidates) the deleted event's own detail entry and
 * its attendee lists — a 404 on refetch would be correct but pointless
 * when we already know from this response why. Lists are invalidated
 * (some filtered/paginated list still needs a real refetch to know what
 * now fills the gap).
 */
export function useDeleteEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (eventId: string) => eventsApi.deleteEvent(eventId),
    onSuccess: (_data, eventId) => {
      queryClient.removeQueries({ queryKey: eventKeys.detail(eventId) });
      queryClient.removeQueries({
        queryKey: attendeeKeys.listsForEvent(eventId),
      });
      void queryClient.invalidateQueries({ queryKey: eventKeys.lists() });
    },
  });
}
