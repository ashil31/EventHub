import { Link } from 'react-router';
import { useAuth } from '../../auth/queries/hooks';
import type { Event } from '../../../types/event';
import { Button } from '../../../components/ui/button';
import { DeleteEventDialog } from './delete-event-dialog';

interface EventDetailActionsProps {
  event: Event;
}

/**
 * Owner-appropriate controls (§31) — rendered only when the signed-in
 * user's id matches `event.createdBy.id`. Both sides of this comparison
 * are real, confirmed-compatible identifiers: `useAuth().user` and
 * `Event.createdBy` are both the same `UserSummary` shape (`{id, name,
 * email}`, verified against the actual API types), not a guess that
 * `createdBy` happens to be an email or a raw string. This is UI
 * visibility only (§8) — the backend's own ownership check
 * (`EventsService.assertOwner`) remains the actual authorization.
 */
export function EventDetailActions({ event }: EventDetailActionsProps) {
  const { user } = useAuth();
  const isOwner = user !== null && user.id === event.createdBy.id;

  if (!isOwner) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Link to={`/events/${event.id}/edit`}>
        <Button variant="secondary">Edit event</Button>
      </Link>
      <DeleteEventDialog eventId={event.id} eventTitle={event.title} />
    </div>
  );
}
