import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EventDetailError } from './event-detail-error';

describe('EventDetailError', () => {
  it('renders an alert with a retry action', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<EventDetailError onRetry={onRetry} />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Unable to load this event',
    );

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
