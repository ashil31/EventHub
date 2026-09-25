import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Event } from '../../../types/event';
import { EventDetailHeader } from './event-detail-header';

const BASE_EVENT: Event = {
  id: 'e1',
  title: 'Backend Engineering Meetup',
  description: null,
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

describe('EventDetailHeader', () => {
  it('renders the title as the page heading', () => {
    render(<EventDetailHeader event={BASE_EVENT} />);
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Backend Engineering Meetup',
      }),
    ).toBeInTheDocument();
  });

  it('shows spots remaining when the event is not full', () => {
    render(<EventDetailHeader event={BASE_EVENT} />);
    expect(screen.getByText('60 spots left')).toBeInTheDocument();
  });

  it('shows "Full" when there are no available spots', () => {
    render(<EventDetailHeader event={{ ...BASE_EVENT, availableSpots: 0 }} />);
    expect(screen.getByText('Full')).toBeInTheDocument();
  });
});
