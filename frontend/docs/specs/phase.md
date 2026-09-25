# EventHub Frontend — Phase Index

Tracks the state of the frontend phase by phase, mirroring [`backend/docs/specs/phase.md`](../../../backend/docs/specs/phase.md). Each phase has its own spec file in this folder with the full detail; this file is the status overview. Update this file (and the relevant phase file) at the end of every phase.

| Phase | Title                                           | Status      | Spec                                                     |
| ----- | ----------------------------------------------- | ----------- | -------------------------------------------------------- |
| 0     | Architecture, Skills & Engineering Contract     | ✅ Complete | [phase-0-architecture.md](phase-0-architecture.md)       |
| 1     | React Production Foundation                     | ✅ Complete | [phase-1-foundation.md](phase-1-foundation.md)           |
| 2     | Typed API Layer & TanStack Query Architecture   | ✅ Complete | [phase-2-api-layer.md](phase-2-api-layer.md)             |
| 3     | Authentication & Session Architecture           | ✅ Complete | [phase-3-authentication.md](phase-3-authentication.md)   |
| 4     | Event Discovery, Search, Filtering & Pagination | ✅ Complete | [phase-4-event-discovery.md](phase-4-event-discovery.md) |

## What exists right now

- Architecture (Phase 0), project foundation (Phase 1), and the full typed API/query data layer (Phase 2) — see those specs for detail.
- **Authentication, end to end (Phase 3):** register, login, `GET /auth/me`-backed session persistence (`localStorage`, one module), protected routing (`RequireAuth`/`RedirectIfAuthenticated`), global 401 handling, and logout — all built, tested (84 tests), and manually verified in a real browser against the real local backend. Toast notifications (`sonner`) for login/register/logout outcomes. New pages: `/login`, `/register`, `/dashboard` (the one protected placeholder this phase needed). New design-system primitives: `Card`, `Input`, `Label`, `Field`, `Spinner`.
- A real, since-fixed bug worth knowing about: logging out didn't update already-mounted components immediately because `queryClient.removeQueries()` doesn't notify existing observers — see [phase-3-authentication.md § L #1](phase-3-authentication.md#l-problems-found) if touching `useLogout`/`installAuthErrorHandling` again.
- **Event discovery, end to end (Phase 4):** the public `/events` page — search (debounced, URL-owned), an "Upcoming"/"All events" timeframe toggle, pagination (backend's `page`/`totalPages` contract, with `placeholderData: keepPreviousData` for a smooth page-to-page transition), and loading/error/empty states — all built on the existing Phase 2 `useEvents` hook with no changes to its signature. 47 new tests (131 total), manually verified against the real local backend. No event detail page yet — cards don't link anywhere since `/events/:id` doesn't exist.
- No event detail/create/edit/RSVP UI yet. The data-layer hooks for all of that (Phase 2) already exist and are already authenticated automatically.

## What's next

Phase 5 (not yet scoped in a brief): the event detail page (`/events/:id`), using the existing `useEvent(eventId)` hook, plus attendee information — after which `EventCard` can be revisited to actually link somewhere.
