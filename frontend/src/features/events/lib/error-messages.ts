import { ApiError } from '../../../lib/api/api-error';

/**
 * Feature-level error mapping for create/update/delete, mirroring the
 * auth and rsvp domains' established pattern exactly: most statuses fall
 * through to `error.message` unmodified, because the backend already
 * returns safe, specific, non-technical text for every case that matters
 * here — confirmed directly in `backend/src/events/events.service.ts`:
 * 400 is a class-validator message or "startsAt must be before endsAt" /
 * "startsAt must not be in the past", 403 is "Only the event creator can
 * perform this action", 404 is "Event not found", 409 (capacity reduced
 * below the current attendee count) names the exact count. None of these
 * are Prisma errors or stack traces — only network/5xx genuinely need
 * frontend-authored copy.
 */
export function getEventErrorMessage(error: ApiError): string {
  if (error.isNetworkError) {
    return 'Unable to reach EventHub. Check your internet connection and try again.';
  }

  if (error.status === 401) {
    return 'Your session has expired. Please sign in again.';
  }

  if (error.status >= 500) {
    return 'Something went wrong on our end. Please try again.';
  }

  return error.message;
}
