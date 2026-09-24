/**
 * What `request.user` contains after JwtAuthGuard succeeds. Only what's
 * actually needed for identity and authorization — the future Events
 * module will do ownership checks like `event.createdBy === currentUser.id`
 * without knowing anything about JWTs.
 */
export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
}
