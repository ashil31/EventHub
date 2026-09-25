# EventHub Frontend

React frontend for EventHub, consuming the [NestJS backend](../backend). Foundation, the typed data layer, full authentication, public event discovery + detail, RSVP (join/cancel, server-authoritative), and event creation/editing/deletion (ownership-aware) are all in place; attendee-management/admin UI hasn't started (and isn't in this project's scope).

Architecture, state-ownership model, TanStack Query strategy, API client design: **[`docs/specs/phase-0-architecture.md`](docs/specs/phase-0-architecture.md)**. Data layer details: **[`docs/specs/phase-2-api-layer.md`](docs/specs/phase-2-api-layer.md)**. Authentication architecture: **[`docs/specs/phase-3-authentication.md`](docs/specs/phase-3-authentication.md)**. Event discovery architecture: **[`docs/specs/phase-4-event-discovery.md`](docs/specs/phase-4-event-discovery.md)**. Event detail architecture: **[`docs/specs/phase-5-event-detail.md`](docs/specs/phase-5-event-detail.md)**. RSVP architecture: **[`docs/specs/phase-6-rsvp.md`](docs/specs/phase-6-rsvp.md)**. Event creation/management architecture: **[`docs/specs/phase-7-event-management.md`](docs/specs/phase-7-event-management.md)**. Phase-by-phase status: **[`docs/specs/phase.md`](docs/specs/phase.md)**.

## Stack

React 19 + TypeScript (strict) + Vite · React Router 8 · TanStack Query v5 (server state) · React Hook Form + Zod (forms) · Tailwind CSS v4 · Sonner (toasts) · URL-owned list/filter state · no global state library · ESLint + Prettier · Vitest + React Testing Library.

## Getting started

```bash
cd frontend
npm install
cp .env.example .env   # set VITE_API_URL to your local backend (see backend/README.md)
npm run dev
```

Then visit `/register` to create an account, `/login` to sign in, `/dashboard` to see the protected placeholder page, and `/events` to browse, search, filter, and paginate events — click any event to see its detail page, RSVP, or (if you're signed in) edit/delete it if you created it; "Create event" on the events page opens `/events/new` (signing in is only required for the actions that need it, not for browsing).

Other scripts: `npm run build`, `npm run preview`, `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test`.

## Structure

```text
frontend/
├── docs/specs/          architecture + phase specs
├── src/
│   ├── app/               app.tsx (+ Toaster), providers/ (+ 401 handler wiring), router/
│   ├── components/        ui primitives (button, input, textarea-field, label, field,
│   │                        card, spinner, dialog), layout (root-layout, error-boundary)
│   ├── config/            env.ts — the only place import.meta.env is read
│   ├── features/
│   │   ├── auth/           api/, queries/{keys,options,hooks}.ts, schemas/,
│   │   │                    components/ (forms + route boundaries), lib/ (error
│   │   │                    mapping, redirect-path safety, global 401 handling)
│   │   ├── events/          api/events-api.ts, queries/{keys,options,hooks}.ts,
│   │   │                     hooks/use-event-filters.ts, schemas/event-schema.ts,
│   │   │                     lib/ (URL params, date formatting/parsing, form
│   │   │                     transforms, error messages), components/ (card, list,
│   │   │                     search, timeframe toggle, pagination, loading/error/
│   │   │                     empty, detail header/meta/skeleton/error/not-found/
│   │   │                     actions, event-form, delete-event-dialog)
│   │   └── rsvp/             api/rsvp-api.ts, queries/{keys,options,hooks}.ts,
│   │                          hooks/use-event-rsvp-state.ts, lib/error-messages.ts,
│   │                          components/event-rsvp-panel.tsx
│   ├── lib/
│   │   ├── api/            api-client.ts, api-error.ts, auth-token.ts (the one
│   │   │                    place credentials are stored/read)
│   │   └── query/           the single query-client.ts
│   ├── pages/               route-level components (home, login, register,
│   │                          dashboard, events, event-detail, create-event,
│   │                          edit-event, not-found)
│   ├── test/                 test setup, mock-fetch helper, render helpers
│   ├── types/                domain types matching the backend DTOs
│   └── main.tsx
└── .env.example
```

Every backend endpoint has a typed API function, a query key, and a hook (Phase 2). Auth (Phase 3), public event discovery (Phase 4), event detail (Phase 5), RSVP (Phase 6), and event creation/editing/deletion (Phase 7) are all fully wired through real UI. Attendee-management/admin UI is not in this project's scope.
