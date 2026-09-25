import { describe, expect, it } from 'vitest';
import { fromDatetimeLocalValue, toDatetimeLocalValue } from './event-datetime';

describe('toDatetimeLocalValue', () => {
  it('returns an empty string for an invalid date', () => {
    expect(toDatetimeLocalValue('not-a-date')).toBe('');
  });

  it('returns a datetime-local-shaped string for a valid ISO date', () => {
    const result = toDatetimeLocalValue('2026-10-10T10:00:00.000Z');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});

describe('fromDatetimeLocalValue', () => {
  it('produces a valid ISO string', () => {
    const result = fromDatetimeLocalValue('2026-10-10T10:00');
    expect(() => new Date(result)).not.toThrow();
    expect(new Date(result).toISOString()).toBe(result);
  });
});

describe("round-trip (timezone-agnostic — avoids asserting an exact string,\n  which would depend on the test runner's own timezone)", () => {
  it('toDatetimeLocalValue then fromDatetimeLocalValue returns the same instant, to the minute', () => {
    const original = '2026-10-10T10:00:00.000Z';
    const roundTripped = fromDatetimeLocalValue(toDatetimeLocalValue(original));

    // Seconds/milliseconds are lost going through a datetime-local input
    // (it has no seconds field) — compare to the minute, not exactly.
    const originalMinute = Math.floor(new Date(original).getTime() / 60_000);
    const roundTrippedMinute = Math.floor(
      new Date(roundTripped).getTime() / 60_000,
    );
    expect(roundTrippedMinute).toBe(originalMinute);
  });
});
