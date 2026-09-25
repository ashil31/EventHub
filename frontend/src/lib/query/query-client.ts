import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/api-error';

/** A 4xx means the request was rejected on its merits — retrying it
 * unchanged (auth failure, validation error, not found, conflict) can't
 * succeed. Only a network failure or a 5xx is worth one retry. */
function isRetryableError(error: unknown): boolean {
  if (!(error instanceof ApiError)) {
    return true;
  }
  return error.isNetworkError || error.status >= 500;
}

/**
 * The single application-wide QueryClient (Phase 1 § 10/§ 36 — never
 * constructed inside a component, never duplicated). Defaults are chosen
 * for EventHub specifically, not copied from a tutorial:
 *
 * - `staleTime: 60s` — events/attendee data isn't live-ticking; a page
 *   revisited within a minute shouldn't refetch, and anything that goes
 *   stale sooner than that is corrected by mutation-driven invalidation
 *   (the feature phases), not by polling. No `refetchInterval` anywhere.
 * - `retry`: one retry, skipped entirely for 4xx (see `isRetryableError`)
 *   so a 401/404/409 surfaces immediately instead of after a delay.
 * - Mutations don't retry automatically — a POST retried after a timeout
 *   is surprising UX even where the backend's own constraints make the
 *   retry itself safe; a failed mutation surfaces `isError` and lets the
 *   user retry deliberately.
 */
// Query-key factories are NOT defined here and won't be until a feature
// needs one. Per Phase 0 § D, each feature owns its own keys, colocated
// with the hooks that use them (e.g. src/features/events/api/keys.ts
// exporting `eventKeys`), not centralized in this file — this module stays
// generic infrastructure with zero EventHub-specific knowledge.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      retry: (failureCount, error) =>
        failureCount < 1 && isRetryableError(error),
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: false,
    },
  },
});
