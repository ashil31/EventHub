import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Event } from '../../../types/event';
import { EventDetailMeta } from './event-detail-meta';

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

describe('EventDetailMeta', () => {
  it('renders location, attendee count, and host', () => {
    render(<EventDetailMeta event={BASE_EVENT} />);
    expect(screen.getByText('Ahmedabad')).toBeInTheDocument();
    expect(screen.getByText('40 / 100 attending')).toBeInTheDocument();
    expect(screen.getByText('Ashil Patel')).toBeInTheDocument();
  });

  it('formats the date range using the shared formatter', () => {
    render(<EventDetailMeta event={BASE_EVENT} />);
    expect(screen.getByText(/–/)).toBeInTheDocument();
  });

  it('renders as a definition list', () => {
    const { container } = render(<EventDetailMeta event={BASE_EVENT} />);
    expect(container.querySelector('dl')).toBeInTheDocument();
    expect(screen.getByText('Location').tagName).toBe('DT');
  });
});
