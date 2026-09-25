import { describe, expect, it } from 'vitest';
import { formatEventDateRange } from './format-event-date';

describe('formatEventDateRange', () => {
  it('formats a same-day range as one date with a start/end time', () => {
    const result = formatEventDateRange(
      '2026-10-10T10:00:00.000Z',
      '2026-10-10T13:00:00.000Z',
    );
    expect(result).toContain('–');
    expect(result.split('–')).toHaveLength(2);
  });

  it('formats a multi-day range with both dates', () => {
    const result = formatEventDateRange(
      '2026-10-10T22:00:00.000Z',
      '2026-10-12T02:00:00.000Z',
    );
    const [startLabel, endLabel] = result.split('–').map((s) => s.trim());
    expect(startLabel).toContain('2026');
    expect(endLabel).toContain('2026');
  });

  it('falls back to "Date unavailable" for an invalid start date', () => {
    expect(formatEventDateRange('not-a-date', '2026-10-10T13:00:00.000Z')).toBe(
      'Date unavailable',
    );
  });

  it('falls back to just the start label for an invalid end date', () => {
    const result = formatEventDateRange('2026-10-10T10:00:00.000Z', 'garbage');
    expect(result).not.toContain('–');
    expect(result).not.toBe('Date unavailable');
  });
});
