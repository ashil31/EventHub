import { ApiError } from '../../../lib/api/api-error';

/**
 * Feature-level error mapping (§ 42 — deliberately not inside the generic
 * API client, which has no EventHub/auth-specific knowledge).
 *
 * Most statuses fall through to `error.message` unmodified rather than
 * being re-worded, because the backend already returns safe, specific,
 * user-appropriate text for every case that matters here — verified
 * directly in `auth.service.ts`: login's `UnauthorizedException` always
 * says exactly "Invalid email or password." (deliberately identical
 * whether the email doesn't exist or the password is wrong — never
 * reveals which), and registration's `ConflictException` says "Email
 * already registered." Neither is a Prisma error, a stack trace, or any
 * other internal detail — there is nothing to hide here, only network/
 * rate-limit cases genuinely need frontend-authored copy.
 */
export function getAuthErrorMessage(error: ApiError): string {
  if (error.isNetworkError) {
    return 'Unable to reach EventHub. Check your internet connection and try again.';
  }

  if (error.status === 429) {
    return 'Too many attempts. Please wait a moment and try again.';
  }

  if (error.status >= 500) {
    return 'Something went wrong on our end. Please try again.';
  }

  // 400 (validation), 401 (invalid credentials), 409 (duplicate email):
  // the backend's own message is already the right thing to show.
  return error.message;
}
