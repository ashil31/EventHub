import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import {
  clearAuthToken,
  getAuthToken,
  setAuthToken,
} from '../../../lib/api/auth-token';
import type { UserSummary } from '../../../types/user';
import { rsvpKeys } from '../../rsvp/queries/keys';
import { authApi, type LoginInput, type RegisterInput } from '../api/auth-api';
import { authKeys } from './keys';
import { authQueries } from './options';

/**
 * `enabled: getAuthToken() !== null` (§ 27) — with no persisted token
 * there is nothing to validate, and firing `GET /auth/me` anyway would
 * just be a guaranteed 401 on every anonymous page load. `getAuthToken()`
 * reads a plain in-memory value (not reactive React state), which is
 * exactly right here: this only needs to reflect "was there a token at
 * mount" — `useLogin`/`useLogout` below update this query's cache
 * directly instead of relying on `enabled` toggling to react to
 * mid-session changes.
 */
export function useCurrentUser() {
  return useQuery({
    ...authQueries.me(),
    enabled: getAuthToken() !== null,
  });
}

/**
 * The small authentication-state abstraction (§ 12) every protected-route
 * boundary and auth-aware component reads instead of calling
 * `useCurrentUser()` and re-deriving these three states itself.
 *
 * `isLoading` is NOT simply `useCurrentUser().isPending` — in TanStack
 * Query v5, a disabled query (no token at all) reports `status: 'pending'`
 * forever, since it has never run and never will. That's "we already know
 * there's nothing to check," not "checking." `isLoading` here is only true
 * when a token genuinely exists and its validity hasn't been confirmed yet
 * — exactly the case `ProtectedRoute`/`RedirectIfAuthenticated` need to
 * show a neutral loading state for, instead of flashing "logged out" then
 * "logged in" on every hard refresh (§ 30).
 */
export function useAuth() {
  const query = useCurrentUser();
  const hasToken = getAuthToken() !== null;

  return {
    user: query.data ?? null,
    isAuthenticated: query.isSuccess,
    isLoading: hasToken && query.isPending,
    isError: query.isError,
  } as const;
}

/**
 * On success: stores the token (the one place `setAuthToken` is called
 * outside `auth-token.ts` itself) and writes the response's user directly
 * into the `auth.me` cache via `setQueryData` — the login response is
 * authoritative and this avoids an immediately-redundant `GET /auth/me`
 * request right after login. Only the `UserSummary` subset is stored
 * (`id`/`name`/`email`), not the response's extra `createdAt`, so the
 * cached shape matches what `GET /auth/me` itself would actually return
 * (§ G's `User` vs `UserSummary` distinction, confirmed in
 * `auth-api.ts`).
 */
export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: LoginInput) => authApi.login(input),
    onSuccess: (data) => {
      setAuthToken(data.accessToken);
      const summary: UserSummary = {
        id: data.user.id,
        name: data.user.name,
        email: data.user.email,
      };
      queryClient.setQueryData(authKeys.me(), summary);
    },
  });
}

/**
 * Registration does not authenticate the user (§ J's correction — no
 * token in the response), so there is no token to store and no
 * `auth.me` cache to update here. The caller (a future `RegisterForm`)
 * is responsible for routing a successful registration to the login flow.
 */
export function useRegister() {
  return useMutation({
    mutationFn: (input: RegisterInput) => authApi.register(input),
  });
}

/**
 * Not a `useMutation` — there is no logout endpoint to call (the backend
 * is stateless JWT auth; § 32 explicitly says not to invent one). Clears
 * the stored token and evicts the cached current user, so a stale user
 * can never flash before a redirect. No other query is cleared: in this
 * contract, `auth.me` is the only cached data that is actually per-user —
 * event and attendee-list responses are identical regardless of who's
 * asking (attendee listing is auth-gated, but its *content* isn't
 * user-specific), so `queryClient.clear()` would only cause pointless
 * refetches of data that was never wrong (§ 33).
 *
 * `.reset()` on the cache entry directly, NOT `queryClient.removeQueries()`
 * alone — a real bug found while manually verifying this flow (§ 49): a
 * still-mounted observer (`RootLayout`'s `useAuth()`, on screen for the
 * entire session) holds a direct reference to the `Query` object.
 * `removeQueries` only deletes that object from the cache's lookup map; it
 * never tells an observer already holding a reference that anything
 * changed, so the header kept rendering the old signed-in user
 * indefinitely. `query.reset()` explicitly transitions the query back to
 * its initial state and synchronously notifies every observer of that —
 * this is what actually makes `isSuccess` flip to `false` right away.
 * (`queryClient.resetQueries()` would do this too, but it also triggers a
 * refetch of any still-"active" query afterward — and at the exact moment
 * it runs, the observer's `enabled` is still the stale pre-logout `true`,
 * so it would fire one guaranteed, wasted 401 request; going straight to
 * the cache entry's own `reset()` avoids that.) `removeQueries` still
 * follows, to fully evict the now-empty entry from the cache rather than
 * leaving a reset-but-present one behind.
 *
 * `rsvpKeys.all` is removed too (Phase 8 audit) — unlike event/attendee
 * data, `rsvp.status(eventId)` genuinely is per-user (the signed-out-out
 * user's own attending/joinedAt for that event), and it has no mounted
 * observer holding a stale reference the way `auth.me` did, so a plain
 * `removeQueries` is sufficient here: the next signed-in user to view that
 * event refetches their own status instead of briefly seeing the previous
 * user's cached one.
 */
export function useLogout() {
  const queryClient = useQueryClient();

  return useCallback(() => {
    clearAuthToken();
    queryClient.getQueryCache().find({ queryKey: authKeys.me() })?.reset();
    queryClient.removeQueries({ queryKey: authKeys.me() });
    queryClient.removeQueries({ queryKey: rsvpKeys.all });
  }, [queryClient]);
}
