import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { eventKeys } from '../../events/queries/keys';
import { mockFetchJson } from '../../../test/mock-fetch';
import { createTestQueryClient } from '../../../test/test-utils';
import { useCancelRsvp, useEventAttendees, useRsvp } from './hooks';
import { attendeeKeys } from './keys';

function wrapperFor(queryClient: ReturnType<typeof createTestQueryClient>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe('useEventAttendees', () => {
  it('fetches the attendee list for the given event', async () => {
    mockFetchJson(200, {
      data: [
        {
          user: { id: 'u1', name: 'Ashil Patel', email: 'ashil@example.com' },
          joinedAt: '2026-09-24T12:00:00.000Z',
        },
      ],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useEventAttendees('e1'), {
      wrapper: wrapperFor(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.data).toHaveLength(1);
  });

  it('does not fetch when eventId is empty', () => {
    const mock = mockFetchJson(200, {});
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useEventAttendees(''), {
      wrapper: wrapperFor(queryClient),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mock).not.toHaveBeenCalled();
  });
});

describe('useRsvp', () => {
  it("invalidates the event detail and this event's attendee lists on success, and nothing else", async () => {
    mockFetchJson(201, {
      message: 'RSVP successful',
      eventId: 'e1',
      userId: 'u1',
      joinedAt: '2026-09-24T12:00:00.000Z',
      attendeeCount: 2,
      capacity: 100,
      availableSpots: 98,
    });
    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useRsvp('e1'), {
      wrapper: wrapperFor(queryClient),
    });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: eventKeys.detail('e1'),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: attendeeKeys.listsForEvent('e1'),
    });
    // Over-invalidation guard (§ 23): the whole event-lists collection
    // must NOT be invalidated by a single RSVP.
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: eventKeys.lists(),
    });
  });
});

describe('useCancelRsvp', () => {
  it("invalidates the event detail and this event's attendee lists on success", async () => {
    mockFetchJson(204, undefined);
    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useCancelRsvp('e1'), {
      wrapper: wrapperFor(queryClient),
    });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: eventKeys.detail('e1'),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: attendeeKeys.listsForEvent('e1'),
    });
  });
});
