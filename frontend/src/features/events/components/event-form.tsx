import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Button } from '../../../components/ui/button';
import { Field } from '../../../components/ui/field';
import { TextareaField } from '../../../components/ui/textarea-field';
import type { EventFormDirtyFields } from '../lib/event-form-transform';
import {
  createEventSchema,
  editEventSchema,
  type EventFormValues,
} from '../schemas/event-schema';

export interface EventFormProps {
  mode: 'create' | 'edit';
  /** Only meaningful (and only ever passed) in edit mode — the page
   * doesn't render `EventForm` at all until the event has loaded, so
   * there's no async-initialization problem to solve here (§19). */
  defaultValues?: EventFormValues;
  isSubmitting: boolean;
  /** A form-level banner for a server-rejected submission (§23/§24) —
   * field-level errors stay inline via React Hook Form/Zod; this is for
   * the case the API abstraction can't map to a specific field. */
  serverError?: string | null;
  onSubmit: (
    values: EventFormValues,
    dirtyFields: EventFormDirtyFields,
  ) => void;
  onCancel: () => void;
}

const EMPTY_DEFAULTS: EventFormValues = {
  title: '',
  description: '',
  location: '',
  startsAt: '',
  endsAt: '',
  capacity: 1,
};

/**
 * One reusable form, two modes (§10/§39) — mode-specific behavior (which
 * Zod schema applies, submit button text, whether the submit button
 * waits for a real change) comes through props, not two near-duplicate
 * components. Owns fields/validation/form-state/submission UI only —
 * no route params, no API calls, no navigation. The calling page owns
 * the mutation and decides what happens once it resolves.
 */
export function EventForm({
  mode,
  defaultValues,
  isSubmitting,
  serverError,
  onSubmit,
  onCancel,
}: EventFormProps) {
  const schema = mode === 'create' ? createEventSchema : editEventSchema;
  const {
    register,
    handleSubmit,
    formState: { errors, dirtyFields, isDirty },
  } = useForm<EventFormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues ?? EMPTY_DEFAULTS,
  });

  const submit = handleSubmit((values) => onSubmit(values, dirtyFields));

  // Edit mode waits for a real change (§34's "no unnecessary requests")
  // — an untouched form has nothing to save. Create mode has no prior
  // state to be dirty against, so it's never gated on this.
  const submitDisabled = isSubmitting || (mode === 'edit' && !isDirty);
  const submitLabel = isSubmitting
    ? mode === 'create'
      ? 'Creating…'
      : 'Saving…'
    : mode === 'create'
      ? 'Create event'
      : 'Save changes';

  return (
    <form
      onSubmit={(event) => void submit(event)}
      noValidate
      className="space-y-4"
    >
      {serverError && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {serverError}
        </p>
      )}

      <Field
        label="Title"
        error={errors.title?.message}
        {...register('title')}
      />

      <TextareaField
        label="Description"
        rows={4}
        error={errors.description?.message}
        {...register('description')}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Location"
          error={errors.location?.message}
          {...register('location')}
        />
        <Field
          label="Capacity"
          type="number"
          min={1}
          step={1}
          error={errors.capacity?.message}
          {...register('capacity', { valueAsNumber: true })}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Starts"
          type="datetime-local"
          error={errors.startsAt?.message}
          {...register('startsAt')}
        />
        <Field
          label="Ends"
          type="datetime-local"
          error={errors.endsAt?.message}
          {...register('endsAt')}
        />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={submitDisabled}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
