import { Link, Outlet } from 'react-router';

/**
 * The minimal application shell (Phase 1 § 19): enough to prove routing,
 * providers, and styling all work together. Not real navigation — no
 * auth-aware links, no mobile menu — that's a feature-phase concern once
 * there's something to navigate to.
 */
export function RootLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="border-b border-border px-4 py-3">
        <Link to="/" className="text-lg font-semibold">
          EventHub
        </Link>
      </header>
      <main className="flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
