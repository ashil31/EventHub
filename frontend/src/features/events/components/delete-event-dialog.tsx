import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button';
import { Dialog } from '../../../components/ui/dialog';
import { ApiError } from '../../../lib/api/api-error';
import { getEventErrorMessage } from '../lib/error-messages';
import { useDeleteEvent } from '../queries/hooks';

interface DeleteEventDialogProps {
  eventId: string;
  eventTitle: string;
}

const GENERIC_ERROR_MESSAGE =
  "We couldn't delete this event. Please try again.";

/**
 * Owns exactly the confirmation interaction (§27/§28) — `open` is
 * genuinely local, ephemeral UI state (§7 of Phase 6's brief, carried
 * forward: this is not server truth being duplicated). Deletion itself
 * goes through the existing Phase 2 `useDeleteEvent` mutation, unchanged
 * — no optimistic removal (§7/§30); the dialog stays open on failure so
 * the user can see the error and retry or cancel, and only navigates
 * away once the server has actually confirmed the delete.
 */
export function DeleteEventDialog({
  eventId,
  eventTitle,
}: DeleteEventDialogProps) {
  const [open, setOpen] = useState(false);
  const deleteEvent = useDeleteEvent();
  const navigate = useNavigate();

  function handleConfirm() {
    deleteEvent.mutate(eventId, {
      onSuccess: () => {
        toast.success('Event deleted');
        void navigate('/events', { replace: true });
      },
      onError: (error) => {
        toast.error("Couldn't delete event", {
          description:
            error instanceof ApiError
              ? getEventErrorMessage(error)
              : GENERIC_ERROR_MESSAGE,
        });
      },
    });
  }

  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        Delete event
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        aria-labelledby="delete-event-title"
      >
        <h2
          id="delete-event-title"
          className="text-base font-semibold text-foreground"
        >
          Delete event?
        </h2>
        <p className="mt-2 text-sm text-muted">
          This will permanently delete &quot;{eventTitle}&quot;. This action
          cannot be undone.
        </p>
        <div className="mt-5 flex justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setOpen(false)}
            disabled={deleteEvent.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={deleteEvent.isPending}
          >
            {deleteEvent.isPending ? 'Deleting…' : 'Delete event'}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
