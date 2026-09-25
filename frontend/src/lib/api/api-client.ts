import { env } from '../../config/env';
import { getAuthToken } from './auth-token';
import { ApiError } from './api-error';

type RequestOptions = Omit<RequestInit, 'body' | 'headers'> & {
  body?: unknown;
  headers?: Record<string, string>;
};

/**
 * The one function every feature API module calls through. Owns: base URL,
 * JSON (de)serialization, the auth header, and turning a non-2xx response
 * into a thrown `ApiError` — nothing EventHub-specific (no `getEvents`,
 * `login`, etc. here; those belong to feature API modules in later phases).
 */
export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, headers, ...rest } = options;

  const requestHeaders: Record<string, string> = { ...headers };
  if (body !== undefined) {
    requestHeaders['Content-Type'] = 'application/json';
  }
  const token = getAuthToken();
  if (token) {
    requestHeaders.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${env.apiUrl}/api/v1${path}`, {
      ...rest,
      headers: requestHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (cause) {
    throw ApiError.networkError(cause);
  }

  if (!response.ok) {
    throw await ApiError.fromResponse(response);
  }

  // 204 No Content (e.g. DELETE /events/:id, DELETE /events/:id/rsvp) has
  // no body — calling response.json() on it throws.
  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const apiClient = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method'>) =>
    request<T>(path, { ...options, method: 'GET' }),

  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),

  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PATCH', body }),

  delete: <T>(path: string, options?: Omit<RequestOptions, 'method'>) =>
    request<T>(path, { ...options, method: 'DELETE' }),
};
