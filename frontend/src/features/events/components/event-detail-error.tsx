import { Button } from '../../../components/ui/button';

interface EventDetailErrorProps {
  onRetry: () => void;
}

/** Network/server failure only — a genuine 404 (or a malformed id) gets
 * `EventDetailNotFound` instead (§17/§18). `onRetry` is always the
 * query's own `refetch`, never a hand-rolled re-fetch (§19). Message is
 * generic on purpose — nothing backend-internal is surfaced. */
export function EventDetailError({ onRetry }: EventDetailErrorProps) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-border bg-card p-8 text-center"
    >
      <h1 className="text-base font-semibold text-foreground">
        Unable to load this event
      </h1>
      <p className="mt-1 text-sm text-muted">
        Something went wrong. Please try again.
      </p>
      <Button className="mt-4" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
