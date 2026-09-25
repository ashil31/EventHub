# EventHub Frontend — Phase Index

Tracks the state of the frontend phase by phase, mirroring [`backend/docs/specs/phase.md`](../../../backend/docs/specs/phase.md). Each phase has its own spec file in this folder with the full detail; this file is the status overview. Update this file (and the relevant phase file) at the end of every phase.

| Phase | Title                                         | Status      | Spec                                                   |
| ----- | --------------------------------------------- | ----------- | ------------------------------------------------------ |
| 0     | Architecture, Skills & Engineering Contract   | ✅ Complete | [phase-0-architecture.md](phase-0-architecture.md)     |
| 1     | React Production Foundation                   | ✅ Complete | [phase-1-foundation.md](phase-1-foundation.md)         |
| 2     | Typed API Layer & TanStack Query Architecture | ✅ Complete | [phase-2-api-layer.md](phase-2-api-layer.md)           |
| 3     | Authentication & Session Architecture         | ✅ Complete | [phase-3-authentication.md](phase-3-authentication.md) |

## What exists right now

- Architecture (Phase 0), project foundation (Phase 1), and the full typed API/query data layer (Phase 2) — see those specs for detail.
- **Authentication, end to end (Phase 3):** register, login, `GET /auth/me`-backed session persistence (`localStorage`, one module), protected routing (`RequireAuth`/`RedirectIfAuthenticated`), global 401 handling, and logout — all built, tested (84 tests), and manually verified in a real browser against the real local backend. Toast notifications (`sonner`) for login/register/logout outcomes. New pages: `/login`, `/register`, `/dashboard` (the one protected placeholder this phase needed). New design-system primitives: `Card`, `Input`, `Label`, `Field`, `Spinner`.
- A real, since-fixed bug worth knowing about: logging out didn't update already-mounted components immediately because `queryClient.removeQueries()` doesn't notify existing observers — see [phase-3-authentication.md § L #1](phase-3-authentication.md#l-problems-found) if touching `useLogout`/`installAuthErrorHandling` again.
- No event functionality yet — no event list/detail pages, no create/edit forms, no RSVP UI. The data-layer hooks for all of that (Phase 2) already exist and are already authenticated automatically.

## What's next

Phase 4 (not yet scoped in a brief): event UI — list/detail pages, create/edit forms, RSVP actions — built by composing Phase 2's existing hooks and this phase's design-system primitives, with `RequireAuth` wrapping whichever pages need a signed-in user.
