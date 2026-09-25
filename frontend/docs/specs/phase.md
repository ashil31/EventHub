# EventHub Frontend — Phase Index

Tracks the state of the frontend phase by phase, mirroring [`backend/docs/specs/phase.md`](../../../backend/docs/specs/phase.md). Each phase has its own spec file in this folder with the full detail; this file is the status overview. Update this file (and the relevant phase file) at the end of every phase.

| Phase | Title | Status | Spec |
|---|---|---|---|
| 0 | Architecture, Skills & Engineering Contract | ✅ Complete | [phase-0-architecture.md](phase-0-architecture.md) |
| 1 | Project Foundation (tooling, routing, API client, design-system primitives) | ⬜ Not started | — |

## What exists right now

- Architecture decided: React + TypeScript + Vite, React Router, TanStack Query v5 for all server state, React Hook Form + Zod for forms, URL for list/filter state, Tailwind CSS. No global state library (Redux/Zustand) — nothing in the contract needs one.
- Full API contract mapped against the actual backend implementation (not just the assumed contract in the brief) — see [phase-0-architecture.md § J](phase-0-architecture.md#j-nestjs--react-integration) for two corrections found: `GET /events/:id/attendees` requires auth (the backend's own Phase-0 doc once said public), and `POST /auth/register` does not return a token.
- Token-storage decision made and documented (`localStorage`, behind a single module, given the backend has no cookie/refresh-token support) — see § G.
- No code written yet. `frontend/` currently contains only `docs/`.

## What's next

Phase 1: initialize the actual Vite project and wire the foundation described in [phase-0-architecture.md § K](phase-0-architecture.md#k-phase-1-plan) — tooling, routing shell, API client skeleton, domain types, and design-system primitives. No feature UI (auth forms, event CRUD, RSVP) until Phase 2+.
