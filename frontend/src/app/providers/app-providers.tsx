import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { installAuthErrorHandling } from '../../features/auth/lib/install-auth-error-handling';
import { queryClient } from '../../lib/query/query-client';

// Runs once, at module load — not inside the component, same
// once-per-app-load pattern as `queryClient` itself (advanced-init-once).
// Not a `useEffect`: this subscribes to the QueryClient's own cache
// events, which exist independently of any component's lifecycle.
installAuthErrorHandling(queryClient);

/**
 * Composes every app-wide provider in one explicit place. Currently just
 * TanStack Query; future providers (e.g. a toast/notification provider)
 * are added here, not scattered across the tree — kept small on purpose
 * per Phase 1 § 9, not a dumping ground for unrelated setup. No
 * `AuthProvider`/`SessionProvider` here — authentication state is
 * TanStack Query state, already provided by `QueryClientProvider` (§ 48).
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
