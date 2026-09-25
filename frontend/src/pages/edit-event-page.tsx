import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { Spinner } from '../components/ui/spinner';
import { useAuth } from '../features/auth/queries/hooks';
import { EventDetailError } from '../features/events/components/event-detail-error';
import { EventDetailNotFound } from '../features/events/components/event-detail-not-found';
import { EventEditForbidden } from '../features/events/components/event-edit-forbidden';
import { EventForm } from '../features/events/components/event-form';
import {
  mapEventFormToUpdateRequest,
  parseEventToFormValues,
  type EventFormDirtyFields,
} from '../features/events/lib/event-form-transform';
import { getEventErrorMessage } from '../features/events/lib/error-messages';
import { isMissingEvent } from '../features/events/lib/is-missing-event';
import { useEvent, useUpdateEvent } from '../features/events/queries/hooks';
import type { EventFormValues } from '../features/events/schemas/event-schema';
import { ApiError } from '../lib/api/api-error';

const GENERIC_ERROR_MESSAGE = "We couldn't save this event. Please try again.";

/**
 * Route param → `useEvent` → render the right state → `EventForm` →
 * `useUpdateEvent` → navigation (§39). `EventForm` is only ever mounted
 * once the event has actually loaded (the success branch below), so
 * there is no async-defaultValues problem to solve with effects (§19) —
 * by the time it exists, `parseEventToFormValues(event)` is already the
 * real, complete initial state.
 */
export function EditEventPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const query = useEvent(eventId ?? '');
  const updateEvent = useUpdateEvent(eventId ?? '');
  const [serverError, setServerError] = useState<string | null>(null);

  if (query.isPending) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (query.isError) {
    return isMissingEvent(query.error) ? (
      <EventDetailNotFound />
    ) : (
      <EventDetailError onRetry={() => void query.refetch()} />
    );
  }

  const event = query.data;
  // Proactive, UI-only ownership gating (§8/§9) — the backend's own 403
  // is still the real authority; this just avoids showing a form to a
  // visitor who can never successfully submit it.
  const isOwner = user !== null && user.id === event.createdBy.id;
  if (!isOwner) {
    return <EventEditForbidden eventId={event.id} />;
  }

  function handleSubmit(
    values: EventFormValues,
    dirtyFields: EventFormDirtyFields,
  ) {
    setServerError(null);
    updateEvent.mutate(mapEventFormToUpdateRequest(values, dirtyFields), {
      onSuccess: () => {
        toast.success('Event updated');
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
        <h1 className="text-2xl font-bold">Edit event</h1>
      </div>

      <EventForm
        mode="edit"
        defaultValues={parseEventToFormValues(event)}
        isSubmitting={updateEvent.isPending}
        serverError={serverError}
        onSubmit={handleSubmit}
        onCancel={() => void navigate(`/events/${event.id}`)}
      />
    </div>
  );
}
