import type { CalendarDateTime } from '@internationalized/date';
import { parseDateTime } from '@internationalized/date';

/**
 * The boundary between `<input type="datetime-local">` (browser-local
 * time, no timezone info in the value string) and the API's ISO-8601 UTC
 * timestamps (§13/§45 of the Phase 7 brief). Neither direction ever
 * appends or strips a `Z` by string manipulation — both go through a
 * real `Date` object, which is what correctly applies the browser's own
 * timezone offset both ways, so an event set to "7:00 PM" in the
 * browser's local time is the one that actually starts at 7:00 PM local,
 * regardless of what UTC offset that browser happens to be in.
 *
 * `DateTimeField` (the HeroUI-backed picker that replaced the raw
 * `<input type="datetime-local">`) also goes through this same
 * `datetime-local`-shaped string — never `CalendarDateTime` directly —
 * so every other part of this boundary (Zod validation, dirty-field
 * diffing, the ISO conversion above) stays exactly as it was.
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

/** A `datetime-local` input value → HeroUI's `CalendarDateTime`, for
 * `DateTimeField`'s controlled `value`. `null` for empty/unparseable —
 * `parseDateTime` throws on those rather than returning a sentinel. */
export function toCalendarDateTimeValue(
  value: string,
): CalendarDateTime | null {
  if (!value) return null;
  try {
    return parseDateTime(value);
  } catch {
    return null;
  }
}

/** The inverse — deliberately NOT `CalendarDateTime.prototype.toString()`
 * (which always includes seconds, e.g. `"2026-09-26T16:28:00"`), built
 * the same way `toDatetimeLocalValue` above builds its string, so a
 * value picked through `DateTimeField` is byte-for-byte the same shape
 * as one that came from `defaultValues`/`toDatetimeLocalValue` — no
 * spurious react-hook-form dirty-field flip from a formatting mismatch
 * alone. */
export function fromCalendarDateTimeValue(
  value: CalendarDateTime | null,
): string {
  if (!value) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${value.year}-${pad(value.month)}-${pad(value.day)}T${pad(value.hour)}:${pad(value.minute)}`;
}
