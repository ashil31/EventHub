import type { Event } from '../../../types/event';
import { formatEventDateRange } from '../lib/format-event-date';

interface EventDetailMetaProps {
  event: Event;
}

/**
 * Only fields the backend's `EventResponseDto` actually returns (§10) —
 * every one of them is non-optional on that contract, so there's no
 * conditional omission logic here (unlike the description below, which
 * genuinely is nullable). Reuses `formatEventDateRange` from Phase 4
 * unchanged (§11) so the date format matches the event card exactly.
 * Semantic `<dl>` per §26 rather than a plain label:value div per row.
 */
export function EventDetailMeta({ event }: EventDetailMetaProps) {
  return (
    <dl className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-card p-5 text-sm sm:grid-cols-2">
      <div>
        <dt className="font-medium text-foreground">When</dt>
        <dd className="mt-1 text-muted">
          {formatEventDateRange(event.startsAt, event.endsAt)}
        </dd>
      </div>
      <div>
        <dt className="font-medium text-foreground">Location</dt>
        <dd className="mt-1 text-muted break-words">{event.location}</dd>
      </div>
      <div>
        <dt className="font-medium text-foreground">Attendees</dt>
        <dd className="mt-1 text-muted">
          {event.attendeeCount} / {event.capacity} attending
        </dd>
      </div>
      <div>
        <dt className="font-medium text-foreground">Hosted by</dt>
        <dd className="mt-1 text-muted break-words">{event.createdBy.name}</dd>
      </div>
    </dl>
  );
}
