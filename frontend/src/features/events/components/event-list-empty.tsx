import { Button } from '../../../components/ui/button';

interface EventListEmptyProps {
  search: string;
  onClearSearch: () => void;
}

/** Two distinct empty states (§ 17/§ 18), not one generic message: a
 * search/filter returning nothing is expected, recoverable behavior, not
 * an error — and only the search variant offers "Clear search," which
 * updates the URL via the same filter setters the page already uses
 * rather than tracking its own hidden state. */
export function EventListEmpty({ search, onClearSearch }: EventListEmptyProps) {
  if (search) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <h2 className="text-base font-semibold text-foreground">
          No events found for &quot;{search}&quot;
        </h2>
        <p className="mt-1 text-sm text-muted">Try a different search term.</p>
        <Button variant="secondary" className="mt-4" onClick={onClearSearch}>
          Clear search
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-8 text-center">
      <h2 className="text-base font-semibold text-foreground">
        No events found
      </h2>
      <p className="mt-1 text-sm text-muted">
        There are currently no events available.
      </p>
    </div>
  );
}
