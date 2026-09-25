import { Navigate, Outlet, useLocation } from 'react-router';
import { getRedirectPath } from '../lib/get-redirect-path';
import { useAuth } from '../queries/hooks';

/**
 * The inverse boundary (§ 25) — wraps `/login` and `/register` so an
 * already-authenticated visitor is sent to the authenticated landing page
 * instead of seeing the login form again. Same `isLoading`-first ordering
 * as `RequireAuth`: rendering the form and then yanking it away a moment
 * later (once the auth check resolves) would be a worse flash than a
 * brief blank beat, so nothing renders until the check settles.
 *
 * Redirects to `getRedirectPath(location.state)`, not a hardcoded
 * `/dashboard` — found via real-browser testing while building Phase 6's
 * "Sign in to RSVP" flow (§27): `useLogin`'s hook-level `onSuccess` sets
 * the token and primes the `auth.me` cache *before* `LoginForm`'s own
 * call-level `onSuccess` runs its `navigate(getRedirectPath(...))`. That
 * cache write makes `isAuthenticated` flip to `true`, which re-renders
 * this component — and since it used to always target `/dashboard`, it
 * would win the race and redirect there first, discarding the real `from`
 * destination `LoginForm` was about to navigate to. This was invisible
 * throughout Phase 3 purely by coincidence: `/dashboard` was both
 * `getRedirectPath`'s only real destination AND its own fallback, so
 * either code path "winning" produced the same result. Now that `from`
 * can be a different page (an event's detail page), both redirect
 * sources compute the exact same destination from the exact same
 * `location.state`, so which one actually fires no longer matters.
 */
export function RedirectIfAuthenticated() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return null;
  }

  if (isAuthenticated) {
    return <Navigate to={getRedirectPath(location.state)} replace />;
  }

  return <Outlet />;
}
