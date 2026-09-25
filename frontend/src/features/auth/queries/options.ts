import { queryOptions } from '@tanstack/react-query';
import { authApi } from '../api/auth-api';
import { authKeys } from './keys';

/**
 * The current-user query, defined once via TanStack Query v5's
 * `queryOptions()` helper so the exact same options object works in
 * `useQuery`, `queryClient.setQueryData`'s type inference, and any future
 * prefetch call — never duplicated inline in a component.
 *
 * `staleTime: 5 minutes` — § 26: "current user, longer stale time is
 * reasonable." Identity doesn't change mid-session from anything other
 * than this app's own login/logout actions, both of which update this
 * query's cache directly (§ 31/§ 32) rather than waiting for it to go
 * stale and refetch.
 */
export const authQueries = {
  me: () =>
    queryOptions({
      queryKey: authKeys.me(),
      queryFn: authApi.getCurrentUser,
      staleTime: 5 * 60 * 1000,
    }),
};
