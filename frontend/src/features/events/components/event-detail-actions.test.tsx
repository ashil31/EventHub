import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearAuthToken, setAuthToken } from '../../../lib/api/auth-token';
import { mockFetchJson } from '../../../test/mock-fetch';
import { createTestQueryClient } from '../../../test/test-utils';
import type { Event } from '../../../types/event';
import { EventDetailActions } from './event-detail-actions';

const SAMPLE_EVENT: Event = {
  id: 'e1',
  title: 'Backend Engineering Meetup',
  description: null,
  location: 'Ahmedabad',
  startsAt: '2026-10-10T10:00:00.000Z',
  endsAt: '2026-10-10T13:00:00.000Z',
  capacity: 100,
  attendeeCount: 40,
  availableSpots: 60,
  createdBy: { id: 'owner-1', name: 'Ashil Patel', email: 'ashil@example.com' },
  createdAt: '2026-09-24T12:00:00.000Z',
  updatedAt: '2026-09-24T12:00:00.000Z',
};

function renderActions(ui: ReactElement) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  clearAuthToken();
});

describe('EventDetailActions', () => {
  it('renders nothing when signed out', () => {
    const { container } = renderActions(
      <EventDetailActions event={SAMPLE_EVENT} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when signed in as a different user', async () => {
    setAuthToken('a-token');
    mockFetchJson(200, {
      id: 'someone-else',
      name: 'Not The Owner',
      email: 'not-owner@example.com',
    });

    const { container } = renderActions(
      <EventDetailActions event={SAMPLE_EVENT} />,
    );

    // Wait a tick for the auth query to resolve.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it('renders Edit and Delete when signed in as the owner', async () => {
    setAuthToken('a-token');
    mockFetchJson(200, {
      id: 'owner-1',
      name: 'Ashil Patel',
      email: 'ashil@example.com',
    });

    renderActions(<EventDetailActions event={SAMPLE_EVENT} />);

    expect(
      await screen.findByRole('link', { name: 'Edit event' }),
    ).toHaveAttribute('href', '/events/e1/edit');
    expect(
      screen.getByRole('button', { name: 'Delete event' }),
    ).toBeInTheDocument();
  });
});
