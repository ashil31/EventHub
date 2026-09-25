# EventHub Frontend — Phase Index

Tracks the state of the frontend phase by phase, mirroring [`backend/docs/specs/phase.md`](../../../backend/docs/specs/phase.md). Each phase has its own spec file in this folder with the full detail; this file is the status overview. Update this file (and the relevant phase file) at the end of every phase.

| Phase | Title                                         | Status      | Spec                                               |
| ----- | --------------------------------------------- | ----------- | -------------------------------------------------- |
| 0     | Architecture, Skills & Engineering Contract   | ✅ Complete | [phase-0-architecture.md](phase-0-architecture.md) |
| 1     | React Production Foundation                   | ✅ Complete | [phase-1-foundation.md](phase-1-foundation.md)     |
| 2     | Typed API Layer & TanStack Query Architecture | ✅ Complete | [phase-2-api-layer.md](phase-2-api-layer.md)       |

## What exists right now

- Architecture decided (Phase 0), working project foundation (Phase 1): Vite + React 19 + strict TypeScript + Tailwind v4 + React Router + a single `QueryClient` + a generic, tested `apiClient`/`ApiError`.
- Full typed data layer (Phase 2): domain types matching the real backend DTOs (`src/types/`), feature API modules (`src/features/{auth,events,rsvp}/api/`), query-key factories + `queryOptions()` objects, and every custom hook a future page needs (`useEvents`, `useEvent`, `useCurrentUser`, `useLogin`, `useRegister`, `useLogout`, `useCreateEvent`, `useUpdateEvent`, `useDeleteEvent`, `useEventAttendees`, `useRsvp`, `useCancelRsvp`) — all built directly against the verified backend contract, with three real discrepancies found and corrected along the way (see [phase-2-api-layer.md § D](phase-2-api-layer.md#d-api-contract-all-frontend-api-functions-verified-against-the-real-backend-source--not-the-briefs-illustrative-contract) and [§ O](phase-2-api-layer.md#o-problems-found)). Real token storage (`localStorage`, one module) now wired into the API client. 37 tests passing across 9 files; `dev`/`build`/`preview`/`lint`/`format:check`/`typecheck`/`test` all verified.
- No feature UI yet — no login/register forms, no event list/detail pages, no RSVP buttons.

## What's next

Phase 3: real UI on top of this data layer — auth forms (React Hook Form + Zod), an event list page with URL-owned filters, an event detail page, create/edit event forms, and RSVP actions — built entirely by composing the hooks Phase 2 already proved, per [phase-2-api-layer.md § P](phase-2-api-layer.md#p-phase-3-preparation).
