import type { EventListFilters } from '../api/events-api';

/**
 * Fixed page size for the discovery grid — deliberately not a URL
 * parameter (§ 6 of the Phase 4 brief warns against exposing arbitrary
 * query parameters the backend has to defend against; `limit` has no UI
 * control, so there is nothing for a URL to legitimately override).
 */
export const EVENTS_PAGE_SIZE = 12;

export type EventTimeframe = 'upcoming' | 'all';

/**
 * The event-discovery page's entire URL-owned state (§ 5). `page` is
 * always a positive integer and `timeframe` is always one of the two
 * known values — parsing below is the one place that guarantee is
 * established, so nothing downstream has to re-validate it.
 */
export interface EventDiscoveryFilters {
  search: string;
  page: number;
  timeframe: EventTimeframe;
}

const DEFAULT_FILTERS: EventDiscoveryFilters = {
  search: '',
  page: 1,
  timeframe: 'upcoming',
};

/**
 * The backend's `ListEventsDto.from` defaults to "now" when omitted,
 * which is exactly the "upcoming only" behavior this page defaults to
 * (§ list-events.dto.ts). "All events" therefore means sending an
 * explicit `from` far enough in the past that no real event predates it,
 * rather than the frontend trying to special-case "no lower bound" — the
 * backend's contract has no such option.
 */
const BEGINNING_OF_TIME = '1970-01-01T00:00:00.000Z';

function parsePage(raw: string | null): number {
  if (raw === null) return DEFAULT_FILTERS.page;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_FILTERS.page;
}

function parseTimeframe(raw: string | null): EventTimeframe {
  return raw === 'all' ? 'all' : DEFAULT_FILTERS.timeframe;
}

/** Invalid input (`?page=abc`, `?page=-10`, `?timeframe=whatever`) always
 * falls back to a safe default rather than reaching the API layer. */
export function parseEventSearchParams(
  params: URLSearchParams,
): EventDiscoveryFilters {
  return {
    search: params.get('search')?.trim() ?? DEFAULT_FILTERS.search,
    page: parsePage(params.get('page')),
    timeframe: parseTimeframe(params.get('timeframe')),
  };
}

/** The inverse of `parseEventSearchParams` — only writes params that
 * differ from the default, so `/events` with default filters stays
 * exactly `/events`, never `/events?page=1&timeframe=upcoming`. */
export function serializeEventSearchParams(
  filters: EventDiscoveryFilters,
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.page !== DEFAULT_FILTERS.page) {
    params.set('page', String(filters.page));
  }
  if (filters.timeframe !== DEFAULT_FILTERS.timeframe) {
    params.set('timeframe', filters.timeframe);
  }
  return params;
}

/** Maps URL-owned discovery state to the shape the existing Phase 2
 * `useEvents`/`eventsApi.listEvents` contract expects (§ 9) — the only
 * point of contact between this page's URL state and the query layer. */
export function toEventListFilters(
  filters: EventDiscoveryFilters,
): EventListFilters {
  return {
    page: filters.page,
    limit: EVENTS_PAGE_SIZE,
    search: filters.search || undefined,
    from: filters.timeframe === 'all' ? BEGINNING_OF_TIME : undefined,
  };
}
