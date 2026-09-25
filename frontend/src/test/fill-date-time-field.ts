import { screen, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';

function requireDefined(value: string | undefined, what: string): string {
  if (value === undefined) {
    throw new Error(`fillDateTimeField: missing ${what}`);
  }
  return value;
}

/**
 * Types a `datetime-local`-shaped string ("YYYY-MM-DDTHH:mm", 24-hour —
 * the same shape `futureLocal()` test helpers already produce) into a
 * `DateTimeField` (the HeroUI segmented date picker that replaced the
 * old native `<input type="datetime-local">`), found by its label.
 *
 * Segment order for this app's fixed `granularity="minute"`/
 * `hourCycle={12}` configuration in the en-US locale jsdom defaults to:
 * month, day, year, hour, minute, dayPeriod (AM/PM). Typing each
 * segment's full, zero-padded digit count advances focus to the next
 * one automatically — react-aria's own behavior, not something this
 * helper drives directly; it only needs to establish initial focus on
 * the first (month) segment and then send the whole digit string.
 */
export async function fillDateTimeField(
  user: UserEvent,
  label: string,
  isoLocal: string,
): Promise<void> {
  const match = isoLocal.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) {
    throw new Error(
      `fillDateTimeField: "${isoLocal}" isn't a "YYYY-MM-DDTHH:mm" string`,
    );
  }
  const year = requireDefined(match[1], 'year');
  const month = requireDefined(match[2], 'month');
  const day = requireDefined(match[3], 'day');
  const hour24 = Number(requireDefined(match[4], 'hour'));
  const minute = requireDefined(match[5], 'minute');
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const dayPeriod = hour24 >= 12 ? 'P' : 'A';

  const group = screen.getByRole('group', { name: label });
  const [monthSegment] = within(group).getAllByRole('spinbutton');
  if (!monthSegment) {
    throw new Error(`fillDateTimeField: no segments found for "${label}"`);
  }

  await user.click(monthSegment);
  await user.keyboard(month);
  await user.keyboard(day);
  await user.keyboard(year);
  await user.keyboard(String(hour12).padStart(2, '0'));
  await user.keyboard(minute);
  await user.keyboard(dayPeriod);
}
