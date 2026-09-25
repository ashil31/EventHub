import { keepPreviousData, queryOptions } from '@tanstack/react-query';
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
  /**
   * `placeholderData: keepPreviousData` (§ 11 of the Phase 4 brief): a
   * page/search/timeframe change keeps rendering the previous result set
   * while the new one loads instead of the whole grid disappearing behind
   * a skeleton on every filter change. `useEvents` (Phase 2) is otherwise
   * unchanged — this only affects the transition between two already-
   * distinct query keys, never which key a given filter set maps to.
   */
  list: (filters: EventListFilters) =>
    queryOptions({
      queryKey: eventKeys.list(filters),
      queryFn: () => eventsApi.listEvents(filters),
      placeholderData: keepPreviousData,
    }),

  detail: (eventId: string) =>
    queryOptions({
      queryKey: eventKeys.detail(eventId),
      queryFn: () => eventsApi.getEvent(eventId),
      enabled: Boolean(eventId),
    }),
};
