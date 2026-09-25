/**
 * Extracts the path `RequireAuth` stashed in `location.state.from` when it
 * redirected an unauthenticated visitor to `/login` (§ 23). Only ever
 * trusts a `pathname` string nested at exactly that shape — `state` is
 * `unknown` as far as TypeScript (and an attacker crafting history state)
 * is concerned, so this validates the shape field by field rather than
 * casting, and falls back to a fixed, safe default for anything else.
 * There is no code path here that can redirect to an attacker-supplied
 * absolute URL or a different origin — the result is always either that
 * validated same-app pathname or the literal `/dashboard`.
 */
export function getRedirectPath(state: unknown): string {
  const DEFAULT_PATH = '/dashboard';

  if (typeof state !== 'object' || state === null || !('from' in state)) {
    return DEFAULT_PATH;
  }

  const from = (state as { from?: unknown }).from;
  if (typeof from !== 'object' || from === null || !('pathname' in from)) {
    return DEFAULT_PATH;
  }

  const pathname = (from as { pathname?: unknown }).pathname;
  // `/` alone is fine; `//evil.com` is browser-parsed as a scheme-relative
  // URL to a different host, so a single leading slash isn't enough —
  // reject a second one too.
  const isSafeSameAppPath =
    typeof pathname === 'string' &&
    pathname.startsWith('/') &&
    !pathname.startsWith('//');

  return isSafeSameAppPath ? pathname : DEFAULT_PATH;
}
