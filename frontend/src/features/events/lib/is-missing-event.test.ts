import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../lib/api/api-error';
import { isMissingEvent } from './is-missing-event';

describe('isMissingEvent', () => {
  it('is true for a 404', () => {
    const error = new ApiError('Event not found', {
      status: 404,
      code: 'NOT_FOUND',
    });
    expect(isMissingEvent(error)).toBe(true);
  });

  it('is true for a 400 (malformed id)', () => {
    const error = new ApiError('Validation failed (uuid is expected)', {
      status: 400,
      code: 'BAD_REQUEST',
    });
    expect(isMissingEvent(error)).toBe(true);
  });

  it('is false for a 500', () => {
    const error = new ApiError('Internal error', {
      status: 500,
      code: 'INTERNAL_ERROR',
    });
    expect(isMissingEvent(error)).toBe(false);
  });

  it('is false for a non-ApiError value', () => {
    expect(isMissingEvent(new Error('plain error'))).toBe(false);
  });
});
