import { Link } from 'react-router';
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
 * N+1 request pattern. Only renders fields the API actually returns.
 *
 * Now that `/events/:eventId` exists (Phase 5 § 21), the title is a real
 * `Link` to it, stretched across the whole card via `after:absolute
 * after:inset-0` (the standard "stretched link" pattern) so the entire
 * card is clickable without wrapping non-interactive content in an
 * anchor — the link's accessible name stays just the event title
 * instead of the whole card's text, and there's exactly one interactive
 * element here, so there's no nested-interactive-element concern.
 */
export function EventCard({ event }: EventCardProps) {
  const isFull = event.availableSpots <= 0;

  return (
    <article className="relative flex h-full flex-col rounded-xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/40">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-foreground">
          <Link
            to={`/events/${event.id}`}
            className="after:absolute after:inset-0 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {event.title}
          </Link>
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
