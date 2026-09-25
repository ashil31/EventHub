import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { useEventFilters } from './use-event-filters';

function wrapperFor(initialEntries: string[]) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
    );
  };
}

describe('useEventFilters', () => {
  it('exposes default filters for a bare /events URL', () => {
    const { result } = renderHook(() => useEventFilters(), {
      wrapper: wrapperFor(['/events']),
    });
    expect(result.current.filters).toEqual({
      search: '',
      page: 1,
      timeframe: 'upcoming',
    });
  });

  it('parses filters already present in the URL', () => {
    const { result } = renderHook(() => useEventFilters(), {
      wrapper: wrapperFor(['/events?search=react&page=2&timeframe=all']),
    });
    expect(result.current.filters).toEqual({
      search: 'react',
      page: 2,
      timeframe: 'all',
    });
  });

  it('setSearch resets the page to 1', () => {
    const { result } = renderHook(() => useEventFilters(), {
      wrapper: wrapperFor(['/events?page=4']),
    });

    act(() => result.current.setSearch('conference'));

    expect(result.current.filters).toEqual({
      search: 'conference',
      page: 1,
      timeframe: 'upcoming',
    });
  });

  it('setPage preserves the current search and timeframe', () => {
    const { result } = renderHook(() => useEventFilters(), {
      wrapper: wrapperFor(['/events?search=meetup&timeframe=all']),
    });

    act(() => result.current.setPage(3));

    expect(result.current.filters).toEqual({
      search: 'meetup',
      page: 3,
      timeframe: 'all',
    });
  });

  it('setTimeframe resets the page to 1', () => {
    const { result } = renderHook(() => useEventFilters(), {
      wrapper: wrapperFor(['/events?page=5']),
    });

    act(() => result.current.setTimeframe('all'));

    expect(result.current.filters).toEqual({
      search: '',
      page: 1,
      timeframe: 'all',
    });
  });
});
