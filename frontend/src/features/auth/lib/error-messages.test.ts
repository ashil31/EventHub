import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../lib/api/api-error';
import { getAuthErrorMessage } from './error-messages';

describe('getAuthErrorMessage', () => {
  it('gives frontend-authored copy for a network error', () => {
    const error = ApiError.networkError(new TypeError('Failed to fetch'));
    expect(getAuthErrorMessage(error)).toMatch(/check your internet/i);
  });

  it('gives frontend-authored copy for a 429', () => {
    const error = new ApiError('Too many requests', {
      status: 429,
      code: 'TOO_MANY_REQUESTS',
    });
    expect(getAuthErrorMessage(error)).toMatch(/wait a moment/i);
  });

  it('gives a generic message for a 5xx, never the raw backend text', () => {
    const error = new ApiError('Internal server error', {
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
    });
    expect(getAuthErrorMessage(error)).toBe(
      'Something went wrong on our end. Please try again.',
    );
  });

  it('passes through the backend message for 401 (already safe/specific)', () => {
    const error = new ApiError('Invalid email or password.', {
      status: 401,
      code: 'UNAUTHORIZED',
    });
    expect(getAuthErrorMessage(error)).toBe('Invalid email or password.');
  });

  it('passes through the backend message for 409 (already safe/specific)', () => {
    const error = new ApiError('Email already registered', {
      status: 409,
      code: 'CONFLICT',
    });
    expect(getAuthErrorMessage(error)).toBe('Email already registered');
  });
});
