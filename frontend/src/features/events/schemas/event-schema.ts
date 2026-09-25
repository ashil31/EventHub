import { z } from 'zod';

// Absorbs minor clock skew between the browser and the moment of
// submission — mirrors backend/src/events/events.service.ts's own
// `PAST_EVENT_GRACE_MS` exactly, so the frontend's "not in the past"
// check and the backend's don't disagree at the boundary.
const PAST_EVENT_GRACE_MS = 60_000;

/**
 * Mirrors backend/src/events/dto/create-event.dto.ts /
 * update-event.dto.ts (`UpdateEventDto` is `CreateEventDto`'s
 * `PartialType`) field for field: title required ≤200, description
 * optional ≤2000, location required ≤200, capacity a positive integer.
 *
 * `startsAt`/`endsAt` here are `datetime-local` input values (browser-
 * local time, no timezone) — the conversion to the ISO-8601 UTC strings
 * the API actually wants happens at the request-transform boundary
 * (`lib/event-form-transform.ts`), never in this schema.
 */
const eventFormFields = {
  title: z
    .string()
    .trim()
    .min(1, 'Title is required')
    .max(200, 'Title must be 200 characters or fewer'),
  description: z
    .string()
    .trim()
    .max(2000, 'Description must be 2000 characters or fewer')
    .optional(),
  location: z
    .string()
    .trim()
    .min(1, 'Location is required')
    .max(200, 'Location must be 200 characters or fewer'),
  startsAt: z.string().min(1, 'Start date/time is required'),
  endsAt: z.string().min(1, 'End date/time is required'),
  // No custom "required" message: an empty capacity input becomes `NaN`
  // via React Hook Form's `valueAsNumber`, and `NaN` already fails
  // `.int()` (Number.isInteger(NaN) === false), surfacing this same
  // message for both "empty" and "not a whole number" — close enough to
  // not warrant Zod v4's more involved custom-error-map API for one field.
  capacity: z
    .number()
    .int('Capacity is required and must be a whole number')
    .positive('Capacity must be at least 1'),
};

const eventFormSchema = z.object(eventFormFields);

export type EventFormValues = z.infer<typeof eventFormSchema>;

function isStartBeforeEnd(values: EventFormValues): boolean {
  return (
    new Date(values.startsAt).getTime() < new Date(values.endsAt).getTime()
  );
}

const DATE_ORDER_ISSUE = {
  message: 'Start must be before end',
  path: ['endsAt'],
};

/**
 * Create mode also rejects a start time already in the past — matching
 * `EventsService.create`'s unconditional check. Edit mode deliberately
 * does NOT apply this check (see `editEventSchema` below).
 */
export const createEventSchema = eventFormSchema
  .refine(isStartBeforeEnd, DATE_ORDER_ISSUE)
  .refine(
    (values) =>
      new Date(values.startsAt).getTime() > Date.now() - PAST_EVENT_GRACE_MS,
    { message: 'Start must not be in the past', path: ['startsAt'] },
  );

/**
 * No "not in the past" check (§13/§15 — the backend only re-validates
 * `startsAt` on update when the client actually sends a new value;
 * `EventsService.update` skips it entirely when `dto.startsAt` is
 * absent). This schema validates the form's *current* values regardless
 * of which fields the user touched, so enforcing "not in the past"
 * unconditionally here would incorrectly block an edit to, say, just the
 * capacity of an event whose original start time has since passed —
 * `mapEventFormToUpdateRequest` only ever sends fields the user actually
 * changed (see `lib/event-form-transform.ts`), so an untouched startsAt
 * never reaches the backend's check either. The backend remains the
 * final authority if a user does deliberately set a past start time.
 */
export const editEventSchema = eventFormSchema.refine(
  isStartBeforeEnd,
  DATE_ORDER_ISSUE,
);
