import type { UserSummary } from './user';

/** Matches backend/src/rsvp/dto/attendee-response.dto.ts. */
export interface Attendee {
  user: UserSummary;
  joinedAt: string;
}

/**
 * The response body of `POST /events/:id/rsvp` — matches
 * backend/src/rsvp/dto/rsvp-response.dto.ts. Not a full `Event`, so it
 * can't replace an `eventKeys.detail(id)` cache entry directly; it does
 * carry the authoritative post-RSVP counts, which is why the RSVP mutation
 * hook invalidates rather than trying to hand-merge this into the event
 * detail shape.
 */
export interface RsvpResult {
  message: string;
  eventId: string;
  userId: string;
  joinedAt: string;
  attendeeCount: number;
  capacity: number;
  availableSpots: number;
}
