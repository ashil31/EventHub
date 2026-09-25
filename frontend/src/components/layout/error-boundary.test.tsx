import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { ErrorBoundary } from './error-boundary';

function Thrower(): never {
  throw new Error('boom');
}

describe('ErrorBoundary', () => {
  let reload: ReturnType<typeof vi.fn>;
  let assign: ReturnType<typeof vi.fn>;
  let consoleErrorSpy: MockInstance<typeof console.error>;

  beforeEach(() => {
    reload = vi.fn();
    assign = vi.fn();
    // jsdom's real `window.location.reload`/`assign` throw "not
    // implemented" — replaced wholesale for this test only, restored in
    // afterEach so no other test's navigation assumptions are affected.
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload, assign },
      configurable: true,
    });
    // React logs the caught render error to its own dev overlay/console in
    // addition to the boundary's own `componentDidCatch` — expected noise
    // for this specific test, not a real failure to surface.
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: location,
      configurable: true,
    });
    consoleErrorSpy.mockRestore();
  });

  it('renders children normally when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>All good</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText('All good')).toBeInTheDocument();
  });

  it('renders a safe fallback instead of a blank screen when a child throws', () => {
    render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.queryByText('All good')).not.toBeInTheDocument();
    expect(screen.queryByText('boom')).not.toBeInTheDocument();
  });

  it('reloads the page when Reload is clicked', async () => {
    const user = userEvent.setup();
    render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>,
    );

    await user.click(screen.getByRole('button', { name: 'Reload' }));

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('navigates to /events when Browse events is clicked', async () => {
    const user = userEvent.setup();
    render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>,
    );

    await user.click(screen.getByRole('button', { name: 'Browse events' }));

    expect(assign).toHaveBeenCalledWith('/events');
  });
});
