import { describe, expect, it } from 'vitest';
import {
  parseEventSearchParams,
  serializeEventSearchParams,
  toEventListFilters,
  EVENTS_PAGE_SIZE,
} from './event-search-params';

describe('parseEventSearchParams', () => {
  it('returns defaults for an empty query string', () => {
    expect(parseEventSearchParams(new URLSearchParams(''))).toEqual({
      search: '',
      page: 1,
      timeframe: 'upcoming',
    });
  });

  it('parses a valid search term', () => {
    const result = parseEventSearchParams(new URLSearchParams('search=react'));
    expect(result.search).toBe('react');
  });

  it('trims whitespace from the search term', () => {
    const result = parseEventSearchParams(
      new URLSearchParams('search=%20react%20'),
    );
    expect(result.search).toBe('react');
  });

  it('parses a valid page number', () => {
    expect(parseEventSearchParams(new URLSearchParams('page=3')).page).toBe(3);
  });

  it('falls back to page 1 for a non-numeric page', () => {
    expect(parseEventSearchParams(new URLSearchParams('page=abc')).page).toBe(
      1,
    );
  });

  it('falls back to page 1 for a negative page', () => {
    expect(parseEventSearchParams(new URLSearchParams('page=-10')).page).toBe(
      1,
    );
  });

  it('falls back to page 1 for page=0', () => {
    expect(parseEventSearchParams(new URLSearchParams('page=0')).page).toBe(1);
  });

  it('falls back to page 1 for a non-integer page', () => {
    expect(parseEventSearchParams(new URLSearchParams('page=1.5')).page).toBe(
      1,
    );
  });

  it('parses timeframe=all', () => {
    expect(
      parseEventSearchParams(new URLSearchParams('timeframe=all')).timeframe,
    ).toBe('all');
  });

  it('falls back to "upcoming" for an unrecognized timeframe', () => {
    expect(
      parseEventSearchParams(new URLSearchParams('timeframe=someday'))
        .timeframe,
    ).toBe('upcoming');
  });
});

describe('serializeEventSearchParams', () => {
  it('produces an empty query string for default filters', () => {
    const params = serializeEventSearchParams({
      search: '',
      page: 1,
      timeframe: 'upcoming',
    });
    expect(params.toString()).toBe('');
  });

  it('includes only the fields that differ from defaults', () => {
    const params = serializeEventSearchParams({
      search: 'conference',
      page: 2,
      timeframe: 'all',
    });
    expect(params.get('search')).toBe('conference');
    expect(params.get('page')).toBe('2');
    expect(params.get('timeframe')).toBe('all');
  });

  it('round-trips through parse', () => {
    const original = { search: 'meetup', page: 4, timeframe: 'all' as const };
    const roundTripped = parseEventSearchParams(
      serializeEventSearchParams(original),
    );
    expect(roundTripped).toEqual(original);
  });
});

describe('toEventListFilters', () => {
  it('maps page and the fixed page size', () => {
    const filters = toEventListFilters({
      search: '',
      page: 3,
      timeframe: 'upcoming',
    });
    expect(filters.page).toBe(3);
    expect(filters.limit).toBe(EVENTS_PAGE_SIZE);
  });

  it('omits search when empty', () => {
    const filters = toEventListFilters({
      search: '',
      page: 1,
      timeframe: 'upcoming',
    });
    expect(filters.search).toBeUndefined();
  });

  it('passes through a non-empty search term', () => {
    const filters = toEventListFilters({
      search: 'react',
      page: 1,
      timeframe: 'upcoming',
    });
    expect(filters.search).toBe('react');
  });

  it('leaves "from" unset for the upcoming timeframe', () => {
    const filters = toEventListFilters({
      search: '',
      page: 1,
      timeframe: 'upcoming',
    });
    expect(filters.from).toBeUndefined();
  });

  it('sets a far-past "from" for the all-events timeframe', () => {
    const filters = toEventListFilters({
      search: '',
      page: 1,
      timeframe: 'all',
    });
    expect(filters.from).toBe('1970-01-01T00:00:00.000Z');
  });
});
