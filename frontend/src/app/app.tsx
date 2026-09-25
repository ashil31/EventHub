import { Suspense } from 'react';
import { RouterProvider } from 'react-router';
import { ErrorBoundary } from '../components/layout/error-boundary';
import { router } from './router/router';
import { AppProviders } from './providers/app-providers';

/**
 * Browser → Router → Providers → Pages, per Phase 1 § D. `ErrorBoundary`
 * sits outermost so it can catch errors from providers/routing too, not
 * just page content; `Suspense` backs the router's own lazy page imports.
 */
export function App() {
  return (
    <ErrorBoundary>
      <AppProviders>
        <Suspense fallback={null}>
          <RouterProvider router={router} />
        </Suspense>
      </AppProviders>
    </ErrorBoundary>
  );
}
