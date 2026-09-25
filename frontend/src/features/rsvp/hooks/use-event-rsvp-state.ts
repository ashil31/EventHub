import { useAuth } from '../../auth/queries/hooks';
import { useRsvpStatus } from '../queries/hooks';

export type EventRsvpState =
  | { status: 'checking' }
  | { status: 'signed-out' }
  | { status: 'unavailable'; retry: () => void }
  | { status: 'not-attending' }
  | { status: 'attending' };

/**
 * Combines authentication state (`useAuth`, Phase 3) with this event's
 * RSVP status (`useRsvpStatus`, Phase 6) into the one discriminated union
 * `EventRsvpPanel` actually renders off of — the "derive RSVP UI state,
 * combine auth state + event state" responsibility §25 of the brief
 * calls out as a legitimate reason for a small custom hook, not a
 * `useState` wrapper. Owns no mutations (§26 — join/cancel stay as
 * direct `useRsvp`/`useCancelRsvp` calls in the panel itself, so this
 * hook has exactly one job).
 *
 * Every state here maps to something the panel actually renders
 * differently (§18) — no "maybe attending" or other state the product
 * doesn't have.
 */
export function useEventRsvpState(eventId: string): EventRsvpState {
  const auth = useAuth();
  const rsvpStatus = useRsvpStatus(eventId);

  if (auth.isLoading) {
    return { status: 'checking' };
  }
  if (!auth.isAuthenticated) {
    return { status: 'signed-out' };
  }
  if (rsvpStatus.isPending) {
    return { status: 'checking' };
  }
  if (rsvpStatus.isError) {
    return { status: 'unavailable', retry: () => void rsvpStatus.refetch() };
  }
  return rsvpStatus.data.attending
    ? { status: 'attending' }
    : { status: 'not-attending' };
}
