import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { EventDetailNotFound } from './event-detail-not-found';

describe('EventDetailNotFound', () => {
  it('renders a not-found heading and a link back to /events', () => {
    render(
      <MemoryRouter>
        <EventDetailNotFound />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: 'Event not found' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse events' })).toHaveAttribute(
      'href',
      '/events',
    );
  });
});
