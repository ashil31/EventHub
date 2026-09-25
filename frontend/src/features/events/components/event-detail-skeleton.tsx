/** Approximates the real layout (title + badge, the metadata card,
 * description lines) — one `role="status"` region, decorative bars
 * `aria-hidden` (§15, mirroring `EventListSkeleton`'s established
 * pattern from Phase 4; not a new skeleton system). */
export function EventDetailSkeleton() {
  return (
    <div role="status" aria-label="Loading event" className="space-y-6">
      <div
        aria-hidden="true"
        className="flex items-start justify-between gap-3"
      >
        <div className="h-8 w-2/3 animate-pulse rounded bg-muted/15" />
        <div className="h-6 w-24 shrink-0 animate-pulse rounded-full bg-muted/15" />
      </div>
      <div
        aria-hidden="true"
        className="h-32 animate-pulse rounded-xl border border-border bg-card p-5"
      />
      <div aria-hidden="true" className="space-y-2">
        <div className="h-3 w-full animate-pulse rounded bg-muted/15" />
        <div className="h-3 w-5/6 animate-pulse rounded bg-muted/15" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-muted/15" />
      </div>
    </div>
  );
}
