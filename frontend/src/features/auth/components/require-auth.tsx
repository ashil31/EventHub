import { Navigate, Outlet, useLocation } from 'react-router';
import { Spinner } from '../../../components/ui/spinner';
import { useAuth } from '../queries/hooks';

/**
 * The authentication boundary (§ 22) every protected route is nested
 * under in the router table — a page never checks auth itself.
 *
 * Order matters: `isLoading` is checked BEFORE `isAuthenticated`. A token
 * from a previous session may still be valid but not yet confirmed — an
 * immediate "not authenticated yet" read would incorrectly redirect to
 * `/login` on every hard refresh before `GET /auth/me` has even
 * responded (§ 11/§ 30).
 */
export function RequireAuth() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!isAuthenticated) {
    // `location` here is React Router's own current-location object, not
    // a value ever read from a URL query string — there is no attacker-
    // controlled input flowing into this redirect target, so this can't
    // become an open redirect (§ 23).
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
