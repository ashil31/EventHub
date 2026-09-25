import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearAuthToken, setAuthToken } from '../lib/api/auth-token';
import {
  mockFetchByUrl,
  mockFetchJson,
  mockFetchJsonSequence,
} from '../test/mock-fetch';
import { createTestQueryClient } from '../test/test-utils';
import { EventDetailPage } from './event-detail-page';

const SAMPLE_EVENT = {
  id: 'e1',
  title: 'Backend Engineering Meetup',
  description: 'A meetup for backend engineers.\n\nBring a laptop.',
  location: 'Ahmedabad',
  startsAt: '2026-10-10T10:00:00.000Z',
  endsAt: '2026-10-10T13:00:00.000Z',
  capacity: 100,
  attendeeCount: 40,
  availableSpots: 60,
  createdBy: { id: 'u1', name: 'Ashil Patel', email: 'ashil@example.com' },
  createdAt: '2026-09-24T12:00:00.000Z',
  updatedAt: '2026-09-24T12:00:00.000Z',
};

const NOT_FOUND_BODY = {
  statusCode: 404,
  code: 'NOT_FOUND',
  message: 'Event not found',
  error: 'Not Found',
  timestamp: '2026-09-25T00:00:00.000Z',
  path: '/api/v1/events/e1',
  requestId: 'req-1',
};

const MALFORMED_ID_BODY = {
  statusCode: 400,
  code: 'BAD_REQUEST',
  message: 'Validation failed (uuid is expected)',
  error: 'Bad Request',
  timestamp: '2026-09-25T00:00:00.000Z',
  path: '/api/v1/events/123',
  requestId: 'req-2',
};

const SERVER_ERROR_BODY = {
  statusCode: 500,
  code: 'INTERNAL_ERROR',
  message: 'Something broke',
  error: 'Internal Server Error',
  timestamp: '2026-09-25T00:00:00.000Z',
  path: '/api/v1/events/e1',
  requestId: 'req-3',
};

// EventDetailPage reads its id via useParams, which only works inside a
// matched Route — a bare MemoryRouter (no Routes tree) never populates
// params, so this wraps in the same route shape the real router uses.
function renderDetailPage(initialPath: string) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/events/:eventId" element={<EventDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const ME_BODY = { id: 'u1', name: 'Ashil Patel', email: 'ashil@example.com' };

beforeEach(() => {
  clearAuthToken();
});

describe('EventDetailPage', () => {
  it('shows a loading skeleton, then renders the event', async () => {
    mockFetchJson(200, SAMPLE_EVENT);
    renderDetailPage('/events/e1');

    expect(
      screen.getByRole('status', { name: 'Loading event' }),
    ).toBeInTheDocument();

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: SAMPLE_EVENT.title,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Ahmedabad')).toBeInTheDocument();
    expect(screen.getByText('40 / 100 attending')).toBeInTheDocument();
    expect(screen.getByText('Ashil Patel')).toBeInTheDocument();
    expect(
      screen.getByText(/A meetup for backend engineers\./),
    ).toBeInTheDocument();
  });

  it('requests the event using the route parameter', async () => {
    const fetchMock = mockFetchJson(200, SAMPLE_EVENT);
    renderDetailPage('/events/e1');

    await screen.findByRole('heading', { level: 1, name: SAMPLE_EVENT.title });

    const requestedUrl = fetchMock.mock.calls[0]?.[0] as string;
    expect(requestedUrl).toContain('/events/e1');
  });

  it('shows the not-found state for a genuine 404', async () => {
    mockFetchJson(404, NOT_FOUND_BODY);
    renderDetailPage('/events/e1');

    expect(
      await screen.findByRole('heading', { name: 'Event not found' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse events' })).toHaveAttribute(
      'href',
      '/events',
    );
  });

  it('shows the not-found state for a malformed id (400)', async () => {
    mockFetchJson(400, MALFORMED_ID_BODY);
    renderDetailPage('/events/not-a-uuid');

    expect(
      await screen.findByRole('heading', { name: 'Event not found' }),
    ).toBeInTheDocument();
  });

  it('shows the error state and recovers via retry for a 500', async () => {
    mockFetchJsonSequence([
      { status: 500, body: SERVER_ERROR_BODY },
      { status: 200, body: SAMPLE_EVENT },
    ]);
    renderDetailPage('/events/e1');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to load this event',
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: SAMPLE_EVENT.title,
      }),
    ).toBeInTheDocument();
  });

  it('always renders a link back to the events list', () => {
    mockFetchJson(200, SAMPLE_EVENT);
    renderDetailPage('/events/e1');

    expect(
      screen.getByRole('link', { name: /Back to events/ }),
    ).toHaveAttribute('href', '/events');
  });

  it('shows the RSVP panel signed out by default', async () => {
    mockFetchJson(200, SAMPLE_EVENT);
    renderDetailPage('/events/e1');

    expect(
      await screen.findByText('Sign in to RSVP for this event.'),
    ).toBeInTheDocument();
  });

  it('shows the RSVP panel with a Join Event action when signed in', async () => {
    mockFetchByUrl((url) => {
      if (url.includes('/auth/me')) return { status: 200, body: ME_BODY };
      if (url.endsWith('/rsvp')) {
        return { status: 200, body: { attending: false, joinedAt: null } };
      }
      return { status: 200, body: SAMPLE_EVENT };
    });
    setAuthToken('a-token');

    renderDetailPage('/events/e1');

    await screen.findByRole('heading', { level: 1, name: SAMPLE_EVENT.title });
    expect(
      await screen.findByRole('button', { name: 'Join Event' }),
    ).toBeInTheDocument();
  });
});
