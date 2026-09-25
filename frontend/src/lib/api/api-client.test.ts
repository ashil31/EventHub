import { beforeEach, describe, expect, it } from 'vitest';
import {
  mockFetchInvalidJson,
  mockFetchJson,
  mockFetchNetworkError,
} from '../../test/mock-fetch';
import { apiClient } from './api-client';
import { ApiError } from './api-error';
import { clearAuthToken, setAuthToken } from './auth-token';

beforeEach(() => {
  clearAuthToken();
});

async function captureApiError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected the promise to reject with an ApiError');
}

describe('apiClient', () => {
  it('resolves with the parsed JSON body on a successful response', async () => {
    const mock = mockFetchJson(200, { id: '1', title: 'Test Event' });

    const result = await apiClient.get<{ id: string; title: string }>(
      '/events/1',
    );

    expect(result).toEqual({ id: '1', title: 'Test Event' });
    expect(mock).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/events/1',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('resolves undefined for a 204 No Content response without parsing a body', async () => {
    mockFetchJson(204, undefined);

    const result = await apiClient.delete<void>('/events/1');

    expect(result).toBeUndefined();
  });

  it('sends a JSON body and Content-Type only when a body is present', async () => {
    const mock = mockFetchJson(201, { id: '1' });

    await apiClient.post('/events', { title: 'New Event' });

    const [, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe(JSON.stringify({ title: 'New Event' }));
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    );
  });

  it('omits Content-Type when there is no body (GET/DELETE)', async () => {
    const mock = mockFetchJson(200, {});
    await apiClient.get('/events');
    const [, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(
      (init.headers as Record<string, string>)['Content-Type'],
    ).toBeUndefined();
  });

  it('attaches the Authorization header only when a token is set', async () => {
    const mock = mockFetchJson(200, {});
    await apiClient.get('/auth/me');
    let [, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(
      (init.headers as Record<string, string>).Authorization,
    ).toBeUndefined();

    setAuthToken('test-token');
    await apiClient.get('/auth/me');
    [, init] = mock.mock.calls[1] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer test-token',
    );
  });

  it('throws a normalized ApiError built from the backend error body on a non-2xx response', async () => {
    mockFetchJson(409, {
      statusCode: 409,
      code: 'CONFLICT',
      message: "Already RSVP'd, event full, or event already started",
      error: 'Conflict',
      timestamp: '2026-09-25T00:00:00.000Z',
      path: '/api/v1/events/1/rsvp',
      requestId: 'req-1',
    });

    const error = await captureApiError(apiClient.post('/events/1/rsvp'));

    expect(error.status).toBe(409);
    expect(error.code).toBe('CONFLICT');
    expect(error.requestId).toBe('req-1');
    expect(error.message).toBe(
      "Already RSVP'd, event full, or event already started",
    );
  });

  it('joins an array message body into one string', async () => {
    mockFetchJson(400, {
      statusCode: 400,
      code: 'BAD_REQUEST',
      message: ['title must be a string', 'capacity must be positive'],
      error: 'Bad Request',
      timestamp: '2026-09-25T00:00:00.000Z',
      path: '/api/v1/events',
      requestId: 'req-2',
    });

    const error = await captureApiError(apiClient.post('/events', {}));

    expect(error.message).toBe(
      'title must be a string capacity must be positive',
    );
  });

  it('falls back to a generic ApiError when the error body is not JSON', async () => {
    mockFetchInvalidJson(500);

    const error = await captureApiError(apiClient.get('/events'));

    expect(error.status).toBe(500);
    expect(error.code).toBe('UNKNOWN_ERROR');
  });

  it('normalizes a fetch rejection into a status: 0 network ApiError', async () => {
    mockFetchNetworkError();

    const error = await captureApiError(apiClient.get('/events'));

    expect(error.isNetworkError).toBe(true);
    expect(error.status).toBe(0);
    expect(error.code).toBe('NETWORK_ERROR');
  });
});
