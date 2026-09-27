import { useState } from 'react';
import { useAuth } from '../../auth/queries/hooks';
import { EventPagination } from '../../events/components/event-pagination';
import type { Event } from '../../../types/event';
import { Button } from '../../../components/ui/button';
import { Spinner } from '../../../components/ui/spinner';
import { useEventAttendees } from '../queries/hooks';
import { formatJoinedAt } from '../lib/format-joined-at';

interface EventAttendeesListProps {
  event: Event;
}

const LIMIT = 20;

/**
 * Attendee identities are private to the event's creator (the backend
 * enforces this with a 403 on GET /events/:id/attendees — see
 * RsvpService.listAttendees), so this renders nothing for anyone else.
 * Same ownership check as EventDetailActions: both sides are the same
 * UserSummary `{id, name, email}` shape, not a guessed comparison. This
 * is UI visibility only — the backend's own check is the real boundary.
 */
export function EventAttendeesList({ event }: EventAttendeesListProps) {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const isOwner = user !== null && user.id === event.createdBy.id;

  const query = useEventAttendees(
    event.id,
    { page, limit: LIMIT },
    { enabled: isOwner },
  );

  if (!isOwner) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-base font-semibold text-foreground">Attendees</h2>

      {query.isPending ? (
        <div className="mt-4 flex justify-center">
          <Spinner />
        </div>
      ) : query.isError ? (
        <div role="alert" className="mt-4 text-center">
          <p className="text-sm text-muted">Couldn&apos;t load attendees.</p>
          <Button
            variant="secondary"
            className="mt-3"
            onClick={() => void query.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : query.data.data.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No one has RSVP&apos;d yet.</p>
      ) : (
        <div className="mt-4 space-y-4">
          <ul className="divide-y divide-border">
            {query.data.data.map((attendee) => (
              <li
                key={attendee.user.id}
                className="flex items-center justify-between gap-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {attendee.user.name}
                  </p>
                  <p className="truncate text-sm text-muted">
                    {attendee.user.email}
                  </p>
                </div>
                <p className="shrink-0 text-sm text-muted">
                  {formatJoinedAt(attendee.joinedAt)}
                </p>
              </li>
            ))}
          </ul>
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
