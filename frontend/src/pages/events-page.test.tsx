import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockFetchJson, mockFetchJsonSequence } from '../test/mock-fetch';
import { renderWithProviders } from '../test/test-utils';
import { EventsPage } from './events-page';

const SAMPLE_EVENT = {
  id: 'e1',
  title: 'Backend Engineering Meetup',
  description: 'A meetup for backend engineers.',
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

const SAMPLE_EVENT_2 = { ...SAMPLE_EVENT, id: 'e2', title: 'Frontend Summit' };

const ERROR_BODY = {
  statusCode: 500,
  code: 'INTERNAL_ERROR',
  message: 'Something broke',
  error: 'Internal Server Error',
  timestamp: '2026-09-25T00:00:00.000Z',
  path: '/api/v1/events',
  requestId: 'req-1',
};

describe('EventsPage', () => {
  it('shows a loading skeleton, then renders events', async () => {
    mockFetchJson(200, {
      data: [SAMPLE_EVENT],
      meta: { page: 1, limit: 12, total: 1, totalPages: 1 },
    });

    renderWithProviders(<EventsPage />, { initialEntries: ['/events'] });

    expect(
      screen.getByRole('status', { name: 'Loading events' }),
    ).toBeInTheDocument();

    expect(
      await screen.findByRole('heading', { name: SAMPLE_EVENT.title }),
    ).toBeInTheDocument();
  });

  it('requests events using the URL-derived filters', async () => {
    const fetchMock = mockFetchJson(200, {
      data: [],
      meta: { page: 2, limit: 12, total: 0, totalPages: 1 },
    });

    renderWithProviders(<EventsPage />, {
      initialEntries: ['/events?search=react&page=2&timeframe=all'],
    });

    await screen.findByText(
      (_, element) =>
        element?.tagName === 'H2' &&
        element.textContent === 'No events found for "react"',
    );

    const requestedUrl = fetchMock.mock.calls[0]?.[0] as string;
    expect(requestedUrl).toContain('/events?');
    expect(requestedUrl).toContain('page=2');
    expect(requestedUrl).toContain('limit=12');
    expect(requestedUrl).toContain('search=react');
    expect(requestedUrl).toContain('from=1970-01-01');
  });

  it('shows an error state and recovers via retry', async () => {
    mockFetchJsonSequence([
      { status: 500, body: ERROR_BODY },
      {
        status: 200,
        body: {
          data: [SAMPLE_EVENT],
          meta: { page: 1, limit: 12, total: 1, totalPages: 1 },
        },
      },
    ]);

    renderWithProviders(<EventsPage />, { initialEntries: ['/events'] });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't load events",
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(
      await screen.findByRole('heading', { name: SAMPLE_EVENT.title }),
    ).toBeInTheDocument();
  });

  it('shows the empty state when the API returns zero events', async () => {
    mockFetchJson(200, {
      data: [],
      meta: { page: 1, limit: 12, total: 0, totalPages: 0 },
    });

    renderWithProviders(<EventsPage />, { initialEntries: ['/events'] });

    expect(await screen.findByText('No events found')).toBeInTheDocument();
  });

  it('requests the next page and updates the pagination display', async () => {
    const fetchMock = mockFetchJsonSequence([
      {
        status: 200,
        body: {
          data: [SAMPLE_EVENT],
          meta: { page: 1, limit: 12, total: 24, totalPages: 2 },
        },
      },
      {
        status: 200,
        body: {
          data: [SAMPLE_EVENT_2],
          meta: { page: 2, limit: 12, total: 24, totalPages: 2 },
        },
      },
    ]);

    renderWithProviders(<EventsPage />, { initialEntries: ['/events'] });

    await screen.findByText('Page 1 of 2');

    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Go to next page'));

    await screen.findByText('Page 2 of 2');
    expect(
      screen.getByRole('heading', { name: SAMPLE_EVENT_2.title }),
    ).toBeInTheDocument();

    const secondRequestUrl = fetchMock.mock.calls[1]?.[0] as string;
    expect(secondRequestUrl).toContain('page=2');
  });
});
