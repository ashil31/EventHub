import {
  QueryClientProvider,
  useMutation,
  useQuery,
} from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '../../../lib/api/api-error';
import { getAuthToken, setAuthToken } from '../../../lib/api/auth-token';
import { mockFetchJson } from '../../../test/mock-fetch';
import { createTestQueryClient } from '../../../test/test-utils';
import { useCurrentUser } from '../queries/hooks';
import { authKeys } from '../queries/keys';
import { installAuthErrorHandling } from './install-auth-error-handling';

function wrapperFor(queryClient: ReturnType<typeof createTestQueryClient>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

beforeEach(() => {
  setAuthToken('a-valid-looking-token');
});

describe('installAuthErrorHandling', () => {
  it('clears the token and updates an already-mounted auth.me observer when an UNRELATED query 401s', async () => {
    const queryClient = createTestQueryClient();
    installAuthErrorHandling(queryClient);
    queryClient.setQueryData(authKeys.me(), {
      id: 'u1',
      name: 'Ashil Patel',
      email: 'ashil@example.com',
    });

    // Simulates RootLayout: the real `useCurrentUser()` hook (with its
    // real 5-minute staleTime, so this cached data is fresh and won't
    // silently refetch itself on mount — that would defeat the point of
    // this test), already showing a signed-in user, mounted BEFORE the
    // 401 happens.
    const fetchSpy = mockFetchJson(200, {
      id: 'u1',
      name: 'Ashil Patel',
      email: 'ashil@example.com',
    });
    const { result: authMeObserver } = renderHook(() => useCurrentUser(), {
      wrapper: wrapperFor(queryClient),
    });
    expect(authMeObserver.current.isSuccess).toBe(true);

    // A completely different query 401s — e.g. a future protected
    // events request made with a since-expired token.
    const { result: unrelatedQuery } = renderHook(
      () =>
        useQuery({
          queryKey: ['some-other-protected-query'],
          queryFn: () =>
            Promise.reject(
              new ApiError('Missing or invalid access token', {
                status: 401,
                code: 'UNAUTHORIZED',
              }),
            ),
          retry: false,
        }),
      { wrapper: wrapperFor(queryClient) },
    );

    await waitFor(() => expect(unrelatedQuery.current.isError).toBe(true));

    // The real bug this regression-tests: without the fix, the
    // already-mounted auth.me observer above kept reporting the stale
    // signed-in user indefinitely.
    await waitFor(() => expect(authMeObserver.current.isSuccess).toBe(false));
    expect(getAuthToken()).toBeNull();
    // And the fresh cached data's own 5-minute staleTime meant it never
    // needed to hit the network in the first place.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('clears the token when a MUTATION 401s', async () => {
    const queryClient = createTestQueryClient();
    installAuthErrorHandling(queryClient);

    const { result } = renderHook(
      () =>
        useMutation({
          mutationFn: () =>
            Promise.reject(
              new ApiError('Missing or invalid access token', {
                status: 401,
                code: 'UNAUTHORIZED',
              }),
            ),
        }),
      { wrapper: wrapperFor(queryClient) },
    );

    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(getAuthToken()).toBeNull();
  });

  it('does NOT clear the token for a non-401 error (e.g. 404)', async () => {
    const queryClient = createTestQueryClient();
    installAuthErrorHandling(queryClient);

    const { result } = renderHook(
      () =>
        useQuery({
          queryKey: ['some-query'],
          queryFn: () =>
            Promise.reject(
              new ApiError('Not found', { status: 404, code: 'NOT_FOUND' }),
            ),
          retry: false,
        }),
      { wrapper: wrapperFor(queryClient) },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(getAuthToken()).toBe('a-valid-looking-token');
  });
});
