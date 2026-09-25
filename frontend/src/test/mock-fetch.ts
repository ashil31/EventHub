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
