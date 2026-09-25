import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { EventEditForbidden } from './event-edit-forbidden';

describe('EventEditForbidden', () => {
  it('renders a message and a link back to the event', () => {
    render(
      <MemoryRouter>
        <EventEditForbidden eventId="e1" />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', {
        name: "You don't have permission to edit this event",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to event' })).toHaveAttribute(
      'href',
      '/events/e1',
    );
  });
});
