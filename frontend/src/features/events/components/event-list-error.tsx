import { Button } from '../../../components/ui/button';

interface EventListErrorProps {
  onRetry: () => void;
}

/** `onRetry` is always the query's own `refetch` (§ 16) — this component
 * never re-implements the request itself. Message is deliberately generic;
 * internal error detail (`ApiError.message`) isn't surfaced for a public
 * listing endpoint where the realistic failure is "network/server," not
 * something the visitor caused or can act on. */
export function EventListError({ onRetry }: EventListErrorProps) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-border bg-card p-8 text-center"
    >
      <h2 className="text-base font-semibold text-foreground">
        Couldn&apos;t load events
      </h2>
      <p className="mt-1 text-sm text-muted">
        Something went wrong while fetching events. Check your connection and
        try again.
      </p>
      <Button className="mt-4" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
