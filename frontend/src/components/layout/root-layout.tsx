import type { ReactNode, SVGProps } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useAuth, useLogout } from '../../features/auth/queries/hooks';
import { cn } from '../../lib/utils/cn';
import { Button } from '../ui/button';

function IconBase(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

function EventsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <line x1="3" y1="9.5" x2="21" y2="9.5" />
      <line x1="8" y1="2.5" x2="8" y2="6.5" />
      <line x1="16" y1="2.5" x2="16" y2="6.5" />
    </IconBase>
  );
}

function CreateEventIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </IconBase>
  );
}

function ProfileIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20c0-4 3.5-6.5 7.5-6.5s7.5 2.5 7.5 6.5" />
    </IconBase>
  );
}

function SignOutIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" />
      <polyline points="15 16 20 12 15 8" />
      <line x1="20" y1="12" x2="9" y2="12" />
    </IconBase>
  );
}

interface NavItem {
  to: string;
  label: string;
  Icon: (props: SVGProps<SVGSVGElement>) => ReactNode;
  isActive: (pathname: string) => boolean;
}

/** The three destinations this app actually has for a signed-in user —
 * not a general-purpose nav config, so no reason to make it bigger than
 * that. "Events" stays active on the detail page too (`/events/:id`),
 * but not on `/events/new` or an edit route, which have their own items
 * (or, for edit, no sidebar item at all — reached only from the detail
 * page's own Edit button). */
const NAV_ITEMS: NavItem[] = [
  {
    to: '/events',
    label: 'Events',
    Icon: EventsIcon,
    isActive: (pathname) =>
      pathname === '/events' ||
      (pathname.startsWith('/events/') &&
        pathname !== '/events/new' &&
        !pathname.endsWith('/edit')),
  },
  {
    to: '/events/new',
    label: 'Create event',
    Icon: CreateEventIcon,
    isActive: (pathname) => pathname === '/events/new',
  },
  {
    to: '/dashboard',
    label: 'Profile',
    Icon: ProfileIcon,
    isActive: (pathname) => pathname === '/dashboard',
  },
];

/**
 * The application shell (Phase 1 § 19, made auth-aware in Phase 3,
 * rebuilt in Phase 8 as a persistent left sidebar for signed-in users —
 * the same shape as Vercel's own dashboard nav — rather than a top bar,
 * once there were enough authenticated-only destinations to justify one).
 * Signed-out visitors still get the original top bar; there's nothing to
 * put in a sidebar for two links (Sign in/Sign up) and it would just be
 * dead space next to public content that isn't a "dashboard."
 *
 * Reads auth state through `useAuth()`, the same abstraction every other
 * auth-aware component uses — no separate nav-specific auth check.
 */
export function RootLayout() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const logout = useLogout();
  const navigate = useNavigate();
  const location = useLocation();

  function handleLogout() {
    logout();
    toast.success('Signed out');
    void navigate('/login', { replace: true });
  }

  if (!isLoading && isAuthenticated) {
    return (
      <div className="flex min-h-dvh bg-background text-foreground">
        <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card px-3 py-4 md:flex">
          <Link to="/" className="px-2 text-lg font-semibold">
            EventHub
          </Link>

          <nav aria-label="Main" className="mt-6 flex flex-1 flex-col gap-1">
            {NAV_ITEMS.map(({ to, label, Icon, isActive }) => {
              const active = isActive(location.pathname);
              return (
                <Link
                  key={to}
                  to={to}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors',
                    active
                      ? 'bg-muted/15 font-medium text-foreground'
                      : 'text-muted hover:bg-muted/10 hover:text-foreground',
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto border-t border-border pt-3">
            <p className="truncate px-2 text-sm font-medium">{user?.name}</p>
            <p className="text-muted truncate px-2 text-xs">{user?.email}</p>
            <Button
              variant="secondary"
              className="mt-3 w-full justify-start gap-2.5"
              onClick={handleLogout}
            >
              <SignOutIcon className="size-4" />
              Sign out
            </Button>
          </div>
        </aside>

        {/* Mobile: the sidebar collapses (three links + sign out don't
            earn a slide-out drawer) and the same destinations stay
            reachable as a compact, wrapping top bar instead. */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 md:hidden">
            <Link to="/" className="text-lg font-semibold">
              EventHub
            </Link>
            <nav
              aria-label="Main"
              className="flex flex-wrap items-center gap-x-4 gap-y-2"
            >
              {NAV_ITEMS.map(({ to, label }) => (
                <Link
                  key={to}
                  to={to}
                  className="text-sm text-muted hover:text-foreground"
                >
                  {label}
                </Link>
              ))}
              <Button variant="secondary" onClick={handleLogout}>
                Sign out
              </Button>
            </nav>
          </header>
          <main className="flex-1 px-4 py-6">
            <Outlet />
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <Link to="/" className="text-lg font-semibold">
          EventHub
        </Link>

        <nav
          aria-label="Main"
          className="flex flex-wrap items-center gap-x-4 gap-y-2"
        >
          <Link
            to="/events"
            className="text-sm text-muted hover:text-foreground"
          >
            Events
          </Link>
          {!isLoading ? (
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
