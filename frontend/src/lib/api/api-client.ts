import { env } from '../../config/env';
import { ApiError } from './api-error';

type RequestOptions = Omit<RequestInit, 'body' | 'headers'> & {
  body?: unknown;
  headers?: Record<string, string>;
};

/**
 * Set by the auth feature once it exists (login/logout). Deliberately just
 * a plain module-level slot, not a React context — `request()` below needs
 * to read it synchronously on every call, outside of React. No feature
 * calls this yet in Phase 1; it exists so the generic client already has
 * the extension point Phase 0 § G designed, instead of that plumbing being
 * bolted on later.
 */
let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

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
  if (authToken) {
    requestHeaders.Authorization = `Bearer ${authToken}`;
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
