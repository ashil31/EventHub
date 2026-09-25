# EventHub Frontend

React frontend for EventHub, consuming the [NestJS backend](../backend). Foundation, the typed data layer, and full authentication (register/login/session persistence/protected routes/logout) are in place; event UI (list/detail pages, create/edit forms, RSVP) hasn't started yet.

Architecture, state-ownership model, TanStack Query strategy, API client design: **[`docs/specs/phase-0-architecture.md`](docs/specs/phase-0-architecture.md)**. Data layer details: **[`docs/specs/phase-2-api-layer.md`](docs/specs/phase-2-api-layer.md)**. Authentication architecture: **[`docs/specs/phase-3-authentication.md`](docs/specs/phase-3-authentication.md)**. Phase-by-phase status: **[`docs/specs/phase.md`](docs/specs/phase.md)**.

## Stack

React 19 + TypeScript (strict) + Vite · React Router 8 · TanStack Query v5 (server state) · React Hook Form + Zod (forms) · Tailwind CSS v4 · Sonner (toasts) · URL-owned list/filter state · no global state library · ESLint + Prettier · Vitest + React Testing Library.

## Getting started

```bash
cd frontend
npm install
cp .env.example .env   # set VITE_API_URL to your local backend (see backend/README.md)
npm run dev
```

Then visit `/register` to create an account, `/login` to sign in, and `/dashboard` to see the protected placeholder page.

Other scripts: `npm run build`, `npm run preview`, `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test`.

## Structure

```text
frontend/
├── docs/specs/          architecture + phase specs
├── src/
│   ├── app/               app.tsx (+ Toaster), providers/ (+ 401 handler wiring), router/
│   ├── components/        ui primitives (button, input, label, field, card, spinner),
│   │                        layout (root-layout, error-boundary)
│   ├── config/            env.ts — the only place import.meta.env is read
│   ├── features/
│   │   ├── auth/           api/, queries/{keys,options,hooks}.ts, schemas/,
│   │   │                    components/ (forms + route boundaries), lib/ (error
│   │   │                    mapping, redirect-path safety, global 401 handling)
│   │   ├── events/          api/events-api.ts, queries/{keys,options,hooks}.ts
│   │   └── rsvp/             api/rsvp-api.ts, queries/{keys,options,hooks}.ts
│   ├── lib/
│   │   ├── api/            api-client.ts, api-error.ts, auth-token.ts (the one
│   │   │                    place credentials are stored/read)
│   │   └── query/           the single query-client.ts
│   ├── pages/               route-level components (home, login, register,
│   │                          dashboard, not-found)
│   ├── test/                 test setup, mock-fetch helper, render helpers
│   ├── types/                domain types matching the backend DTOs
│   └── main.tsx
└── .env.example
```

Every backend endpoint has a typed API function, a query key, and a hook (Phase 2). Auth is fully wired through real UI (Phase 3). Event UI is next.
