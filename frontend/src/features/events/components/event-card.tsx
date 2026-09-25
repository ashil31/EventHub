import { cn } from '../../../lib/utils/cn';
import type { Event } from '../../../types/event';
import { formatEventDateRange } from '../lib/format-event-date';

interface EventCardProps {
  event: Event;
}

/**
 * Purely presentational (§ 23/§ 12) — receives the full `Event` it
 * already has from the list response rather than taking an id and
 * issuing its own query, which would turn a single list fetch into an
 * N+1 request pattern. Only renders fields the API actually returns; no
 * detail-page link yet since `/events/:id` doesn't exist in the router
 * (§ 3 — not created merely to give this card somewhere to point).
 */
export function EventCard({ event }: EventCardProps) {
  const isFull = event.availableSpots <= 0;

  return (
    <article className="flex h-full flex-col rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-foreground">
          {event.title}
        </h3>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
            isFull ? 'bg-muted/15 text-muted' : 'bg-primary/10 text-primary',
          )}
        >
          {isFull
            ? 'Full'
            : `${event.availableSpots} spot${event.availableSpots === 1 ? '' : 's'} left`}
        </span>
      </div>

      <p className="mt-1 text-sm text-muted">
        {formatEventDateRange(event.startsAt, event.endsAt)}
      </p>

      {event.description && (
        <p className="mt-3 line-clamp-2 text-sm text-foreground">
          {event.description}
        </p>
      )}

      <dl className="mt-4 space-y-1 text-sm text-muted">
        <div>
          <dt className="sr-only">Location</dt>
          <dd>{event.location}</dd>
        </div>
        <div>
          <dt className="sr-only">Attendees</dt>
          <dd>
            {event.attendeeCount} / {event.capacity} attending
          </dd>
        </div>
      </dl>
    </article>
  );
}
