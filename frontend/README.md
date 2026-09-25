# EventHub Frontend

React frontend for EventHub, consuming the [NestJS backend](../backend). Foundation and the full typed data layer (API client, domain types, feature API modules, TanStack Query hooks) are in place; feature UI (auth forms, event pages, RSVP) hasn't started yet.

Architecture, state-ownership model, TanStack Query strategy, API client design, auth design: **[`docs/specs/phase-0-architecture.md`](docs/specs/phase-0-architecture.md)**. Data layer details (API contract, query keys, invalidation strategy): **[`docs/specs/phase-2-api-layer.md`](docs/specs/phase-2-api-layer.md)**. Phase-by-phase status: **[`docs/specs/phase.md`](docs/specs/phase.md)**.

## Stack

React 19 + TypeScript (strict) + Vite · React Router 8 · TanStack Query v5 (server state) · React Hook Form + Zod (forms, not wired up yet) · Tailwind CSS v4 · URL-owned list/filter state · no global state library · ESLint + Prettier · Vitest + React Testing Library.

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
│   ├── app/               app.tsx, providers/, router/
│   ├── components/        ui primitives, layout (root-layout, error-boundary)
│   ├── config/            env.ts — the only place import.meta.env is read
│   ├── features/
│   │   ├── auth/           api/auth-api.ts, queries/{keys,options,hooks}.ts
│   │   ├── events/          api/events-api.ts, queries/{keys,options,hooks}.ts
│   │   └── rsvp/             api/rsvp-api.ts, queries/{keys,options,hooks}.ts
│   ├── lib/
│   │   ├── api/            api-client.ts, api-error.ts, auth-token.ts
│   │   └── query/           the single query-client.ts
│   ├── pages/               route-level components
│   ├── test/                 test setup, mock-fetch helper, render helpers
│   ├── types/                domain types matching the backend DTOs
│   └── main.tsx
└── .env.example
```

Every backend endpoint has a typed API function, a query key, and (for reads) a `queryOptions()` object and a hook — see `docs/specs/phase-2-api-layer.md § D`. No UI consumes them yet.
