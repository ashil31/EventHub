import { describe, expect, it } from 'vitest';
import { mockFetchJson } from '../../../test/mock-fetch';
import { eventsApi } from './events-api';

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

describe('eventsApi', () => {
  it('listEvents calls GET /events with no query string when filters are empty', async () => {
    const mock = mockFetchJson(200, {
      data: [SAMPLE_EVENT],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });

    const result = await eventsApi.listEvents({});

    expect(result.data).toHaveLength(1);
    const [url] = mock.mock.calls[0] as [string];
    expect(url).toBe('http://localhost:3000/api/v1/events');
  });

  it('listEvents serializes filters into the query string', async () => {
    const mock = mockFetchJson(200, {
      data: [],
      meta: { page: 2, limit: 10, total: 0, totalPages: 0 },
    });

    await eventsApi.listEvents({ page: 2, limit: 10, search: 'backend' });

    const [url] = mock.mock.calls[0] as [string];
    const parsed = new URL(url);
    expect(parsed.searchParams.get('page')).toBe('2');
    expect(parsed.searchParams.get('limit')).toBe('10');
    expect(parsed.searchParams.get('search')).toBe('backend');
  });

  it('getEvent calls GET /events/:id', async () => {
    const mock = mockFetchJson(200, SAMPLE_EVENT);

    const event = await eventsApi.getEvent('e1');

    expect(event.id).toBe('e1');
    const [url] = mock.mock.calls[0] as [string];
    expect(url).toBe('http://localhost:3000/api/v1/events/e1');
  });

  it('createEvent posts to /events with the input body', async () => {
    const mock = mockFetchJson(201, SAMPLE_EVENT);

    await eventsApi.createEvent({
      title: 'Backend Engineering Meetup',
      location: 'Ahmedabad',
      startsAt: '2026-10-10T10:00:00.000Z',
      endsAt: '2026-10-10T13:00:00.000Z',
      capacity: 100,
    });

    const [url, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3000/api/v1/events');
    expect(init.method).toBe('POST');
  });

  it('updateEvent patches /events/:id with a partial body', async () => {
    const mock = mockFetchJson(200, { ...SAMPLE_EVENT, capacity: 200 });

    await eventsApi.updateEvent('e1', { capacity: 200 });

    const [url, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3000/api/v1/events/e1');
    expect(init.method).toBe('PATCH');
    expect(init.body).toBe(JSON.stringify({ capacity: 200 }));
  });

  it('deleteEvent calls DELETE /events/:id and resolves with no value', async () => {
    const mock = mockFetchJson(204, undefined);

    const result = await eventsApi.deleteEvent('e1');

    expect(result).toBeUndefined();
    const [url, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3000/api/v1/events/e1');
    expect(init.method).toBe('DELETE');
  });
});
