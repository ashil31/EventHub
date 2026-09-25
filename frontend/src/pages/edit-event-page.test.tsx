import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAuthToken, setAuthToken } from '../lib/api/auth-token';
import { mockFetchByUrl } from '../test/mock-fetch';
import { createTestQueryClient } from '../test/test-utils';
import { EditEventPage } from './edit-event-page';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const OWNER = {
  id: 'owner-1',
  name: 'Ashil Patel',
  email: 'ashil@example.com',
};
const OTHER_USER = {
  id: 'someone-else',
  name: 'Not The Owner',
  email: 'not-owner@example.com',
};

const SAMPLE_EVENT = {
  id: 'e1',
  title: 'Backend Engineering Meetup',
  description: 'A meetup for backend engineers.',
  location: 'Ahmedabad',
  startsAt: '2026-10-10T10:00:00.000Z',
  endsAt: '2026-10-10T13:00:00.000Z',
  capacity: 100,
  attendeeCount: 40,
  availableSpots: 60,
  createdBy: OWNER,
  createdAt: '2026-09-24T12:00:00.000Z',
  updatedAt: '2026-09-24T12:00:00.000Z',
};

function renderPage() {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/events/e1/edit']}>
        <Routes>
          <Route path="/events/:eventId/edit" element={<EditEventPage />} />
          <Route
            path="/events/:eventId"
            element={<div>Event detail page</div>}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  clearAuthToken();
});

describe('EditEventPage', () => {
  it('shows a loading state, then the populated form for the owner', async () => {
    setAuthToken('a-token');
    mockFetchByUrl((url) =>
      url.includes('/auth/me')
        ? { status: 200, body: OWNER }
        : { status: 200, body: SAMPLE_EVENT },
    );

    renderPage();

    expect(screen.getByRole('status')).toBeInTheDocument();

    expect(
      await screen.findByRole('heading', { name: 'Edit event' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue(SAMPLE_EVENT.title);
    expect(screen.getByLabelText('Location')).toHaveValue(
      SAMPLE_EVENT.location,
    );
  });

  it('shows the not-found state for a genuine 404', async () => {
    setAuthToken('a-token');
    mockFetchByUrl((url) =>
      url.includes('/auth/me')
        ? { status: 200, body: OWNER }
        : {
            status: 404,
            body: {
              statusCode: 404,
              code: 'NOT_FOUND',
              message: 'Event not found',
              error: 'Not Found',
              timestamp: '2026-09-25T00:00:00.000Z',
              path: '/api/v1/events/e1',
              requestId: 'req-1',
            },
          },
    );

    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'Event not found' }),
    ).toBeInTheDocument();
  });

  it('shows a forbidden state (not the owner) without ever rendering the form', async () => {
    setAuthToken('a-token');
    mockFetchByUrl((url) =>
      url.includes('/auth/me')
        ? { status: 200, body: OTHER_USER }
        : { status: 200, body: SAMPLE_EVENT },
    );

    renderPage();

    expect(
      await screen.findByRole('heading', {
        name: "You don't have permission to edit this event",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
  });

  it('submits only the changed fields and navigates to the detail page on success', async () => {
    const user = userEvent.setup();
    setAuthToken('a-token');
    const fetchMock = mockFetchByUrl((url, method) => {
      if (url.includes('/auth/me')) return { status: 200, body: OWNER };
      if (method === 'GET') return { status: 200, body: SAMPLE_EVENT };
      // PATCH
      return {
        status: 200,
        body: { ...SAMPLE_EVENT, capacity: 75 },
      };
    });

    renderPage();

    const capacityInput = await screen.findByLabelText('Capacity');
    await user.clear(capacityInput);
    await user.type(capacityInput, '75');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Event updated'),
    );
    expect(await screen.findByText('Event detail page')).toBeInTheDocument();

    const patchCall = fetchMock.mock.calls.find(
      (call): call is [string, { method?: string; body?: string }] =>
        (call[1] as { method?: string } | undefined)?.method === 'PATCH',
    );
    expect(patchCall).toBeDefined();
    const body = JSON.parse(patchCall?.[1].body ?? '{}') as unknown;
    expect(body).toEqual({ capacity: 75 });
  });

  it('shows a 403 from the backend (race — ownership changed after load)', async () => {
    const user = userEvent.setup();
    setAuthToken('a-token');
    mockFetchByUrl((url, method) => {
      if (url.includes('/auth/me')) return { status: 200, body: OWNER };
      if (method === 'GET') return { status: 200, body: SAMPLE_EVENT };
      return {
        status: 403,
        body: {
          statusCode: 403,
          code: 'FORBIDDEN',
          message: 'Only the event creator can perform this action',
          error: 'Forbidden',
          timestamp: '2026-09-25T00:00:00.000Z',
          path: '/api/v1/events/e1',
          requestId: 'req-2',
        },
      };
    });

    renderPage();

    const capacityInput = await screen.findByLabelText('Capacity');
    await user.clear(capacityInput);
    await user.type(capacityInput, '75');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Only the event creator can perform this action',
    );
  });

  it('navigates to the event detail page when Cancel is clicked', async () => {
    const user = userEvent.setup();
    setAuthToken('a-token');
    mockFetchByUrl((url) =>
      url.includes('/auth/me')
        ? { status: 200, body: OWNER }
        : { status: 200, body: SAMPLE_EVENT },
    );

    renderPage();

    await screen.findByLabelText('Title');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(await screen.findByText('Event detail page')).toBeInTheDocument();
  });
});
