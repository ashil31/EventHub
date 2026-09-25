# EventHub Frontend — Phase Index

Tracks the state of the frontend phase by phase, mirroring [`backend/docs/specs/phase.md`](../../../backend/docs/specs/phase.md). Each phase has its own spec file in this folder with the full detail; this file is the status overview. Update this file (and the relevant phase file) at the end of every phase.

| Phase | Title                                           | Status      | Spec                                                     |
| ----- | ----------------------------------------------- | ----------- | -------------------------------------------------------- |
| 0     | Architecture, Skills & Engineering Contract     | ✅ Complete | [phase-0-architecture.md](phase-0-architecture.md)       |
| 1     | React Production Foundation                     | ✅ Complete | [phase-1-foundation.md](phase-1-foundation.md)           |
| 2     | Typed API Layer & TanStack Query Architecture   | ✅ Complete | [phase-2-api-layer.md](phase-2-api-layer.md)             |
| 3     | Authentication & Session Architecture           | ✅ Complete | [phase-3-authentication.md](phase-3-authentication.md)   |
| 4     | Event Discovery, Search, Filtering & Pagination | ✅ Complete | [phase-4-event-discovery.md](phase-4-event-discovery.md) |
| 5     | Event Detail & Event Information                | ✅ Complete | [phase-5-event-detail.md](phase-5-event-detail.md)       |
| 6     | RSVP / Join Event Experience                    | ✅ Complete | [phase-6-rsvp.md](phase-6-rsvp.md)                       |

## What exists right now

- Architecture (Phase 0), project foundation (Phase 1), and the full typed API/query data layer (Phase 2) — see those specs for detail.
- **Authentication, end to end (Phase 3):** register, login, `GET /auth/me`-backed session persistence (`localStorage`, one module), protected routing (`RequireAuth`/`RedirectIfAuthenticated`), global 401 handling, and logout — all built, tested (84 tests), and manually verified in a real browser against the real local backend. Toast notifications (`sonner`) for login/register/logout outcomes. New pages: `/login`, `/register`, `/dashboard` (the one protected placeholder this phase needed). New design-system primitives: `Card`, `Input`, `Label`, `Field`, `Spinner`.
- A real, since-fixed bug worth knowing about: logging out didn't update already-mounted components immediately because `queryClient.removeQueries()` doesn't notify existing observers — see [phase-3-authentication.md § L #1](phase-3-authentication.md#l-problems-found) if touching `useLogout`/`installAuthErrorHandling` again.
- **Event discovery, end to end (Phase 4):** the public `/events` page — search (debounced, URL-owned), an "Upcoming"/"All events" timeframe toggle, pagination (backend's `page`/`totalPages` contract, with `placeholderData: keepPreviousData` for a smooth page-to-page transition), and loading/error/empty states — all built on the existing Phase 2 `useEvents` hook with no changes to its signature. 47 new tests, manually verified against the real local backend.
- **Event detail, end to end (Phase 5):** the public `/events/:eventId` page — title, date/location/attendee/host metadata, description, and dedicated loading/not-found/error states — built entirely on the existing Phase 2 `useEvent` hook with no changes to its signature. Event cards now link to it (stretched-link pattern). A 400 (malformed id, from the backend's `ParseUUIDPipe`) is deliberately treated the same as a real 404 — see [phase-5-event-detail.md § F](phase-5-event-detail.md#f-loadingerrornot-found) before changing that logic. 15 new tests (146 total), manually verified against the real local backend including a real 404, a real 400, and a 375px mobile viewport.
- **RSVP / Join Event, end to end (Phase 6):** the event detail page's RSVP panel — Join/Cancel actions, auth-aware ("Sign in to RSVP" with the event preserved as the post-login destination), server-authoritative (no client-side capacity math, no optimistic status), with distinct copy for full/duplicate/expired-session/not-found/network failures. Required one small, deliberately minimal backend addition — `GET /events/:id/rsvp` (current user's own attending/joinedAt status) — since no existing endpoint could answer that without paginating the attendee list; see [phase-6-rsvp.md § B](phase-6-rsvp.md#b-backend-contract) and [backend/docs/specs/phase-5-rsvp.md's Addendum](../../backend/docs/specs/phase-5-rsvp.md#addendum--get-eventsidrsvp-added-during-frontend-phase-6). Also fixed a real, previously-invisible bug in `RedirectIfAuthenticated` (a login-redirect race that always happened to land on `/dashboard` anyway until this phase's flow could target a different page) — see [phase-6-rsvp.md § I](phase-6-rsvp.md#i-a-real-bug-found-and-fixed--redirectifauthenticateds-redirect-race) before touching that component or `getRedirectPath` again. 32 new tests (178 total), manually verified end to end against the real local backend including a real 409 capacity-full rejection from a second real user.
- No create/edit/attendee-management UI yet. The data-layer hooks for creating/editing events (Phase 2) already exist and are already authenticated automatically.

## What's next

Phase 7 (not yet scoped in a brief): event creation and ownership-based event management.
