import type { EventListFilters } from '../api/events-api';

/**
 * `page`/`limit` are defaulted here (not left to the backend) so that an
 * implicit `{}` and an explicit `{ page: 1, limit: 20 }` — the same
 * logical request — produce the exact same query key instead of two
 * separate cache entries for identical data (§ 28/§ 43).
 */
function normalizeFilters(
  filters: EventListFilters,
): Required<Pick<EventListFilters, 'page' | 'limit'>> & EventListFilters {
  return { page: 1, limit: 20, ...filters };
}

/**
 * Hierarchical, stable query keys (§ 18/§ 44) — no ad hoc strings like
 * `'eventList'`/`'allEvents'` anywhere else in the codebase. Structure
 * mirrors `eventKeys.lists()`/`.list(filters)` so
 * `invalidateQueries({ queryKey: eventKeys.lists() })` invalidates every
 * filtered list variant at once when that's the right scope (create), and
 * `.detail(id)` targets exactly one event when that's the right scope
 * (update/delete/RSVP).
 */
export const eventKeys = {
  all: ['events'] as const,
  lists: () => [...eventKeys.all, 'list'] as const,
  list: (filters: EventListFilters) =>
    [...eventKeys.lists(), normalizeFilters(filters)] as const,
  details: () => [...eventKeys.all, 'detail'] as const,
  detail: (eventId: string) => [...eventKeys.details(), eventId] as const,
};
