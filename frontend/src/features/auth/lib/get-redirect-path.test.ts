import { describe, expect, it } from 'vitest';
import { getRedirectPath } from './get-redirect-path';

describe('getRedirectPath', () => {
  it('returns the preserved pathname when state has the expected shape', () => {
    expect(getRedirectPath({ from: { pathname: '/dashboard/settings' } })).toBe(
      '/dashboard/settings',
    );
  });

  it('falls back to /dashboard when there is no state', () => {
    expect(getRedirectPath(undefined)).toBe('/dashboard');
    expect(getRedirectPath(null)).toBe('/dashboard');
  });

  it('falls back to /dashboard when state has no "from"', () => {
    expect(getRedirectPath({ somethingElse: true })).toBe('/dashboard');
  });

  it('falls back to /dashboard when "from" has no pathname', () => {
    expect(getRedirectPath({ from: {} })).toBe('/dashboard');
  });

  it('falls back to /dashboard when pathname is not a string', () => {
    expect(getRedirectPath({ from: { pathname: 123 } })).toBe('/dashboard');
  });

  // Security: these are the two open-redirect shapes an attacker could try
  // to plant in history state (§ 23/§ 46) — a value that doesn't start
  // with "/" (e.g. a full external URL), and a scheme-relative
  // "//evil.com" that browsers resolve as a different host despite
  // starting with a single slash.
  it('rejects an absolute external URL', () => {
    expect(getRedirectPath({ from: { pathname: 'https://evil.com' } })).toBe(
      '/dashboard',
    );
  });

  it('rejects a scheme-relative "//host" path', () => {
    expect(getRedirectPath({ from: { pathname: '//evil.com' } })).toBe(
      '/dashboard',
    );
  });

  it('accepts a plain root path', () => {
    expect(getRedirectPath({ from: { pathname: '/' } })).toBe('/');
  });
});
