const joinedAtFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/** Same `Intl.DateTimeFormat`-over-a-date-library approach as
 * `formatEventDateRange` — one known-valid ISO timestamp from the API,
 * no timezone math of our own to get wrong. */
export function formatJoinedAt(joinedAt: string): string {
  const date = new Date(joinedAt);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }
  return joinedAtFormatter.format(date);
}
