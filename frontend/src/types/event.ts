import type { UserSummary } from './user';

/**
 * Matches backend/src/events/dto/event-response.dto.ts exactly.
 *
 * Timestamps are `string`, not `Date` — the backend DTO class declares
 * them as `Date` for its own type-checking purposes, but what actually
 * crosses the wire as JSON is the ISO-8601 string `Date` serializes to.
 * `JSON.parse` never produces a `Date`. Domain types here describe what
 * the frontend actually receives, not the backend's in-process types
 * (§ 35 — dates are converted to `Date`/formatted only at render time by
 * a small utility, never stored as `Date` objects in the query cache).
 */
export interface Event {
  id: string;
  title: string;
  description: string | null;
  location: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  attendeeCount: number;
  availableSpots: number;
  createdBy: UserSummary;
  createdAt: string;
  updatedAt: string;
}
