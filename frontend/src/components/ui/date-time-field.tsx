import {
  Calendar,
  DateField,
  DatePicker,
  FieldError,
  Label,
} from '@heroui/react';
import type { CalendarDateTime } from '@internationalized/date';
import { useId } from 'react';
import {
  fromCalendarDateTimeValue,
  toCalendarDateTimeValue,
} from '../../features/events/lib/event-datetime';

export interface DateTimeFieldProps {
  label: string;
  /** A `datetime-local`-shaped string (e.g. `"2026-09-26T16:28"`) or
   * `""` for empty — the exact same value shape the raw
   * `<input type="datetime-local">` this replaced used, so every other
   * part of the create/edit-event boundary (Zod, dirty-field diffing,
   * the ISO conversion in `event-datetime.ts`) is unaffected. */
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  name?: string;
}

/**
 * The Starts/Ends fields' picker (§ replacing the raw
 * `<input type="datetime-local">`) — HeroUI's `DatePicker` composed
 * exactly per its own documented pattern, with `granularity="minute"`
 * for date *and* time in one field (not HeroUI's date-only default).
 * Value conversion goes through `event-datetime.ts`'s
 * `toCalendarDateTimeValue`/`fromCalendarDateTimeValue`, not
 * `CalendarDateTime`'s own `.toString()` — see that file for why.
 *
 * Not wired with `register()` — HeroUI's `DatePicker` isn't a native
 * `<input>`, so `EventForm` uses React Hook Form's `Controller` for
 * these two fields instead, same `value`/`onChange` contract either way.
 */
export function DateTimeField({
  label,
  value,
  onChange,
  onBlur,
  error,
  name,
}: DateTimeFieldProps) {
  const fieldId = useId();

  function handleChange(next: CalendarDateTime | null) {
    onChange(fromCalendarDateTimeValue(next));
  }

  return (
    <DatePicker
      id={fieldId}
      name={name}
      granularity="minute"
      hourCycle={12}
      value={toCalendarDateTimeValue(value)}
      onChange={handleChange}
      onBlur={onBlur}
      isInvalid={Boolean(error)}
      className="w-full"
    >
      <Label>{label}</Label>
      <DateField.Group fullWidth>
        <DateField.Input>
          {(segment) => <DateField.Segment segment={segment} />}
        </DateField.Input>
        <DateField.Suffix>
          <DatePicker.Trigger>
            <DatePicker.TriggerIndicator />
          </DatePicker.Trigger>
        </DateField.Suffix>
      </DateField.Group>
      {error && <FieldError>{error}</FieldError>}
      <DatePicker.Popover>
        <Calendar aria-label={label}>
          <Calendar.Header>
            <Calendar.YearPickerTrigger>
              <Calendar.YearPickerTriggerHeading />
              <Calendar.YearPickerTriggerIndicator />
            </Calendar.YearPickerTrigger>
            <Calendar.NavButton slot="previous" />
            <Calendar.NavButton slot="next" />
          </Calendar.Header>
          <Calendar.Grid>
            <Calendar.GridHeader>
              {(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
            </Calendar.GridHeader>
            <Calendar.GridBody>
              {(date) => <Calendar.Cell date={date} />}
            </Calendar.GridBody>
          </Calendar.Grid>
          <Calendar.YearPickerGrid>
            <Calendar.YearPickerGridBody>
              {({ year }) => <Calendar.YearPickerCell year={year} />}
            </Calendar.YearPickerGridBody>
          </Calendar.YearPickerGrid>
        </Calendar>
      </DatePicker.Popover>
    </DatePicker>
  );
}
