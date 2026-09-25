/**
 * Matches backend/src/users/dto/user-response.dto.ts. Returned by
 * `POST /auth/register` only — nowhere else (see `UserSummary` below).
 * `passwordHash` doesn't exist here because the backend never puts it in
 * a response body in the first place, not because the frontend strips it.
 */
export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

/**
 * Matches backend/src/users/dto/user-summary.dto.ts — the minimal shape
 * used everywhere identity is embedded rather than the full user (an
 * event's `createdBy`, an attendee's `user`, a login response's `user`,
 * and — confirmed directly from auth.controller.ts's `me()` handler,
 * which returns the `AuthenticatedUser` request property, not
 * `UserResponseDto` — the ENTIRE response of `GET /auth/me` too, despite
 * that route's Swagger annotation and Phase 0's draft doc both pointing
 * at `UserSummaryDto`). No `createdAt`.
 */
export interface UserSummary {
  id: string;
  name: string;
  email: string;
}
