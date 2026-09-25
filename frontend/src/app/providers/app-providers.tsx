import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { queryClient } from '../../lib/query/query-client';

/**
 * Composes every app-wide provider in one explicit place. Currently just
 * TanStack Query; future providers (e.g. a toast/notification provider)
 * are added here, not scattered across the tree — kept small on purpose
 * per Phase 1 § 9, not a dumping ground for unrelated setup.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
