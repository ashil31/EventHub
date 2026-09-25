import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearAuthToken, setAuthToken } from '../../../lib/api/auth-token';
import { mockFetchByUrl } from '../../../test/mock-fetch';
import { createTestQueryClient } from '../../../test/test-utils';
import { useEventRsvpState } from './use-event-rsvp-state';

function wrapperFor(queryClient: ReturnType<typeof createTestQueryClient>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

const ME_BODY = { id: 'u1', name: 'Ashil Patel', email: 'ashil@example.com' };

beforeEach(() => {
  clearAuthToken();
});

describe('useEventRsvpState', () => {
  it('is "signed-out" immediately when there is no auth token', () => {
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useEventRsvpState('e1'), {
      wrapper: wrapperFor(queryClient),
    });

    expect(result.current).toEqual({ status: 'signed-out' });
  });

  it('is "checking" while the current-user query is still pending', () => {
    setAuthToken('a-token');
    mockFetchByUrl((url) =>
      url.includes('/auth/me')
        ? 'pending'
        : { status: 200, body: { attending: false, joinedAt: null } },
    );
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useEventRsvpState('e1'), {
      wrapper: wrapperFor(queryClient),
    });

    expect(result.current).toEqual({ status: 'checking' });
  });

  it('is "not-attending" once signed in and the status query resolves false', async () => {
    setAuthToken('a-token');
    mockFetchByUrl((url) =>
      url.includes('/auth/me')
        ? { status: 200, body: ME_BODY }
        : { status: 200, body: { attending: false, joinedAt: null } },
    );
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useEventRsvpState('e1'), {
      wrapper: wrapperFor(queryClient),
    });

    await waitFor(() =>
      expect(result.current).toEqual({ status: 'not-attending' }),
    );
  });

  it('is "attending" once signed in and the status query resolves true', async () => {
    setAuthToken('a-token');
    mockFetchByUrl((url) =>
      url.includes('/auth/me')
        ? { status: 200, body: ME_BODY }
        : {
            status: 200,
            body: { attending: true, joinedAt: '2026-09-24T12:00:00.000Z' },
          },
    );
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useEventRsvpState('e1'), {
      wrapper: wrapperFor(queryClient),
    });

    await waitFor(() =>
      expect(result.current).toEqual({ status: 'attending' }),
    );
  });

  it('is "unavailable" with a working retry when the status query fails', async () => {
    setAuthToken('a-token');
    mockFetchByUrl((url) =>
      url.includes('/auth/me')
        ? { status: 200, body: ME_BODY }
        : {
            status: 500,
            body: {
              statusCode: 500,
              code: 'INTERNAL_ERROR',
              message: 'boom',
              error: 'Internal Server Error',
              timestamp: '2026-09-25T00:00:00.000Z',
              path: '/api/v1/events/e1/rsvp',
              requestId: 'req-1',
            },
          },
    );
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useEventRsvpState('e1'), {
      wrapper: wrapperFor(queryClient),
    });

    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(
      result.current.status === 'unavailable' &&
        typeof result.current.retry === 'function',
    ).toBe(true);
  });
});
