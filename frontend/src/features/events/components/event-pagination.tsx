import { Button } from '../../../components/ui/button';

interface EventPaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

/** Uses the backend's own `page`/`totalPages` contract directly (§ 10) —
 * no separate pagination model invented on top of it. Renders nothing
 * when there's only one page, rather than a pair of permanently-disabled
 * buttons that convey no information. */
export function EventPagination({
  page,
  totalPages,
  onPageChange,
}: EventPaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <nav
      aria-label="Event pagination"
      className="flex items-center justify-center gap-3"
    >
      <Button
        variant="secondary"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        aria-label="Go to previous page"
      >
        Previous
      </Button>
      <span className="text-sm text-muted" aria-live="polite">
        Page {page} of {totalPages}
      </span>
      <Button
        variant="secondary"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="Go to next page"
      >
        Next
      </Button>
    </nav>
  );
}
