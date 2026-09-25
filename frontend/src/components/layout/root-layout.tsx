import { Link, Outlet, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useAuth, useLogout } from '../../features/auth/queries/hooks';
import { Button } from '../ui/button';

/**
 * The application shell (Phase 1 § 19, extended in Phase 3 with
 * auth-aware nav — still not a full nav system, just what's needed to
 * move between the routes that exist so far). Reads auth state through
 * `useAuth()`, the same abstraction every other auth-aware component
 * uses — no separate nav-specific auth check.
 */
export function RootLayout() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const logout = useLogout();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    toast.success('Signed out');
    void navigate('/login', { replace: true });
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <Link to="/" className="text-lg font-semibold">
          EventHub
        </Link>

        <nav className="flex items-center gap-3">
          {!isLoading && isAuthenticated ? (
            <>
              <Link
                to="/dashboard"
                className="text-sm text-muted hover:text-foreground"
              >
                {user?.name}
              </Link>
              <Button variant="secondary" onClick={handleLogout}>
                Sign out
              </Button>
            </>
          ) : !isLoading ? (
            <>
              <Link
                to="/login"
                className="text-sm text-muted hover:text-foreground"
              >
                Sign in
              </Link>
              <Link to="/register">
                <Button>Sign up</Button>
              </Link>
            </>
          ) : null}
        </nav>
      </header>
      <main className="flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
