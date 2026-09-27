import { Link, useParams } from 'react-router';
import { EventDetailActions } from '../features/events/components/event-detail-actions';
import { EventDetailError } from '../features/events/components/event-detail-error';
import { EventDetailHeader } from '../features/events/components/event-detail-header';
import { EventDetailMeta } from '../features/events/components/event-detail-meta';
import { EventDetailNotFound } from '../features/events/components/event-detail-not-found';
import { EventDetailSkeleton } from '../features/events/components/event-detail-skeleton';
import { isMissingEvent } from '../features/events/lib/is-missing-event';
import { useEvent } from '../features/events/queries/hooks';
import { EventAttendeesList } from '../features/rsvp/components/event-attendees-list';
import { EventRsvpPanel } from '../features/rsvp/components/event-rsvp-panel';

/**
 * Route param → query state → render (§35) — nothing else. `useEvent`
 * (Phase 2, unchanged) already has `enabled: Boolean(eventId)` baked
 * into its query options, so there's no separate "only fetch when valid"
 * logic to add here.
 *
 * No hover/focus prefetch and no reuse of the list response as
 * `initialData` (§22/§24, both explicitly "evaluate, don't add
 * automatically"): the list's items are field-for-field identical to
 * the detail response today, but that's an implementation coincidence,
 * not a documented contract, and finding a matching event across
 * however many cached filtered/paginated list query-key variants exist
 * would add real complexity for a barely-perceptible latency win on a
 * fast local/same-region API. The detail endpoint stays the sole
 * source of truth, exactly as diagrammed.
 */
export function EventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const query = useEvent(eventId ?? '');

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        to="/events"
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
      >
        <span aria-hidden="true">←</span> Back to events
      </Link>

      {query.isPending ? (
        <EventDetailSkeleton />
      ) : query.isError ? (
        isMissingEvent(query.error) ? (
          <EventDetailNotFound />
        ) : (
          <EventDetailError onRetry={() => void query.refetch()} />
        )
      ) : (
        <div className="space-y-6">
          <EventDetailHeader event={query.data} />
          <EventDetailActions event={query.data} />
          <EventDetailMeta event={query.data} />
          {query.data.description && (
            <p className="text-sm leading-relaxed whitespace-pre-line text-foreground">
              {query.data.description}
            </p>
          )}
          <EventRsvpPanel eventId={query.data.id} />
          <EventAttendeesList event={query.data} />
        </div>
      )}
    </div>
  );
}
