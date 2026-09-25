import { vi, type Mock } from 'vitest';

/**
 * Stubs `global.fetch` for one test (Phase 2 § 36 — API-layer tests mock
 * at the network boundary, the same boundary `api-client.ts` itself owns,
 * rather than reaching for MSW's service-worker-level interception. This
 * codebase's whole reason for having a generic API client is that it's
 * the only thing that calls `fetch` directly — mocking `fetch` itself is
 * therefore already the real boundary, not a shortcut around it; MSW
 * would earn its setup cost once there's a much larger surface of
 * third-party network calls to intercept realistically, which isn't the
 * case here (§ 38's decision, documented at length in the Phase 2 spec).
 */
export function mockFetchJson(status: number, body: unknown): Mock {
  const ok = status >= 200 && status < 300;
  const mock = vi.fn().mockResolvedValue({
    ok,
    status,
    statusText: 'Mock Status',
    json: () => Promise.resolve(body),
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

/** A response whose body isn't valid JSON (e.g. a proxy's plain-text
 * error page) — `response.json()` rejects. */
export function mockFetchInvalidJson(status: number): Mock {
  const mock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: 'Mock Status',
    json: () => Promise.reject(new SyntaxError('Unexpected token')),
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

/** `fetch` itself rejecting — offline, DNS failure, CORS rejection. */
export function mockFetchNetworkError(): Mock {
  const mock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
  vi.stubGlobal('fetch', mock);
  return mock;
}

/**
 * One JSON response per call, in order — for tests where a single
 * component issues more than one distinct request (e.g. pagination:
 * page 1's response, then page 2's, each with different data), unlike
 * `mockFetchJson`'s single fixed response reused for every call.
 */
export function mockFetchJsonSequence(
  responses: Array<{ status: number; body: unknown }>,
): Mock {
  const mock = vi.fn();
  for (const { status, body } of responses) {
    const ok = status >= 200 && status < 300;
    mock.mockResolvedValueOnce({
      ok,
      status,
      statusText: 'Mock Status',
      json: () => Promise.resolve(body),
    });
  }
  vi.stubGlobal('fetch', mock);
  return mock;
}

/**
 * Routes each call by its request URL and HTTP method — for tests where
 * a component fires more than one genuinely different endpoint, possibly
 * sharing the exact same URL under different methods (e.g. `GET`/`POST`/
 * `DELETE` all on `/events/:id/rsvp`), each needing its own distinct
 * response, unlike `mockFetchJson`'s one fixed response for every call
 * regardless of URL or method. Returning `'pending'` for a route gives a
 * promise that never resolves — the same deferred-promise technique used
 * elsewhere in this codebase to freeze a query in its loading state
 * deterministically.
 */
export function mockFetchByUrl(
  handler: (
    url: string,
    method: string,
  ) => { status: number; body: unknown } | 'pending',
): Mock {
  const mock = vi.fn((url: string, options?: { method?: string }) => {
    const result = handler(url, options?.method ?? 'GET');
    if (result === 'pending') {
      return new Promise<never>(() => {
        // Deliberately never resolves.
      });
    }
    const { status, body } = result;
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      statusText: 'Mock Status',
      json: () => Promise.resolve(body),
    });
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}
