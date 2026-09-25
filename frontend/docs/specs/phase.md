# EventHub Frontend — Phase Index

Tracks the state of the frontend phase by phase, mirroring [`backend/docs/specs/phase.md`](../../../backend/docs/specs/phase.md). Each phase has its own spec file in this folder with the full detail; this file is the status overview. Update this file (and the relevant phase file) at the end of every phase.

| Phase | Title                                         | Status         | Spec                                               |
| ----- | --------------------------------------------- | -------------- | -------------------------------------------------- |
| 0     | Architecture, Skills & Engineering Contract   | ✅ Complete    | [phase-0-architecture.md](phase-0-architecture.md) |
| 1     | React Production Foundation                   | ✅ Complete    | [phase-1-foundation.md](phase-1-foundation.md)     |
| 2     | Typed API Layer & TanStack Query Architecture | ⬜ Not started | —                                                  |

## What exists right now

- Architecture decided (Phase 0): React + TypeScript + Vite, React Router, TanStack Query v5 for all server state, React Hook Form + Zod for forms, URL for list/filter state, Tailwind CSS. No global state library.
- Full API contract mapped against the actual backend implementation, with two corrections vs. the brief's assumed contract — see [phase-0-architecture.md § J](phase-0-architecture.md#j-nestjs--react-integration).
- Working, validated project foundation (Phase 1): Vite + React 19 + TypeScript (strict) + Tailwind v4 + React Router + a single `QueryClient` with EventHub-reasoned defaults + a generic, tested `apiClient`/`ApiError` + ESLint (flat config, typescript-eslint/react-hooks/jsx-a11y/`@tanstack/eslint-plugin-query`) + Prettier + Vitest/RTL. `npm run dev`, `build`, `preview`, `lint`, `format:check`, `typecheck`, and `test` all pass. No feature code (auth, events, RSVP) yet.

## What's next

Phase 2: the typed API/data layer — domain types matching the real backend DTOs, feature API modules (`auth-api.ts`, `events-api.ts`, `rsvp-api.ts`) on top of `apiClient`, query-key factories + query-options objects, and the custom hooks (`useEvents`, `useEvent`, `useCurrentUser`, `useRsvp`, etc.) that compose them. Still no polished UI — see [phase-1-foundation.md § L](phase-1-foundation.md#l-phase-2-preparation).
