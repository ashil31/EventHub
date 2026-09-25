import { describe, expect, it } from 'vitest';
import type { Event } from '../../../types/event';
import {
  mapEventFormToCreateRequest,
  mapEventFormToUpdateRequest,
  parseEventToFormValues,
} from './event-form-transform';
import type { EventFormValues } from '../schemas/event-schema';

const SAMPLE_EVENT: Event = {
  id: 'e1',
  title: 'Backend Engineering Meetup',
  description: 'A meetup for backend engineers.',
  location: 'Ahmedabad',
  startsAt: '2026-10-10T10:00:00.000Z',
  endsAt: '2026-10-10T13:00:00.000Z',
  capacity: 100,
  attendeeCount: 40,
  availableSpots: 60,
  createdBy: { id: 'u1', name: 'Ashil Patel', email: 'ashil@example.com' },
  createdAt: '2026-09-24T12:00:00.000Z',
  updatedAt: '2026-09-24T12:00:00.000Z',
};

const FORM_VALUES: EventFormValues = {
  title: '  Backend Engineering Meetup  ',
  description: '  A meetup for backend engineers.  ',
  location: '  Ahmedabad  ',
  startsAt: '2026-10-10T10:00',
  endsAt: '2026-10-10T13:00',
  capacity: 100,
};

describe('parseEventToFormValues', () => {
  it('maps every field, substituting an empty string for a null description', () => {
    const values = parseEventToFormValues({
      ...SAMPLE_EVENT,
      description: null,
    });
    expect(values.title).toBe('Backend Engineering Meetup');
    expect(values.description).toBe('');
    expect(values.location).toBe('Ahmedabad');
    expect(values.capacity).toBe(100);
    expect(values.startsAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(values.endsAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it('preserves a real description', () => {
    const values = parseEventToFormValues(SAMPLE_EVENT);
    expect(values.description).toBe('A meetup for backend engineers.');
  });
});

describe('mapEventFormToCreateRequest', () => {
  it('trims text fields and converts datetimes to ISO strings', () => {
    const request = mapEventFormToCreateRequest(FORM_VALUES);
    expect(request.title).toBe('Backend Engineering Meetup');
    expect(request.location).toBe('Ahmedabad');
    expect(request.description).toBe('A meetup for backend engineers.');
    expect(request.capacity).toBe(100);
    expect(() => new Date(request.startsAt).toISOString()).not.toThrow();
  });

  it('maps a blank description to undefined (dropped by JSON.stringify, never sent)', () => {
    const request = mapEventFormToCreateRequest({
      ...FORM_VALUES,
      description: '   ',
    });
    expect(request.description).toBeUndefined();
    expect(JSON.stringify(request)).not.toContain('description');
  });
});

describe('mapEventFormToUpdateRequest', () => {
  it('includes only fields marked dirty', () => {
    const update = mapEventFormToUpdateRequest(FORM_VALUES, {
      capacity: true,
    });
    expect(update).toEqual({ capacity: 100 });
  });

  it('returns an empty object when nothing is dirty', () => {
    const update = mapEventFormToUpdateRequest(FORM_VALUES, {});
    expect(update).toEqual({});
  });

  it('trims a dirty title but leaves an untouched title out entirely', () => {
    const update = mapEventFormToUpdateRequest(FORM_VALUES, { title: true });
    expect(update).toEqual({ title: 'Backend Engineering Meetup' });
  });

  it('maps a dirty startsAt to an ISO string', () => {
    const update = mapEventFormToUpdateRequest(FORM_VALUES, {
      startsAt: true,
    });
    expect(Object.keys(update)).toEqual(['startsAt']);
    expect(() =>
      new Date(update.startsAt as string).toISOString(),
    ).not.toThrow();
  });

  it('maps a dirty, now-blank description to undefined (clearing it)', () => {
    const update = mapEventFormToUpdateRequest(
      { ...FORM_VALUES, description: '   ' },
      { description: true },
    );
    expect(update).toEqual({ description: undefined });
    expect('description' in update).toBe(true);
  });
});
