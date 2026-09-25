import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import {
  clearAuthToken,
  getAuthToken,
  setAuthToken,
} from '../../../lib/api/auth-token';
import type { UserSummary } from '../../../types/user';
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
 * the stored token and removes (not just invalidates) the cached current
 * user, so a stale user can never flash before a redirect. No other query
 * is cleared: in this contract, `auth.me` is the only cached data that is
 * actually per-user — event and attendee-list responses are identical
 * regardless of who's asking (attendee listing is auth-gated, but its
 * *content* isn't user-specific), so `queryClient.clear()` would only
 * cause pointless refetches of data that was never wrong (§ 33).
 */
export function useLogout() {
  const queryClient = useQueryClient();

  return useCallback(() => {
    clearAuthToken();
    queryClient.removeQueries({ queryKey: authKeys.me() });
  }, [queryClient]);
}
