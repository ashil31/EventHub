import { ApiError } from '../../../lib/api/api-error';

/**
 * `GET /events/:id`'s only two possible 4xx responses are a genuine 404
 * ("Event not found") and a 400 from the backend's `ParseUUIDPipe` when
 * the route parameter isn't even a well-formed UUID. Both mean the same
 * thing to a visitor — "this isn't a real event" — so both map to the
 * same not-found UI. Shared by `EventDetailPage` (Phase 5) and
 * `EditEventPage` (Phase 7) — extracted here once a second page needed
 * the exact same logic, rather than duplicating the inline function
 * Phase 5 originally defined for itself.
 */
export function isMissingEvent(error: unknown): boolean {
  return (
    error instanceof ApiError && (error.status === 404 || error.status === 400)
  );
}
