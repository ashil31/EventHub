/**
 * The JWT payload this app issues and expects. Only `sub` (the canonical
 * user identifier) — no email, no roles, no anything that could go stale
 * or that isn't needed to look the user up. `iat`/`exp` are added
 * automatically by the JWT library and aren't declared here.
 */
export interface JwtPayload {
  sub: string;
}
