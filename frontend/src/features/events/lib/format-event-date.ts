const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
});

function isValidDate(date: Date): boolean {
  return !Number.isNaN(date.getTime());
}

/**
 * Formats an event's start/end timestamps for display — a presentation
 * concern only (§ 13); never mutates or re-derives the ISO strings the
 * query cache actually holds. Uses `Intl.DateTimeFormat` (the visitor's
 * own locale/timezone) rather than a date library, since formatting two
 * known-valid-or-gracefully-degraded timestamps is all this needs.
 */
export function formatEventDateRange(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  if (!isValidDate(start)) {
    return 'Date unavailable';
  }
  const startLabel = `${dateFormatter.format(start)} · ${timeFormatter.format(start)}`;

  const end = new Date(endsAt);
  if (!isValidDate(end)) {
    return startLabel;
  }

  const sameDay = start.toDateString() === end.toDateString();
  const endLabel = sameDay
    ? timeFormatter.format(end)
    : `${dateFormatter.format(end)} · ${timeFormatter.format(end)}`;

  return `${startLabel} – ${endLabel}`;
}
