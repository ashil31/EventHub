import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAuthToken, setAuthToken } from '../../../lib/api/auth-token';
import { mockFetchByUrl } from '../../../test/mock-fetch';
import { createTestQueryClient } from '../../../test/test-utils';
import { EventRsvpPanel } from './event-rsvp-panel';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const ME_BODY = { id: 'u1', name: 'Ashil Patel', email: 'ashil@example.com' };

const RSVP_RESULT = {
  message: 'RSVP successful',
  eventId: 'e1',
  userId: 'u1',
  joinedAt: '2026-09-24T12:00:00.000Z',
  attendeeCount: 1,
  capacity: 10,
  availableSpots: 9,
};

function serverError(status: number, message: string) {
  return {
    statusCode: status,
    code: status === 409 ? 'CONFLICT' : status === 404 ? 'NOT_FOUND' : 'ERROR',
    message,
    error: 'Error',
    timestamp: '2026-09-25T00:00:00.000Z',
    path: '/api/v1/events/e1/rsvp',
    requestId: 'req-1',
  };
}

function LoginStateProbe() {
  const location = useLocation();
  const state = location.state as { from?: { pathname?: string } } | null;
  return <div>Login page — from: {state?.from?.pathname ?? 'none'}</div>;
}

function renderPanel(eventId = 'e1') {
  const queryClient = createTestQueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/events/${eventId}`]}>
        <Routes>
          <Route
            path="/events/:eventId"
            element={<EventRsvpPanel eventId={eventId} />}
          />
          <Route path="/login" element={<LoginStateProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return queryClient;
}

beforeEach(() => {
  clearAuthToken();
  vi.clearAllMocks();
});

describe('EventRsvpPanel — signed out', () => {
  it('shows a sign-in prompt and preserves the event as the return destination', async () => {
    const user = userEvent.setup();
    renderPanel();

    expect(
      screen.getByText('Sign in to RSVP for this event.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Sign in to RSVP' }));

    expect(
      await screen.findByText('Login page — from: /events/e1'),
    ).toBeInTheDocument();
  });
});

describe('EventRsvpPanel — checking', () => {
  it('shows a loading status while auth is still resolving, no actions yet', () => {
    mockFetchByUrl((url) =>
      url.includes('/auth/me')
        ? 'pending'
        : { status: 200, body: { attending: false, joinedAt: null } },
    );
    setAuthToken('a-token');

    renderPanel();

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('EventRsvpPanel — not attending', () => {
  it('shows a Join Event action', async () => {
    mockFetchByUrl((url) =>
      url.includes('/auth/me')
        ? { status: 200, body: ME_BODY }
        : { status: 200, body: { attending: false, joinedAt: null } },
    );
    setAuthToken('a-token');

    renderPanel();

    expect(
      await screen.findByRole('button', { name: 'Join Event' }),
    ).toBeInTheDocument();
  });

  it('flips to the attending state and toasts success after a successful join', async () => {
    const user = userEvent.setup();
    let attending = false;
    mockFetchByUrl((url, method) => {
      if (url.includes('/auth/me')) return { status: 200, body: ME_BODY };
      if (url.endsWith('/rsvp') && method === 'GET') {
        return {
          status: 200,
          body: {
            attending,
            joinedAt: attending ? RSVP_RESULT.joinedAt : null,
          },
        };
      }
      if (url.endsWith('/rsvp') && method === 'POST') {
        attending = true;
        return { status: 201, body: RSVP_RESULT };
      }
      return { status: 404, body: serverError(404, 'Event not found') };
    });
    setAuthToken('a-token');

    renderPanel();

    await user.click(await screen.findByRole('button', { name: 'Join Event' }));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "You're attending this event.",
      ),
    );
    expect(
      await screen.findByRole('button', { name: 'Cancel RSVP' }),
    ).toBeInTheDocument();
  });

  it('disables the button while joining and sends exactly one request', async () => {
    const user = userEvent.setup();
    let resolvePost!: (value: unknown) => void;
    const fetchMock = vi.fn(
      (url: string, options?: { method?: string }): Promise<unknown> => {
        const method = options?.method ?? 'GET';
        if (url.includes('/auth/me')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: () => Promise.resolve(ME_BODY),
          });
        }
        if (url.endsWith('/rsvp') && method === 'GET') {
          return Promise.resolve({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: () => Promise.resolve({ attending: false, joinedAt: null }),
          });
        }
        return new Promise((resolve) => {
          resolvePost = resolve;
        });
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    setAuthToken('a-token');

    renderPanel();

    await user.click(await screen.findByRole('button', { name: 'Join Event' }));

    const pendingButton = await screen.findByRole('button', {
      name: 'Joining…',
    });
    expect(pendingButton).toBeDisabled();

    const postCalls = fetchMock.mock.calls.filter(
      ([, options]) => options?.method === 'POST',
    );
    expect(postCalls).toHaveLength(1);

    resolvePost({
      ok: true,
      status: 201,
      statusText: 'Created',
      json: () => Promise.resolve(RSVP_RESULT),
    });
  });

  it('shows a capacity-full error from the server and resyncs', async () => {
    const user = userEvent.setup();
    let statusCalls = 0;
    mockFetchByUrl((url, method) => {
      if (url.includes('/auth/me')) return { status: 200, body: ME_BODY };
      if (url.endsWith('/rsvp') && method === 'GET') {
        statusCalls += 1;
        return { status: 200, body: { attending: false, joinedAt: null } };
      }
      if (url.endsWith('/rsvp') && method === 'POST') {
        return { status: 409, body: serverError(409, 'Event is full.') };
      }
      return { status: 404, body: {} };
    });
    setAuthToken('a-token');

    renderPanel();

    await user.click(await screen.findByRole('button', { name: 'Join Event' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Couldn't RSVP",
        expect.objectContaining({ description: 'Event is full.' }),
      ),
    );
    // The status query is invalidated and refetched to resync with the
    // server-confirmed reality (§17/§22) — more than the one initial call.
    await waitFor(() => expect(statusCalls).toBeGreaterThan(1));
  });

  it('shows a duplicate-RSVP error from the server', async () => {
    const user = userEvent.setup();
    mockFetchByUrl((url, method) => {
      if (url.includes('/auth/me')) return { status: 200, body: ME_BODY };
      if (url.endsWith('/rsvp') && method === 'GET') {
        return { status: 200, body: { attending: false, joinedAt: null } };
      }
      if (url.endsWith('/rsvp') && method === 'POST') {
        return {
          status: 409,
          body: serverError(409, "You have already RSVP'd to this event."),
        };
      }
      return { status: 404, body: {} };
    });
    setAuthToken('a-token');

    renderPanel();

    await user.click(await screen.findByRole('button', { name: 'Join Event' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Couldn't RSVP",
        expect.objectContaining({
          description: "You have already RSVP'd to this event.",
        }),
      ),
    );
  });

  it('shows a session-expired message on a 401', async () => {
    const user = userEvent.setup();
    mockFetchByUrl((url, method) => {
      if (url.includes('/auth/me')) return { status: 200, body: ME_BODY };
      if (url.endsWith('/rsvp') && method === 'GET') {
        return { status: 200, body: { attending: false, joinedAt: null } };
      }
      if (url.endsWith('/rsvp') && method === 'POST') {
        return { status: 401, body: serverError(401, 'Unauthorized') };
      }
      return { status: 404, body: {} };
    });
    setAuthToken('a-token');

    renderPanel();

    await user.click(await screen.findByRole('button', { name: 'Join Event' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Couldn't RSVP",
        expect.objectContaining({
          description: 'Your session has expired. Please sign in again.',
        }),
      ),
    );
  });

  it('shows a generic message on a network failure', async () => {
    const user = userEvent.setup();
    // The POST leg rejects outright (offline/DNS/CORS) — `mockFetchByUrl`
    // only models resolved responses, so this needs a manual mock.
    const fetchMock = vi.fn(
      (url: string, options?: { method?: string }): Promise<unknown> => {
        const method = options?.method ?? 'GET';
        if (url.includes('/auth/me')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: () => Promise.resolve(ME_BODY),
          });
        }
        if (url.endsWith('/rsvp') && method === 'GET') {
          return Promise.resolve({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: () => Promise.resolve({ attending: false, joinedAt: null }),
          });
        }
        return Promise.reject(new TypeError('Failed to fetch'));
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    setAuthToken('a-token');

    renderPanel();

    await user.click(await screen.findByRole('button', { name: 'Join Event' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Couldn't RSVP",
        expect.objectContaining({
          description:
            'Unable to reach EventHub. Check your internet connection and try again.',
        }),
      ),
    );
  });
});

describe('EventRsvpPanel — attending', () => {
  it('shows the attending state and a Cancel RSVP action', async () => {
    mockFetchByUrl((url) =>
      url.includes('/auth/me')
        ? { status: 200, body: ME_BODY }
        : {
            status: 200,
            body: { attending: true, joinedAt: '2026-09-24T12:00:00.000Z' },
          },
    );
    setAuthToken('a-token');

    renderPanel();

    expect(
      await screen.findByText("You're attending this event."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Cancel RSVP' }),
    ).toBeInTheDocument();
  });

  it('flips to not-attending and toasts success after a successful cancel', async () => {
    const user = userEvent.setup();
    let attending = true;
    mockFetchByUrl((url, method) => {
      if (url.includes('/auth/me')) return { status: 200, body: ME_BODY };
      if (url.endsWith('/rsvp') && method === 'GET') {
        return {
          status: 200,
          body: {
            attending,
            joinedAt: attending ? '2026-09-24T12:00:00.000Z' : null,
          },
        };
      }
      if (url.endsWith('/rsvp') && method === 'DELETE') {
        attending = false;
        return { status: 204, body: undefined };
      }
      return { status: 404, body: {} };
    });
    setAuthToken('a-token');

    renderPanel();

    await user.click(
      await screen.findByRole('button', { name: 'Cancel RSVP' }),
    );

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('RSVP cancelled'),
    );
    expect(
      await screen.findByRole('button', { name: 'Join Event' }),
    ).toBeInTheDocument();
  });

  it('shows a stale-cancel error from the server and resyncs', async () => {
    const user = userEvent.setup();
    let statusCalls = 0;
    mockFetchByUrl((url, method) => {
      if (url.includes('/auth/me')) return { status: 200, body: ME_BODY };
      if (url.endsWith('/rsvp') && method === 'GET') {
        statusCalls += 1;
        return {
          status: 200,
          body: { attending: true, joinedAt: '2026-09-24T12:00:00.000Z' },
        };
      }
      if (url.endsWith('/rsvp') && method === 'DELETE') {
        return {
          status: 404,
          body: serverError(404, 'You are not attending this event.'),
        };
      }
      return { status: 404, body: {} };
    });
    setAuthToken('a-token');

    renderPanel();

    await user.click(
      await screen.findByRole('button', { name: 'Cancel RSVP' }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Couldn't cancel RSVP",
        expect.objectContaining({
          description: 'You are not attending this event.',
        }),
      ),
    );
    await waitFor(() => expect(statusCalls).toBeGreaterThan(1));
  });
});

describe('EventRsvpPanel — status check unavailable', () => {
  it('shows a retry action and recovers on retry', async () => {
    const user = userEvent.setup();
    let statusCalls = 0;
    mockFetchByUrl((url, method) => {
      if (url.includes('/auth/me')) return { status: 200, body: ME_BODY };
      if (url.endsWith('/rsvp') && method === 'GET') {
        statusCalls += 1;
        return statusCalls === 1
          ? { status: 500, body: serverError(500, 'boom') }
          : { status: 200, body: { attending: false, joinedAt: null } };
      }
      return { status: 404, body: {} };
    });
    setAuthToken('a-token');

    renderPanel();

    expect(
      await screen.findByText("Couldn't check your RSVP status."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(
      await screen.findByRole('button', { name: 'Join Event' }),
    ).toBeInTheDocument();
  });
});
