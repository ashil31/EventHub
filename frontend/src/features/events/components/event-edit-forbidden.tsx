import { Link } from 'react-router';
import { Button } from '../../../components/ui/button';

interface EventEditForbiddenProps {
  eventId: string;
}

/**
 * The proactive, UI-only half of ownership gating (§8/§9 of the brief) —
 * shown when the signed-in user has loaded the event and simply isn't
 * its creator, before a form is ever rendered or a mutation ever
 * attempted. This is UX, not authorization: the backend's own 403 (same
 * message, passed through by `getEventErrorMessage`) remains the actual
 * authority if this page is ever reached by another path.
 */
export function EventEditForbidden({ eventId }: EventEditForbiddenProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-8 text-center">
      <h1 className="text-base font-semibold text-foreground">
        You don&apos;t have permission to edit this event
      </h1>
      <p className="mt-1 text-sm text-muted">
        Only the event&apos;s creator can make changes to it.
      </p>
      <Link to={`/events/${eventId}`}>
        <Button variant="secondary" className="mt-4">
          Back to event
        </Button>
      </Link>
    </div>
  );
}
