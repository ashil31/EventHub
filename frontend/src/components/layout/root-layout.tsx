import { useEffect, useState, type ReactNode, type SVGProps } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useAuth, useLogout } from '../../features/auth/queries/hooks';
import { cn } from '../../lib/utils/cn';
import { Button } from '../ui/button';
import {
  MobileNav,
  MobileNavHeader,
  MobileNavMenu,
  MobileNavToggle,
  Navbar,
  NavBody,
  NavbarButton,
  NavbarLogo,
  NavItems,
} from '../ui/resizable-navbar';

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

const PUBLIC_NAV_ITEMS = [{ name: 'Events', link: '/events' }];

function isEventsLinkActive(pathname: string): boolean {
  return (
    pathname === '/events' ||
    (pathname.startsWith('/events/') &&
      pathname !== '/events/new' &&
      !pathname.endsWith('/edit'))
  );
}

/** Closes the mobile nav menu on Escape — the menu is a dismissible
 * dropdown (click-outside already closes it, wired in
 * `resizable-navbar.tsx`'s own overlay button), not a modal, so this is
 * the one extra bit of keyboard support it doesn't already get for free. */
function useCloseOnEscape(isOpen: boolean, onClose: () => void) {
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);
}

/**
 * The application shell (Phase 1 § 19, made auth-aware in Phase 3,
 * rebuilt in Phase 8 as a persistent left sidebar for signed-in users on
 * desktop — the same shape as Vercel's own dashboard nav — since there
 * were enough authenticated-only destinations to justify one; that part
 * is unchanged here). Signed-out visitors, and the signed-in mobile
 * fallback (below `md`, where the sidebar itself is hidden), now use the
 * "resizable navbar" primitive (`ui/resizable-navbar.tsx`) — a pill-
 * shaped bar that shrinks and gains a blurred backdrop once the page is
 * scrolled, with a hamburger-driven dropdown below `lg`/`md` respectively.
 *
 * Reads auth state through `useAuth()`, the same abstraction every other
 * auth-aware component uses — no separate nav-specific auth check.
 */
export function RootLayout() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const logout = useLogout();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useCloseOnEscape(isMobileMenuOpen, () => setIsMobileMenuOpen(false));

  function closeMobileMenu() {
    setIsMobileMenuOpen(false);
  }

  function handleLogout() {
    logout();
    toast.success('Signed out');
    closeMobileMenu();
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
            reachable through the resizable navbar's hamburger menu. */}
        <div className="flex min-w-0 flex-1 flex-col">
          <Navbar className="md:hidden">
            <MobileNav className="md:hidden">
              <MobileNavHeader>
                <NavbarLogo />
                <MobileNavToggle
                  isOpen={isMobileMenuOpen}
                  onClick={() => setIsMobileMenuOpen((open) => !open)}
                />
              </MobileNavHeader>
              <MobileNavMenu
                isOpen={isMobileMenuOpen}
                onClose={closeMobileMenu}
              >
                {NAV_ITEMS.map(({ to, label, Icon, isActive }) => {
                  const active = isActive(location.pathname);
                  return (
                    <Link
                      key={to}
                      to={to}
                      onClick={closeMobileMenu}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-sm',
                        active
                          ? 'bg-muted/15 font-medium text-foreground'
                          : 'text-muted hover:text-foreground',
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      {label}
                    </Link>
                  );
                })}
                <NavbarButton
                  variant="secondary"
                  onClick={handleLogout}
                  className="mt-2 w-full justify-start gap-2.5"
                >
                  <SignOutIcon className="size-4" />
                  Sign out
                </NavbarButton>
              </MobileNavMenu>
            </MobileNav>
          </Navbar>
          <main className="flex-1 px-4 py-6">
            <Outlet />
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <Navbar>
        <NavBody>
          <NavbarLogo />
          <NavItems items={PUBLIC_NAV_ITEMS} isActive={isEventsLinkActive} />
          <div className="flex items-center gap-3">
            {!isLoading ? (
              <>
                <NavbarButton to="/login" variant="secondary">
                  Sign in
                </NavbarButton>
                <NavbarButton to="/register" variant="primary">
                  Sign up
                </NavbarButton>
              </>
            ) : null}
          </div>
        </NavBody>

        <MobileNav>
          <MobileNavHeader>
            <NavbarLogo />
            <MobileNavToggle
              isOpen={isMobileMenuOpen}
              onClick={() => setIsMobileMenuOpen((open) => !open)}
            />
          </MobileNavHeader>
          <MobileNavMenu isOpen={isMobileMenuOpen} onClose={closeMobileMenu}>
            <Link
              to="/events"
              onClick={closeMobileMenu}
              aria-current={
                isEventsLinkActive(location.pathname) ? 'page' : undefined
              }
              className="w-full rounded-md px-2 py-2 text-sm text-muted hover:text-foreground"
            >
              Events
            </Link>
            {!isLoading ? (
              <div className="flex w-full flex-col gap-3">
                <NavbarButton
                  to="/login"
                  variant="secondary"
                  onClick={closeMobileMenu}
                  className="w-full"
                >
                  Sign in
                </NavbarButton>
                <NavbarButton
                  to="/register"
                  variant="primary"
                  onClick={closeMobileMenu}
                  className="w-full"
                >
                  Sign up
                </NavbarButton>
              </div>
            ) : null}
          </MobileNavMenu>
        </MobileNav>
      </Navbar>
      {/* Same `max-w-6xl` bound as `NavBody` above it, so page content's
       * left/right edges line up with the navbar's instead of each page
       * centering its own, differently-sized container independently
       * (e.g. the home page's narrower box previously started well to
       * the right of the navbar's logo). A page is still free to center
       * a narrower box of its own inside this one — that stays nested
       * and correctly centered either way. */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
