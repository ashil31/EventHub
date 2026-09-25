import { describe, expect, it } from 'vitest';
import { createEventSchema, editEventSchema } from './event-schema';

function futureLocal(hoursFromNow: number): string {
  const date = new Date(Date.now() + hoursFromNow * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function validValues(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    title: 'Backend Engineering Meetup',
    description: 'A meetup for backend engineers.',
    location: 'Ahmedabad',
    startsAt: futureLocal(24),
    endsAt: futureLocal(27),
    capacity: 50,
    ...overrides,
  };
}

describe('createEventSchema', () => {
  it('accepts a fully valid submission', () => {
    const result = createEventSchema.safeParse(validValues());
    expect(result.success).toBe(true);
  });

  it('requires a title', () => {
    const result = createEventSchema.safeParse(validValues({ title: '  ' }));
    expect(result.success).toBe(false);
  });

  it('rejects a title over 200 characters', () => {
    const result = createEventSchema.safeParse(
      validValues({ title: 'a'.repeat(201) }),
    );
    expect(result.success).toBe(false);
  });

  it('allows an empty description', () => {
    const result = createEventSchema.safeParse(
      validValues({ description: '' }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects a description over 2000 characters', () => {
    const result = createEventSchema.safeParse(
      validValues({ description: 'a'.repeat(2001) }),
    );
    expect(result.success).toBe(false);
  });

  it('requires a location', () => {
    const result = createEventSchema.safeParse(validValues({ location: '' }));
    expect(result.success).toBe(false);
  });

  it('rejects a non-integer capacity', () => {
    const result = createEventSchema.safeParse(validValues({ capacity: 1.5 }));
    expect(result.success).toBe(false);
  });

  it('rejects a zero or negative capacity', () => {
    expect(
      createEventSchema.safeParse(validValues({ capacity: 0 })).success,
    ).toBe(false);
    expect(
      createEventSchema.safeParse(validValues({ capacity: -1 })).success,
    ).toBe(false);
  });

  it('rejects endsAt before startsAt', () => {
    const result = createEventSchema.safeParse(
      validValues({ startsAt: futureLocal(27), endsAt: futureLocal(24) }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects a start time in the past', () => {
    const result = createEventSchema.safeParse(
      validValues({ startsAt: futureLocal(-24), endsAt: futureLocal(-20) }),
    );
    expect(result.success).toBe(false);
  });
});

describe('editEventSchema', () => {
  it('accepts a fully valid submission', () => {
    const result = editEventSchema.safeParse(validValues());
    expect(result.success).toBe(true);
  });

  it('still rejects endsAt before startsAt', () => {
    const result = editEventSchema.safeParse(
      validValues({ startsAt: futureLocal(27), endsAt: futureLocal(24) }),
    );
    expect(result.success).toBe(false);
  });

  it('does NOT reject a start time in the past (§13/§15 — see schema comment)', () => {
    const result = editEventSchema.safeParse(
      validValues({ startsAt: futureLocal(-24), endsAt: futureLocal(-20) }),
    );
    expect(result.success).toBe(true);
  });
});
