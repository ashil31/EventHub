import { queryOptions } from '@tanstack/react-query';
import { eventsApi, type EventListFilters } from '../api/events-api';
import { eventKeys } from './keys';

/**
 * Stale-time reasoning (§ 26): events aren't live-ticking data, but a list
 * is more likely to be stale behind the user's back (someone else created
 * an event) than one specific detail page they're already looking at, so
 * both get the app-wide default (60s, set on the QueryClient itself) —
 * intentionally NOT overridden here with a bespoke value for either,
 * since neither has a concrete reason to diverge from that default.
 */
export const eventsQueries = {
  list: (filters: EventListFilters) =>
    queryOptions({
      queryKey: eventKeys.list(filters),
      queryFn: () => eventsApi.listEvents(filters),
    }),

  detail: (eventId: string) =>
    queryOptions({
      queryKey: eventKeys.detail(eventId),
      queryFn: () => eventsApi.getEvent(eventId),
      enabled: Boolean(eventId),
    }),
};
