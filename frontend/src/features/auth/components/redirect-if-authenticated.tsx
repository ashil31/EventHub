import { Navigate, Outlet } from 'react-router';
import { useAuth } from '../queries/hooks';

/**
 * The inverse boundary (§ 25) — wraps `/login` and `/register` so an
 * already-authenticated visitor is sent to the authenticated landing page
 * instead of seeing the login form again. Same `isLoading`-first ordering
 * as `RequireAuth`: rendering the form and then yanking it away a moment
 * later (once the auth check resolves) would be a worse flash than a
 * brief blank beat, so nothing renders until the check settles.
 */
export function RedirectIfAuthenticated() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
