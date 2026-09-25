import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { toast } from 'sonner';
import { describe, expect, it, vi } from 'vitest';
import { fillDateTimeField } from '../test/fill-date-time-field';
import { mockFetchJson } from '../test/mock-fetch';
import { createTestQueryClient } from '../test/test-utils';
import { CreateEventPage } from './create-event-page';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function futureLocal(hoursFromNow: number): string {
  const date = new Date(Date.now() + hoursFromNow * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function renderPage() {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/events/new']}>
        <Routes>
          <Route path="/events/new" element={<CreateEventPage />} />
          <Route path="/events" element={<div>Events list page</div>} />
          <Route
            path="/events/:eventId"
            element={<div>Event detail page</div>}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Title'), 'Backend Engineering Meetup');
  await user.type(screen.getByLabelText('Location'), 'Ahmedabad');
  const capacityInput = screen.getByLabelText('Capacity');
  await user.clear(capacityInput);
  await user.type(capacityInput, '50');
  await fillDateTimeField(user, 'Starts', futureLocal(24));
  await fillDateTimeField(user, 'Ends', futureLocal(27));
}

describe('CreateEventPage', () => {
  it('renders the create form', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: 'Create event' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Create event' }),
    ).toBeInTheDocument();
  });

  it('creates the event and navigates to its detail page on success', async () => {
    const user = userEvent.setup();
    mockFetchJson(201, {
      id: 'new-event-id',
      title: 'Backend Engineering Meetup',
      description: null,
      location: 'Ahmedabad',
      startsAt: '2026-10-10T10:00:00.000Z',
      endsAt: '2026-10-10T13:00:00.000Z',
      capacity: 50,
      attendeeCount: 0,
      availableSpots: 50,
      createdBy: { id: 'u1', name: 'Ashil Patel', email: 'ashil@example.com' },
      createdAt: '2026-09-25T00:00:00.000Z',
      updatedAt: '2026-09-25T00:00:00.000Z',
    });
    renderPage();

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Create event' }));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Event created'),
    );
    expect(await screen.findByText('Event detail page')).toBeInTheDocument();
  });

  it('shows a server error banner and keeps the form on failure', async () => {
    const user = userEvent.setup();
    mockFetchJson(400, {
      statusCode: 400,
      code: 'BAD_REQUEST',
      message: 'startsAt must be before endsAt',
      error: 'Bad Request',
      timestamp: '2026-09-25T00:00:00.000Z',
      path: '/api/v1/events',
      requestId: 'req-1',
    });
    renderPage();

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Create event' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'startsAt must be before endsAt',
    );
    // The form is still there, with the user's input intact.
    expect(screen.getByLabelText('Title')).toHaveValue(
      'Backend Engineering Meetup',
    );
  });

  it('navigates to /events when Cancel is clicked', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(await screen.findByText('Events list page')).toBeInTheDocument();
  });
});
