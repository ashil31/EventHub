import type { Event } from '../../../types/event';
import type { CreateEventInput, UpdateEventInput } from '../api/events-api';
import type { EventFormValues } from '../schemas/event-schema';
import { fromDatetimeLocalValue, toDatetimeLocalValue } from './event-datetime';

/**
 * Focused, deterministic, pure transform functions (§51/§52) at the
 * boundary between form values and API request/response shapes — no
 * React, no API calls, no unsafe casts.
 */

/** API event → form values, for populating the edit form. The only place
 * this conversion happens (§19) — `EventForm` itself never re-derives
 * field values from an `Event` object. */
export function parseEventToFormValues(event: Event): EventFormValues {
  return {
    title: event.title,
    description: event.description ?? '',
    location: event.location,
    startsAt: toDatetimeLocalValue(event.startsAt),
    endsAt: toDatetimeLocalValue(event.endsAt),
    capacity: event.capacity,
  };
}

export function mapEventFormToCreateRequest(
  values: EventFormValues,
): CreateEventInput {
  return {
    title: values.title.trim(),
    description: values.description?.trim() || undefined,
    location: values.location.trim(),
    startsAt: fromDatetimeLocalValue(values.startsAt),
    endsAt: fromDatetimeLocalValue(values.endsAt),
    capacity: values.capacity,
  };
}

export type EventFormDirtyFields = Partial<
  Record<keyof EventFormValues, boolean>
>;

/**
 * Only the fields the user actually changed become part of the PATCH
 * (§18/§34/§51) — a real partial update, not the whole form resent every
 * time. This is also what keeps `editEventSchema`'s lack of a
 * "not in the past" check safe (see that schema's own comment): an
 * untouched `startsAt` is never included here, so it never reaches the
 * backend's own conditional re-validation of it either.
 */
export function mapEventFormToUpdateRequest(
  values: EventFormValues,
  dirtyFields: EventFormDirtyFields,
): UpdateEventInput {
  const update: UpdateEventInput = {};
  if (dirtyFields.title) {
    update.title = values.title.trim();
  }
  if (dirtyFields.description) {
    update.description = values.description?.trim() || undefined;
  }
  if (dirtyFields.location) {
    update.location = values.location.trim();
  }
  if (dirtyFields.startsAt) {
    update.startsAt = fromDatetimeLocalValue(values.startsAt);
  }
  if (dirtyFields.endsAt) {
    update.endsAt = fromDatetimeLocalValue(values.endsAt);
  }
  if (dirtyFields.capacity) {
    update.capacity = values.capacity;
  }
  return update;
}
