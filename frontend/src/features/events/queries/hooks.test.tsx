import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { mockFetchJson } from '../../../test/mock-fetch';
import { createTestQueryClient } from '../../../test/test-utils';
import { useCreateEvent, useDeleteEvent, useEvent, useEvents } from './hooks';
import { eventKeys } from './keys';

const SAMPLE_EVENT = {
  id: 'e1',
  title: 'Backend Engineering Meetup',
  description: null,
  location: 'Ahmedabad',
  startsAt: '2026-10-10T10:00:00.000Z',
  endsAt: '2026-10-10T13:00:00.000Z',
  capacity: 100,
  attendeeCount: 1,
  availableSpots: 99,
  createdBy: { id: 'u1', name: 'Ashil Patel', email: 'ashil@example.com' },
  createdAt: '2026-09-24T12:00:00.000Z',
  updatedAt: '2026-09-24T12:00:00.000Z',
};

function wrapperFor(queryClient: ReturnType<typeof createTestQueryClient>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe('useEvents', () => {
  it('fetches the list and exposes success state', async () => {
    mockFetchJson(200, {
      data: [SAMPLE_EVENT],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useEvents({}), {
      wrapper: wrapperFor(queryClient),
    });

    expect(result.current.isPending).toBe(true);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.data).toHaveLength(1);
  });
});

describe('useEvent', () => {
  it('does not fetch when eventId is empty (§ 27 enabled condition)', () => {
    const mock = mockFetchJson(200, SAMPLE_EVENT);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useEvent(''), {
      wrapper: wrapperFor(queryClient),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mock).not.toHaveBeenCalled();
  });

  it('fetches when a real eventId is given', async () => {
    mockFetchJson(200, SAMPLE_EVENT);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useEvent('e1'), {
      wrapper: wrapperFor(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.id).toBe('e1');
  });
});

describe('useCreateEvent', () => {
  it('seeds the detail cache and invalidates event lists on success', async () => {
    mockFetchJson(201, SAMPLE_EVENT);
    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useCreateEvent(), {
      wrapper: wrapperFor(queryClient),
    });

    result.current.mutate({
      title: 'Backend Engineering Meetup',
      location: 'Ahmedabad',
      startsAt: '2026-10-10T10:00:00.000Z',
      endsAt: '2026-10-10T13:00:00.000Z',
      capacity: 100,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(eventKeys.detail('e1'))).toEqual(
      SAMPLE_EVENT,
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: eventKeys.lists(),
    });
  });
});

describe('useDeleteEvent', () => {
  it('removes the detail and attendee caches and invalidates lists on success', async () => {
    mockFetchJson(204, undefined);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(eventKeys.detail('e1'), SAMPLE_EVENT);
    const removeSpy = vi.spyOn(queryClient, 'removeQueries');
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useDeleteEvent(), {
      wrapper: wrapperFor(queryClient),
    });

    result.current.mutate('e1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(removeSpy).toHaveBeenCalledWith({
      queryKey: eventKeys.detail('e1'),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: eventKeys.lists(),
    });
  });
});
