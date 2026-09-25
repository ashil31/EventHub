import type { AttendeesPagination } from '../api/rsvp-api';

function normalizePagination(
  pagination: AttendeesPagination,
): Required<AttendeesPagination> {
  return { page: 1, limit: 20, ...pagination };
}

export const attendeeKeys = {
  all: ['attendees'] as const,
  lists: () => [...attendeeKeys.all, 'list'] as const,
  /** Every attendee-list page cached for one event, regardless of
   * pagination — the prefix `events/` code invalidates/removes against
   * when an event's attendee data as a whole is affected (a new RSVP, a
   * cancellation, the event itself being deleted). */
  listsForEvent: (eventId: string) =>
    [...attendeeKeys.lists(), eventId] as const,
  list: (eventId: string, pagination: AttendeesPagination) =>
    [
      ...attendeeKeys.listsForEvent(eventId),
      normalizePagination(pagination),
    ] as const,
};
