import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  getAuthToken,
  clearAuthToken,
  setAuthToken,
} from '../../../lib/api/auth-token';
import { createTestQueryClient } from '../../../test/test-utils';
import { mockFetchJson } from '../../../test/mock-fetch';
import {
  useAuth,
  useCurrentUser,
  useLogin,
  useLogout,
  useRegister,
} from './hooks';
import { authKeys } from './keys';

beforeEach(() => {
  clearAuthToken();
});

function wrapperFor(queryClient: ReturnType<typeof createTestQueryClient>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe('useCurrentUser', () => {
  it('does not fire GET /auth/me when there is no stored token', () => {
    const mock = mockFetchJson(200, {});
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useCurrentUser(), {
      wrapper: wrapperFor(queryClient),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mock).not.toHaveBeenCalled();
  });

  it('fires GET /auth/me and resolves the user when a token is already stored', async () => {
    setAuthToken('existing-token');
    mockFetchJson(200, {
      id: 'u1',
      name: 'Ashil Patel',
      email: 'ashil@example.com',
    });
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useCurrentUser(), {
      wrapper: wrapperFor(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.email).toBe('ashil@example.com');
  });
});

describe('useLogin', () => {
  it('stores the access token and seeds the auth.me cache on success', async () => {
    mockFetchJson(200, {
      accessToken: 'fresh-token',
      tokenType: 'Bearer',
      expiresIn: '15m',
      user: {
        id: 'u1',
        name: 'Ashil Patel',
        email: 'ashil@example.com',
        createdAt: '2026-09-25T00:00:00.000Z',
      },
    });
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useLogin(), {
      wrapper: wrapperFor(queryClient),
    });

    result.current.mutate({
      email: 'ashil@example.com',
      password: 'a-reasonably-long-password',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getAuthToken()).toBe('fresh-token');
    // The cached user must be the UserSummary subset — no createdAt —
    // matching what GET /auth/me itself actually returns.
    expect(queryClient.getQueryData(authKeys.me())).toEqual({
      id: 'u1',
      name: 'Ashil Patel',
      email: 'ashil@example.com',
    });
  });
});

describe('useRegister', () => {
  it('does not store a token or touch the auth.me cache (register does not log in)', async () => {
    mockFetchJson(201, {
      id: 'u1',
      name: 'Ashil Patel',
      email: 'ashil@example.com',
      createdAt: '2026-09-25T00:00:00.000Z',
    });
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useRegister(), {
      wrapper: wrapperFor(queryClient),
    });

    result.current.mutate({
      name: 'Ashil Patel',
      email: 'ashil@example.com',
      password: 'a-reasonably-long-password',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getAuthToken()).toBeNull();
    expect(queryClient.getQueryData(authKeys.me())).toBeUndefined();
  });
});

describe('useLogout', () => {
  it('clears the token and removes the cached current user', () => {
    setAuthToken('some-token');
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(authKeys.me(), {
      id: 'u1',
      name: 'Ashil Patel',
      email: 'ashil@example.com',
    });

    const { result } = renderHook(() => useLogout(), {
      wrapper: wrapperFor(queryClient),
    });

    result.current();

    expect(getAuthToken()).toBeNull();
    expect(queryClient.getQueryData(authKeys.me())).toBeUndefined();
  });

  // Regression test for a real bug found while manually verifying this
  // flow (Phase 3 § 49): `queryClient.removeQueries()` alone deletes a
  // query from the cache's lookup map, but a component that already has
  // an active, mounted observer on that query (e.g. `RootLayout`'s
  // `useAuth()`, on screen for the whole session) holds a direct
  // reference to the old `Query` object and is never told anything
  // changed — the header kept showing the signed-in user indefinitely.
  it('updates an already-mounted useCurrentUser observer immediately, not just the cache', async () => {
    setAuthToken('some-token');
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(authKeys.me(), {
      id: 'u1',
      name: 'Ashil Patel',
      email: 'ashil@example.com',
    });

    const { result: authMeObserver } = renderHook(() => useCurrentUser(), {
      wrapper: wrapperFor(queryClient),
    });
    expect(authMeObserver.current.isSuccess).toBe(true);

    const { result: logout } = renderHook(() => useLogout(), {
      wrapper: wrapperFor(queryClient),
    });
    logout.current();

    await waitFor(() => expect(authMeObserver.current.isSuccess).toBe(false));
  });
});

describe('useAuth', () => {
  it('reports unauthenticated, not loading, when there is no token', () => {
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapperFor(queryClient),
    });

    expect(result.current).toEqual({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      isError: false,
    });
  });

  it('reports isLoading while a token exists but GET /auth/me has not resolved yet', () => {
    setAuthToken('some-token');
    mockFetchJson(200, {
      id: 'u1',
      name: 'Ashil Patel',
      email: 'ashil@example.com',
    });
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapperFor(queryClient),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('reports authenticated once GET /auth/me resolves', async () => {
    setAuthToken('some-token');
    mockFetchJson(200, {
      id: 'u1',
      name: 'Ashil Patel',
      email: 'ashil@example.com',
    });
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapperFor(queryClient),
    });

    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.user?.name).toBe('Ashil Patel');
  });
});
