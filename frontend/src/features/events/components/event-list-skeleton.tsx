const SKELETON_COUNT = 6;
const SKELETON_KEYS = Array.from({ length: SKELETON_COUNT }, (_, i) => i);

/**
 * Mirrors the eventual card layout (§ 15) rather than a generic spinner.
 * The decorative bars are `aria-hidden`; the single `role="status"`
 * wrapper is what's actually announced to screen readers, so assistive
 * tech isn't read six near-identical "loading" placeholders.
 */
export function EventListSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading events"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {SKELETON_KEYS.map((key) => (
        <div
          key={key}
          aria-hidden="true"
          className="h-40 animate-pulse rounded-xl border border-border bg-card p-5"
        >
          <div className="h-4 w-2/3 rounded bg-muted/15" />
          <div className="mt-3 h-3 w-1/2 rounded bg-muted/15" />
          <div className="mt-4 h-3 w-full rounded bg-muted/15" />
          <div className="mt-2 h-3 w-5/6 rounded bg-muted/15" />
        </div>
      ))}
    </div>
  );
}
