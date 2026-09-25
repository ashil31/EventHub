import { EventList } from '../features/events/components/event-list';
import { EventListEmpty } from '../features/events/components/event-list-empty';
import { EventListError } from '../features/events/components/event-list-error';
import { EventListSkeleton } from '../features/events/components/event-list-skeleton';
import { EventPagination } from '../features/events/components/event-pagination';
import { EventSearchInput } from '../features/events/components/event-search-input';
import { EventTimeframeToggle } from '../features/events/components/event-timeframe-toggle';
import { useEventFilters } from '../features/events/hooks/use-event-filters';
import { toEventListFilters } from '../features/events/lib/event-search-params';
import { useEvents } from '../features/events/queries/hooks';
import { cn } from '../lib/utils/cn';

/**
 * Page orchestration only (§ 33): URL state (`useEventFilters`) + the
 * existing Phase 2 query hook (`useEvents`) + layout. No fetch calls, no
 * business logic, no date/query-key logic of its own — all of that lives
 * in the feature's `lib`/`queries` modules this page composes.
 */
export function EventsPage() {
  const { filters, setSearch, setPage, setTimeframe } = useEventFilters();
  const query = useEvents(toEventListFilters(filters));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Events</h1>
        <p className="mt-1 text-sm text-muted">
          Browse and search events happening on EventHub.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <EventSearchInput value={filters.search} onChange={setSearch} />
        <EventTimeframeToggle
          value={filters.timeframe}
          onChange={setTimeframe}
        />
      </div>

      {query.isPending ? (
        <EventListSkeleton />
      ) : query.isError ? (
        <EventListError onRetry={() => void query.refetch()} />
      ) : query.data.data.length === 0 ? (
        <EventListEmpty
          search={filters.search}
          onClearSearch={() => setSearch('')}
        />
      ) : (
        <div
          className={cn(
            'space-y-6',
            query.isFetching && 'opacity-60 transition-opacity',
          )}
        >
          <EventList events={query.data.data} />
          <EventPagination
            page={query.data.meta.page}
            totalPages={query.data.meta.totalPages}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  );
}
