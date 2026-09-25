import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EventListEmpty } from './event-list-empty';

describe('EventListEmpty', () => {
  it('shows the no-events message when there is no active search', () => {
    render(<EventListEmpty search="" onClearSearch={vi.fn()} />);
    expect(screen.getByText('No events found')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Clear search' }),
    ).not.toBeInTheDocument();
  });

  it('shows the search-specific message and a clear action when searching', async () => {
    const user = userEvent.setup();
    const onClearSearch = vi.fn();
    render(<EventListEmpty search="react" onClearSearch={onClearSearch} />);

    expect(screen.getByText('No events found for "react"')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(onClearSearch).toHaveBeenCalledTimes(1);
  });
});
