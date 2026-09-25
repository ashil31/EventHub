import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter } from 'react-router';

/**
 * A fresh QueryClient per test (Phase 1 § 35) — retries/delays disabled so
 * failing-query tests don't hang, and so one test's cache can never leak
 * into another's via the app's shared singleton client.
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

export function renderWithQueryClient(
  ui: ReactElement,
  options?: RenderOptions,
): ReturnType<typeof render> {
  const queryClient = createTestQueryClient();

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  return render(ui, { wrapper: Wrapper, ...options });
}

/**
 * Additive to `renderWithQueryClient` (not a replacement — many existing
 * auth tests already depend on that exact export) for the pages Phase 4
 * introduces, which read/write the URL via React Router hooks
 * (`useSearchParams`) and therefore need a `Router` context in addition
 * to a `QueryClient` one.
 */
export function renderWithProviders(
  ui: ReactElement,
  options?: RenderOptions & { initialEntries?: string[] },
): ReturnType<typeof render> {
  const { initialEntries = ['/'], ...renderOptions } = options ?? {};
  const queryClient = createTestQueryClient();

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}
