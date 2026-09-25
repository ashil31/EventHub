import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../lib/api/api-error';
import { getRsvpErrorMessage } from './error-messages';

describe('getRsvpErrorMessage', () => {
  it('gives frontend-authored copy for a network error', () => {
    const error = ApiError.networkError(new TypeError('Failed to fetch'));
    expect(getRsvpErrorMessage(error)).toMatch(/check your internet/i);
  });

  it('gives frontend-authored copy for a 401', () => {
    const error = new ApiError('Unauthorized', {
      status: 401,
      code: 'UNAUTHORIZED',
    });
    expect(getRsvpErrorMessage(error)).toMatch(/session has expired/i);
  });

  it('passes through the backend message for a 404 — event deleted', () => {
    const error = new ApiError('Event not found', {
      status: 404,
      code: 'NOT_FOUND',
    });
    expect(getRsvpErrorMessage(error)).toBe('Event not found');
  });

  it('passes through the backend message for a 404 — stale cancel', () => {
    const error = new ApiError('You are not attending this event.', {
      status: 404,
      code: 'NOT_FOUND',
    });
    expect(getRsvpErrorMessage(error)).toBe(
      'You are not attending this event.',
    );
  });

  it("passes through the backend message for a 409 — already RSVP'd", () => {
    const error = new ApiError("You have already RSVP'd to this event.", {
      status: 409,
      code: 'CONFLICT',
    });
    expect(getRsvpErrorMessage(error)).toBe(
      "You have already RSVP'd to this event.",
    );
  });

  it('passes through the backend message for a 409 — event full', () => {
    const error = new ApiError('Event is full.', {
      status: 409,
      code: 'CONFLICT',
    });
    expect(getRsvpErrorMessage(error)).toBe('Event is full.');
  });

  it('passes through the backend message for a 409 — event already started', () => {
    const error = new ApiError(
      'RSVP is closed because the event has already started.',
      { status: 409, code: 'CONFLICT' },
    );
    expect(getRsvpErrorMessage(error)).toBe(
      'RSVP is closed because the event has already started.',
    );
  });

  it('gives a generic message for a 5xx, never the raw backend text', () => {
    const error = new ApiError('Internal server error', {
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
    });
    expect(getRsvpErrorMessage(error)).toBe(
      'Something went wrong on our end. Please try again.',
    );
  });
});
