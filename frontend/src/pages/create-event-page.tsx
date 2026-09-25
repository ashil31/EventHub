import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { EventForm } from '../features/events/components/event-form';
import { mapEventFormToCreateRequest } from '../features/events/lib/event-form-transform';
import { getEventErrorMessage } from '../features/events/lib/error-messages';
import { useCreateEvent } from '../features/events/queries/hooks';
import type { EventFormValues } from '../features/events/schemas/event-schema';
import { ApiError } from '../lib/api/api-error';

const GENERIC_ERROR_MESSAGE = "We couldn't save this event. Please try again.";

/**
 * Route → mutation orchestration → navigation (§39) — the page's whole
 * job. `useCreateEvent` (Phase 2, unchanged) already seeds the detail
 * cache with the authoritative response and invalidates the event lists
 * on success (§17/§35); this page only has to navigate once that
 * resolves, never reconstruct the event itself.
 */
export function CreateEventPage() {
  const navigate = useNavigate();
  const createEvent = useCreateEvent();
  const [serverError, setServerError] = useState<string | null>(null);

  function handleSubmit(values: EventFormValues) {
    setServerError(null);
    createEvent.mutate(mapEventFormToCreateRequest(values), {
      onSuccess: (event) => {
        toast.success('Event created');
        void navigate(`/events/${event.id}`, { replace: true });
      },
      onError: (error) => {
        setServerError(
          error instanceof ApiError
            ? getEventErrorMessage(error)
            : GENERIC_ERROR_MESSAGE,
        );
      },
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Create event</h1>
        <p className="mt-1 text-sm text-muted">
          Fill in the details below to publish a new event.
        </p>
      </div>

      <EventForm
        mode="create"
        isSubmitting={createEvent.isPending}
        serverError={serverError}
        onSubmit={handleSubmit}
        onCancel={() => void navigate('/events')}
      />
    </div>
  );
}
