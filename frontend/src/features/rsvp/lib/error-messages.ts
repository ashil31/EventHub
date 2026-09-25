import { ApiError } from '../../../lib/api/api-error';

/**
 * Feature-level error mapping (mirrors `features/auth/lib/error-messages.ts`'s
 * established pattern exactly — one normalized `ApiError`, semantic
 * `status`/`isNetworkError` checks, never raw backend string matching).
 *
 * The backend's own message is passed through unmodified for both 404
 * and 409 — not just because it's convenient, but because every distinct
 * reason behind each status is already safe, specific, non-technical
 * text (confirmed in backend/src/rsvp/rsvp.service.ts): 404 means either
 * "Event not found" (join, or cancel of a deleted event) or "You are not
 * attending this event." (cancel of a stale/already-cancelled RSVP) —
 * two genuinely different situations a single hardcoded frontend string
 * would conflate; 409 means "already RSVP'd," "full," or "already
 * started" (all `code: 'CONFLICT'`, no further machine-readable
 * distinction). Same reasoning as the auth domain's precedent, not a new
 * judgment call.
 */
export function getRsvpErrorMessage(error: ApiError): string {
  if (error.isNetworkError) {
    return 'Unable to reach EventHub. Check your internet connection and try again.';
  }

  if (error.status === 401) {
    return 'Your session has expired. Please sign in again.';
  }

  if (error.status === 404 || error.status === 409) {
    return error.message;
  }

  if (error.status >= 500) {
    return 'Something went wrong on our end. Please try again.';
  }

  return "We couldn't complete your RSVP. Please try again.";
}
