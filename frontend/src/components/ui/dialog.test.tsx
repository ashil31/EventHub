import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from './dialog';

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(true)}>Open</button>
      <Dialog open={open} onClose={() => setOpen(false)}>
        <p>Dialog content</p>
      </Dialog>
    </div>
  );
}

describe('Dialog', () => {
  it('is not visible until opened', () => {
    render(<Harness />);
    expect(screen.getByText('Dialog content')).not.toBeVisible();
  });

  it('becomes visible when open turns true', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Open' }));

    expect(screen.getByText('Dialog content')).toBeVisible();
  });

  it('closes again once open turns back to false', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByText('Dialog content')).toBeVisible();

    // Simulate the native <dialog> closing itself (Escape/cancel), which
    // is what actually drives onClose in real use — not a prop change
    // from the parent. `act` because this triggers Harness's own
    // setState(false) outside of Testing Library's usual event helpers.
    const dialog = screen.getByText('Dialog content').closest('dialog');
    act(() => {
      dialog?.dispatchEvent(new Event('cancel'));
      dialog?.dispatchEvent(new Event('close'));
    });

    expect(screen.getByText('Dialog content')).not.toBeVisible();
  });

  it('calls onClose when the native dialog fires a close event', () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose}>
        <p>content</p>
      </Dialog>,
    );

    const dialog = screen.getByText('content').closest('dialog');
    dialog?.dispatchEvent(new Event('close'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the native dialog fires a cancel event (Escape)', () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose}>
        <p>content</p>
      </Dialog>,
    );

    const dialog = screen.getByText('content').closest('dialog');
    dialog?.dispatchEvent(new Event('cancel'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
