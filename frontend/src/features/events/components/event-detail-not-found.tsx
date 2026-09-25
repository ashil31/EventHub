import { Link } from 'react-router';
import { Button } from '../../../components/ui/button';

/** A genuine 404, distinct from `EventDetailError` (§18). The recovery
 * action is a deterministic `/events` link, not `navigate(-1)` — a
 * visitor could have arrived here directly (a bookmark, a shared link
 * to a since-deleted event), so there's no guaranteed "back" to return
 * to (§20). */
export function EventDetailNotFound() {
  return (
    <div className="rounded-xl border border-border bg-card p-8 text-center">
      <h1 className="text-base font-semibold text-foreground">
        Event not found
      </h1>
      <p className="mt-1 text-sm text-muted">
        This event may have been removed, or the link may be incorrect.
      </p>
      <Link to="/events">
        <Button variant="secondary" className="mt-4">
          Browse events
        </Button>
      </Link>
    </div>
  );
}
