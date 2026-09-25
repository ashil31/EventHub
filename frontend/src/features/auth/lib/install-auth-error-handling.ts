import type { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../../../lib/api/api-error';
import { clearAuthToken } from '../../../lib/api/auth-token';
import { authKeys } from '../queries/keys';

/**
 * Global 401 reaction (§ 9/§ 31): the current-user query going stale on
 * its own 5-minute `staleTime` isn't good enough — if a *different*
 * request (a future protected mutation, or `auth.me` itself refetching on
 * window focus) comes back 401 because the token expired or was revoked,
 * the stored token and the cached `auth.me` user must be invalidated
 * immediately, not up to 5 minutes later. Subscribing to the query/
 * mutation caches directly (not a React effect — this runs once, outside
 * any component, exactly like `queryClient` itself being module-scope
 * singleton state) is the mechanism TanStack Query provides for exactly
 * this kind of cross-cutting reaction.
 *
 * Deliberately lives in the auth feature, not in `lib/query/query-client.ts`
 * — the generic QueryClient stays free of any feature's knowledge (it
 * doesn't know `authKeys` exists); this function is what wires the two
 * together, called once from `AppProviders`.
 *
 * No retry loop risk: the QueryClient's global `retry` policy (Phase 1)
 * already skips every 4xx, so a 401 settles immediately — this only reacts
 * to an already-settled error, it never triggers a request itself.
 */
export function installAuthErrorHandling(queryClient: QueryClient): void {
  function handlePossibleAuthError(error: unknown): void {
    if (error instanceof ApiError && error.status === 401) {
      clearAuthToken();
      // `.reset()` first, not just `removeQueries` — see the detailed
      // explanation in `useLogout` (`queries/hooks.ts`): a 401 from some
      // OTHER request (not `auth.me` itself) never touches `auth.me`'s own
      // observer, so without this, a still-mounted component reading
      // `useAuth()` would keep showing the old cached user indefinitely.
      queryClient.getQueryCache().find({ queryKey: authKeys.me() })?.reset();
      queryClient.removeQueries({ queryKey: authKeys.me() });
    }
  }

  queryClient.getQueryCache().subscribe((event) => {
    if (event.type === 'updated' && event.action.type === 'error') {
      handlePossibleAuthError(event.action.error);
    }
  });

  queryClient.getMutationCache().subscribe((event) => {
    if (event.type === 'updated' && event.action.type === 'error') {
      handlePossibleAuthError(event.action.error);
    }
  });
}
