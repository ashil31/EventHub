/**
 * The boundary between `<input type="datetime-local">` (browser-local
 * time, no timezone info in the value string) and the API's ISO-8601 UTC
 * timestamps (§13/§45 of the Phase 7 brief). Neither direction ever
 * appends or strips a `Z` by string manipulation — both go through a
 * real `Date` object, which is what correctly applies the browser's own
 * timezone offset both ways, so an event set to "7:00 PM" in the
 * browser's local time is the one that actually starts at 7:00 PM local,
 * regardless of what UTC offset that browser happens to be in.
 */

function isValidDate(date: Date): boolean {
  return !Number.isNaN(date.getTime());
}

/** ISO-8601 UTC string → a `datetime-local` input value, in the
 * browser's local time (uses the local getters — `getHours()`, not
 * `getUTCHours()` — deliberately). */
export function toDatetimeLocalValue(iso: string): string {
  const date = new Date(iso);
  if (!isValidDate(date)) {
    return '';
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** A `datetime-local` input value (browser-local time) → an ISO-8601 UTC
 * string for the API. `new Date(value)` parses a timezone-less
 * `datetime-local` string as local time per spec, so `.toISOString()`
 * converts it to the correct UTC instant. */
export function fromDatetimeLocalValue(value: string): string {
  return new Date(value).toISOString();
}
