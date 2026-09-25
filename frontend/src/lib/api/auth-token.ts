/**
 * The one place the access token is stored (Phase 0 § G's decision,
 * implemented here in Phase 2 since the auth API/mutation hooks need a
 * real place to put/read it). `localStorage`, not memory-only: the
 * backend has no cookie-based session and no `/auth/refresh` endpoint
 * (confirmed — `LoginResponseDto` returns only `accessToken` +
 * `expiresIn` in the JSON body), so memory-only storage would log the
 * user out on every page reload with no way to recover silently.
 * Accepted trade-off: vulnerable to token theft via XSS, mitigated by
 * React's default JSX escaping (no `dangerouslySetInnerHTML` anywhere in
 * this codebase), the backend's `helmet()` CSP, and the token's own short
 * `JWT_EXPIRES_IN` lifetime.
 *
 * A plain module, not a React context — `api-client.ts` needs to read the
 * current token synchronously on every request, outside of React. This is
 * the ONLY place that reads/writes it; nothing else should touch
 * `localStorage` for auth, and no feature hook should construct an
 * `Authorization` header itself (§ 12).
 *
 * The in-memory `token` variable (not a `localStorage.getItem()` call on
 * every read) is the source of truth during the session — `localStorage`
 * is only the persistence layer, read once at module load.
 */
const STORAGE_KEY = 'eventhub.accessToken';

let token: string | null = readFromStorage();

function readFromStorage(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private browsing / storage disabled — fail open to "logged out"
    // rather than throwing during module initialization.
    return null;
  }
}

export function getAuthToken(): string | null {
  return token;
}

export function setAuthToken(newToken: string): void {
  token = newToken;
  try {
    window.localStorage.setItem(STORAGE_KEY, newToken);
  } catch {
    // Storage unavailable — the in-memory copy still makes the current
    // tab work; it just won't survive a reload.
  }
}

export function clearAuthToken(): void {
  token = null;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // No stored value to clear.
  }
}
