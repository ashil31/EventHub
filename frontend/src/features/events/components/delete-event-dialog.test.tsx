import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { toast } from 'sonner';
import { describe, expect, it, vi } from 'vitest';
import { mockFetchJson } from '../../../test/mock-fetch';
import { createTestQueryClient } from '../../../test/test-utils';
import { DeleteEventDialog } from './delete-event-dialog';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function renderDialog() {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/events/e1']}>
        <Routes>
          <Route
            path="/events/:eventId"
            element={
              <DeleteEventDialog eventId="e1" eventTitle="Backend Meetup" />
            }
          />
          <Route path="/events" element={<div>Events list page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DeleteEventDialog', () => {
  it('opens the confirmation dialog when the Delete event button is clicked', async () => {
    const user = userEvent.setup();
    renderDialog();

    expect(screen.queryByText('Delete event?')).not.toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Delete event' }));

    expect(screen.getByText('Delete event?')).toBeVisible();
    expect(screen.getByText(/Backend Meetup/)).toBeVisible();
  });

  it('does not delete when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetchJson(204, undefined);
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Delete event' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByText('Delete event?')).not.toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('deletes, toasts success, and navigates to /events on confirm', async () => {
    const user = userEvent.setup();
    mockFetchJson(204, undefined);
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Delete event' }));
    // Two "Delete event" buttons exist now (the trigger + the dialog's
    // confirm button) — the confirm one is inside the open dialog.
    const dialog = screen.getByText('Delete event?').closest('dialog');
    const confirmButton = dialog
      ? Array.from(dialog.querySelectorAll('button')).find(
          (button) => button.textContent === 'Delete event',
        )
      : null;
    expect(confirmButton).toBeTruthy();
    await user.click(confirmButton as HTMLButtonElement);

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Event deleted'),
    );
    expect(await screen.findByText('Events list page')).toBeInTheDocument();
  });

  it('shows an error toast and keeps the dialog open on failure', async () => {
    const user = userEvent.setup();
    mockFetchJson(403, {
      statusCode: 403,
      code: 'FORBIDDEN',
      message: 'Only the event creator can perform this action',
      error: 'Forbidden',
      timestamp: '2026-09-25T00:00:00.000Z',
      path: '/api/v1/events/e1',
      requestId: 'req-1',
    });
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Delete event' }));
    const dialog = screen.getByText('Delete event?').closest('dialog');
    const confirmButton = Array.from(
      dialog?.querySelectorAll('button') ?? [],
    ).find((button) => button.textContent === 'Delete event');
    await user.click(confirmButton as HTMLButtonElement);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Couldn't delete event",
        expect.objectContaining({
          description: 'Only the event creator can perform this action',
        }),
      ),
    );
    expect(screen.getByText('Delete event?')).toBeVisible();
  });
});
