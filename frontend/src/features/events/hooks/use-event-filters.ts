import { useSearchParams } from 'react-router';
import {
  parseEventSearchParams,
  serializeEventSearchParams,
  type EventDiscoveryFilters,
  type EventTimeframe,
} from '../lib/event-search-params';

/**
 * The single place `/events` reads and writes its discovery state (§ 5) —
 * the URL itself, via React Router's `useSearchParams`, not a `useState`+
 * `useEffect` pair trying to stay in sync with it. `filters` is re-derived
 * from `searchParams` on every render (cheap, pure parsing), so there is
 * never a second source of truth to drift out of sync with the URL.
 */
export function useEventFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = parseEventSearchParams(searchParams);

  function update(
    next: Partial<EventDiscoveryFilters>,
    options?: { replace?: boolean },
  ) {
    setSearchParams(
      serializeEventSearchParams({ ...filters, ...next }),
      options,
    );
  }

  return {
    filters,
    /**
     * A materially new search term invalidates whatever page the user was
     * on (§ 7) — page 4 of the old results may not exist for the new
     * query. `replace: true` so debounced keystrokes don't each spam a
     * browser-history entry (§ 8).
     */
    setSearch: (search: string) =>
      update({ search, page: 1 }, { replace: true }),
    setPage: (page: number) => update({ page }),
    setTimeframe: (timeframe: EventTimeframe) => update({ timeframe, page: 1 }),
  };
}
