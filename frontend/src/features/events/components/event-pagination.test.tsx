import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EventPagination } from './event-pagination';

describe('EventPagination', () => {
  it('renders nothing when there is only one page', () => {
    const { container } = render(
      <EventPagination page={1} totalPages={1} onPageChange={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('disables "previous" on the first page', () => {
    render(<EventPagination page={1} totalPages={3} onPageChange={vi.fn()} />);
    expect(screen.getByLabelText('Go to previous page')).toBeDisabled();
    expect(screen.getByLabelText('Go to next page')).toBeEnabled();
  });

  it('disables "next" on the last page', () => {
    render(<EventPagination page={3} totalPages={3} onPageChange={vi.fn()} />);
    expect(screen.getByLabelText('Go to next page')).toBeDisabled();
    expect(screen.getByLabelText('Go to previous page')).toBeEnabled();
  });

  it('calls onPageChange with the adjacent page number', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(
      <EventPagination page={2} totalPages={3} onPageChange={onPageChange} />,
    );

    await user.click(screen.getByLabelText('Go to next page'));
    expect(onPageChange).toHaveBeenCalledWith(3);

    await user.click(screen.getByLabelText('Go to previous page'));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it('shows the current page and total', () => {
    render(<EventPagination page={2} totalPages={5} onPageChange={vi.fn()} />);
    expect(screen.getByText('Page 2 of 5')).toBeInTheDocument();
  });
});
