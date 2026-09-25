import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventSearchInput } from './event-search-input';

describe('EventSearchInput', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the current value with an accessible label', () => {
    render(<EventSearchInput value="react" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Search events')).toHaveValue('react');
  });

  it('debounces onChange until typing pauses', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<EventSearchInput value="" onChange={onChange} />);

    const input = screen.getByLabelText('Search events');
    fireEvent.change(input, { target: { value: 'c' } });
    fireEvent.change(input, { target: { value: 'co' } });
    fireEvent.change(input, { target: { value: 'conf' } });

    expect(onChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('conf');
  });

  it('follows an externally-changed value (e.g. "Clear search")', () => {
    const { rerender } = render(
      <EventSearchInput value="react" onChange={vi.fn()} />,
    );
    expect(screen.getByLabelText('Search events')).toHaveValue('react');

    rerender(<EventSearchInput value="" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Search events')).toHaveValue('');
  });
});
