import { useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button';
import { Spinner } from '../../../components/ui/spinner';
import { ApiError } from '../../../lib/api/api-error';
import { eventKeys } from '../../events/queries/keys';
import { useEventRsvpState } from '../hooks/use-event-rsvp-state';
import { getRsvpErrorMessage } from '../lib/error-messages';
import { useCancelRsvp, useRsvp } from '../queries/hooks';
import { rsvpKeys } from '../queries/keys';

interface EventRsvpPanelProps {
  eventId: string;
}

const GENERIC_ERROR_MESSAGE =
  "We couldn't complete your RSVP. Please try again.";

/**
 * The one focused RSVP component (§6/§24) — takes only an `eventId`, not
 * the event itself, and owns nothing beyond: current status (via
 * `useEventRsvpState`), the join/cancel actions (the existing Phase 2
 * mutations, unmodified), and this interaction's own feedback. No event
 * fetching, no route-param parsing, no capacity display (that's already
 * `EventDetailMeta`'s job — duplicating it here would show the same
 * numbers twice) — see phase-6-rsvp.md §H for the full reasoning.
 */
export function EventRsvpPanel({ eventId }: EventRsvpPanelProps) {
  const location = useLocation();
  const queryClient = useQueryClient();
  const rsvpState = useEventRsvpState(eventId);
  const rsvp = useRsvp(eventId);
  const cancelRsvp = useCancelRsvp(eventId);

  /**
   * A 404 ("event deleted mid-visit," §46) or a 409 ("already RSVP'd"/
   * "full"/"already started" — always because the cached status was
   * stale, §17/§22) both mean this panel's cached view of reality is
   * wrong. Re-syncing here, not optimistically guessing what the new
   * truth is, is the same "let the server response win" principle as
   * every other cache decision in this feature (§20/§44/§45).
   */
  function resyncAfterServerRejection(error: ApiError) {
    if (error.status === 404 || error.status === 409) {
      void queryClient.invalidateQueries({
        queryKey: rsvpKeys.status(eventId),
      });
      void queryClient.invalidateQueries({
        queryKey: eventKeys.detail(eventId),
      });
    }
  }

  function handleMutationError(title: string, error: unknown) {
    toast.error(title, {
      description:
        error instanceof ApiError
          ? getRsvpErrorMessage(error)
          : GENERIC_ERROR_MESSAGE,
    });
    if (error instanceof ApiError) {
      resyncAfterServerRejection(error);
    }
  }

  function handleJoin() {
    rsvp.mutate(undefined, {
      onSuccess: () => toast.success("You're attending this event."),
      onError: (error) => handleMutationError("Couldn't RSVP", error),
    });
  }

  function handleCancel() {
    cancelRsvp.mutate(undefined, {
      onSuccess: () => toast.success('RSVP cancelled'),
      onError: (error) => handleMutationError("Couldn't cancel RSVP", error),
    });
  }

  if (rsvpState.status === 'checking') {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <Spinner />
      </div>
    );
  }

  if (rsvpState.status === 'signed-out') {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-sm text-muted">Sign in to RSVP for this event.</p>
        <Link to="/login" state={{ from: location }}>
          <Button className="mt-3">Sign in to RSVP</Button>
        </Link>
      </div>
    );
  }

  if (rsvpState.status === 'unavailable') {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-sm text-muted">
          Couldn&apos;t check your RSVP status.
        </p>
        <Button variant="secondary" className="mt-3" onClick={rsvpState.retry}>
          Retry
        </Button>
      </div>
    );
  }

  if (rsvpState.status === 'attending') {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-sm font-medium text-foreground">
          You&apos;re attending this event.
        </p>
        <Button
          variant="secondary"
          className="mt-3"
          onClick={handleCancel}
          disabled={cancelRsvp.isPending}
        >
          {cancelRsvp.isPending ? 'Cancelling…' : 'Cancel RSVP'}
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <Button onClick={handleJoin} disabled={rsvp.isPending}>
        {rsvp.isPending ? 'Joining…' : 'Join Event'}
      </Button>
    </div>
  );
}
