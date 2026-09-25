import { Suspense } from 'react';
import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { ErrorBoundary } from '../components/layout/error-boundary';
import { router } from './router/router';
import { AppProviders } from './providers/app-providers';

/**
 * Browser → Router → Providers → Pages, per Phase 1 § D. `ErrorBoundary`
 * sits outermost so it can catch errors from providers/routing too, not
 * just page content; `Suspense` backs the router's own lazy page imports.
 * `Toaster` is the one app-wide overlay (transient action feedback —
 * login/logout/register outcomes) — mounted once here. Deliberately
 * `theme="light"` regardless of the app's own dark/light mode — the
 * neutral white-card style (dark icon/text, no red/green tinting) is a
 * fixed design choice for the toast surface itself, not something that
 * should flip with the page.
 */
export function App() {
  return (
    <ErrorBoundary>
      <AppProviders>
        <Suspense fallback={null}>
          <RouterProvider router={router} />
        </Suspense>
        <Toaster theme="light" position="bottom-right" closeButton />
      </AppProviders>
    </ErrorBoundary>
  );
}
