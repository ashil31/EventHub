import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../lib/api/api-error';
import { getEventErrorMessage } from './error-messages';

describe('getEventErrorMessage', () => {
  it('gives frontend-authored copy for a network error', () => {
    const error = ApiError.networkError(new TypeError('Failed to fetch'));
    expect(getEventErrorMessage(error)).toMatch(/check your internet/i);
  });

  it('gives frontend-authored copy for a 401', () => {
    const error = new ApiError('Unauthorized', {
      status: 401,
      code: 'UNAUTHORIZED',
    });
    expect(getEventErrorMessage(error)).toMatch(/session has expired/i);
  });

  it('passes through the backend message for a 400 (validation)', () => {
    const error = new ApiError('startsAt must be before endsAt', {
      status: 400,
      code: 'BAD_REQUEST',
    });
    expect(getEventErrorMessage(error)).toBe('startsAt must be before endsAt');
  });

  it('passes through the backend message for a 403 (not the creator)', () => {
    const error = new ApiError(
      'Only the event creator can perform this action',
      { status: 403, code: 'FORBIDDEN' },
    );
    expect(getEventErrorMessage(error)).toBe(
      'Only the event creator can perform this action',
    );
  });

  it('passes through the backend message for a 404', () => {
    const error = new ApiError('Event not found', {
      status: 404,
      code: 'NOT_FOUND',
    });
    expect(getEventErrorMessage(error)).toBe('Event not found');
  });

  it('passes through the backend message for a 409 (capacity conflict)', () => {
    const error = new ApiError(
      'Capacity cannot be reduced below the current attendee count (5).',
      { status: 409, code: 'CONFLICT' },
    );
    expect(getEventErrorMessage(error)).toBe(
      'Capacity cannot be reduced below the current attendee count (5).',
    );
  });

  it('gives a generic message for a 5xx, never the raw backend text', () => {
    const error = new ApiError('Internal server error', {
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
    });
    expect(getEventErrorMessage(error)).toBe(
      'Something went wrong on our end. Please try again.',
    );
  });
});
