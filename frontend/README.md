# EventHub Frontend

React frontend for EventHub, consuming the [NestJS backend](../backend). Not implemented yet — this directory currently holds only the architecture spec.

Full architecture, state-ownership model, TanStack Query strategy, API client design, auth design, and the exact Phase 1 scope: **[`docs/specs/phase-0-architecture.md`](docs/specs/phase-0-architecture.md)**. Phase-by-phase status: **[`docs/specs/phase.md`](docs/specs/phase.md)**.

## Planned stack

React + TypeScript + Vite · React Router · TanStack Query v5 (server state) · React Hook Form + Zod (forms) · Tailwind CSS · URL-owned list/filter state · no global state library.

## Planned structure

```text
frontend/
├── docs/specs/    architecture + phase specs
├── src/
│   ├── app/       providers, router
│   ├── features/  auth, events, rsvp — domain UI, hooks, API calls, schemas
│   ├── components/ ui primitives, layout, feedback
│   ├── lib/       api client, query client, utils
│   ├── types/     domain types matching backend DTOs
│   └── pages/     route-level components
└── .env.example
```
