# EventHub Frontend

React frontend for EventHub, consuming the [NestJS backend](../backend). Foundation is in place (Vite, TypeScript, Tailwind, React Router, TanStack Query, a tested generic API client); feature UI (auth, events, RSVP) hasn't started yet.

Architecture, state-ownership model, TanStack Query strategy, API client design, auth design: **[`docs/specs/phase-0-architecture.md`](docs/specs/phase-0-architecture.md)**. Phase-by-phase status: **[`docs/specs/phase.md`](docs/specs/phase.md)**.

## Stack

React 19 + TypeScript (strict) + Vite · React Router 8 · TanStack Query v5 (server state) · React Hook Form + Zod (forms) · Tailwind CSS v4 · URL-owned list/filter state · no global state library · ESLint + Prettier · Vitest + React Testing Library.

## Getting started

```bash
cd frontend
npm install
cp .env.example .env   # set VITE_API_URL to your local backend (see backend/README.md)
npm run dev
```

Other scripts: `npm run build`, `npm run preview`, `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test`.

## Structure

```text
frontend/
├── docs/specs/          architecture + phase specs
├── src/
│   ├── app/              app.tsx, providers/, router/
│   ├── components/       ui primitives, layout (root-layout, error-boundary)
│   ├── config/           env.ts — the only place import.meta.env is read
│   ├── lib/
│   │   ├── api/          generic api-client.ts + api-error.ts
│   │   └── query/        the single query-client.ts
│   ├── pages/             route-level components
│   ├── test/              test setup + render helpers
│   └── main.tsx
└── .env.example
```

`src/features/` (auth, events, rsvp — domain UI, hooks, feature API calls, schemas) is introduced starting Phase 2, not created empty ahead of time.
