import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '../ui/button';

const HOME_PATH = '/events';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Catches unexpected *rendering* errors at the application root — not API
 * errors, which TanStack Query already surfaces as query/mutation state
 * (Phase 1 § 30). A component throwing during render (a genuine bug) would
 * otherwise unmount the whole React tree to a blank page; this shows a
 * safe fallback with a recovery action instead of leaking a stack trace.
 *
 * A class component is required here — there is no hook equivalent of
 * `componentDidCatch`/`getDerivedStateFromError` in React today.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled rendering error:', error, info.componentStack);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleBrowseEvents = (): void => {
    window.location.assign(HOME_PATH);
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-muted max-w-sm">
            An unexpected error occurred. Please try again.
          </p>
          <div className="flex gap-3">
            <Button onClick={this.handleReload}>Reload</Button>
            <Button variant="secondary" onClick={this.handleBrowseEvents}>
              Browse events
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
