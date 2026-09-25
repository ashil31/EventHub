import { describe, expect, it } from 'vitest';
import { mockFetchJson } from '../../../test/mock-fetch';
import { rsvpApi } from './rsvp-api';

describe('rsvpApi', () => {
  it('rsvp posts to /events/:id/rsvp with no request body (no userId sent)', async () => {
    const mock = mockFetchJson(201, {
      message: 'RSVP successful',
      eventId: 'e1',
      userId: 'u1',
      joinedAt: '2026-09-24T12:00:00.000Z',
      attendeeCount: 74,
      capacity: 100,
      availableSpots: 26,
    });

    const result = await rsvpApi.rsvp('e1');

    expect(result.attendeeCount).toBe(74);
    const [url, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3000/api/v1/events/e1/rsvp');
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
  });

  it('cancelRsvp calls DELETE /events/:id/rsvp and resolves with no value', async () => {
    const mock = mockFetchJson(204, undefined);

    const result = await rsvpApi.cancelRsvp('e1');

    expect(result).toBeUndefined();
    const [url, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3000/api/v1/events/e1/rsvp');
    expect(init.method).toBe('DELETE');
  });

  it('getEventAttendees calls GET /events/:id/attendees with pagination in the query string', async () => {
    const mock = mockFetchJson(200, {
      data: [
        {
          user: { id: 'u1', name: 'Ashil Patel', email: 'ashil@example.com' },
          joinedAt: '2026-09-24T12:00:00.000Z',
        },
      ],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });

    const result = await rsvpApi.getEventAttendees('e1', {
      page: 1,
      limit: 20,
    });

    expect(result.data).toHaveLength(1);
    const [url] = mock.mock.calls[0] as [string];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/api/v1/events/e1/attendees');
    expect(parsed.searchParams.get('page')).toBe('1');
    expect(parsed.searchParams.get('limit')).toBe('20');
  });
});
