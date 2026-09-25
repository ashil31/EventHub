import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Event } from '../../../types/event';
import { EventCard } from './event-card';

const BASE_EVENT: Event = {
  id: 'e1',
  title: 'Backend Engineering Meetup',
  description: 'A meetup for backend engineers.',
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

describe('EventCard', () => {
  it('renders the title, location, description, and attendee count', () => {
    render(<EventCard event={BASE_EVENT} />);
    expect(
      screen.getByRole('heading', { name: 'Backend Engineering Meetup' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Ahmedabad')).toBeInTheDocument();
    expect(
      screen.getByText('A meetup for backend engineers.'),
    ).toBeInTheDocument();
    expect(screen.getByText('40 / 100 attending')).toBeInTheDocument();
  });

  it('shows spots remaining when the event is not full', () => {
    render(<EventCard event={BASE_EVENT} />);
    expect(screen.getByText('60 spots left')).toBeInTheDocument();
  });

  it('shows "Full" when there are no available spots', () => {
    render(<EventCard event={{ ...BASE_EVENT, availableSpots: 0 }} />);
    expect(screen.getByText('Full')).toBeInTheDocument();
    expect(screen.queryByText(/spots left/)).not.toBeInTheDocument();
  });

  it('omits the description paragraph when null', () => {
    render(<EventCard event={{ ...BASE_EVENT, description: null }} />);
    expect(
      screen.queryByText('A meetup for backend engineers.'),
    ).not.toBeInTheDocument();
  });

  it('uses singular "spot" for exactly one remaining', () => {
    render(<EventCard event={{ ...BASE_EVENT, availableSpots: 1 }} />);
    expect(screen.getByText('1 spot left')).toBeInTheDocument();
  });
});
