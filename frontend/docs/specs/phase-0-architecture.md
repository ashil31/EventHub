# Phase 0 — Frontend Architecture, Skills & Engineering Contract

Status: **Complete.** No application code was written in this phase — architecture and requirements analysis only, mirroring how the backend's [`phase-0-architecture.md`](../../../backend/docs/specs/phase-0-architecture.md) worked.

## React Best-Practices Skill Assessment

The installed `vercel-react-best-practices` skill (Vercel Engineering, 70 rules across 8 categories: `async-`, `bundle-`, `server-`, `client-`, `rerender-`, `rendering-`, `js-`, `advanced-`) was inspected (`SKILL.md`, category index, and the individual rule files relevant to a client-rendered SPA). Most of the skill targets Next.js/RSC specifically (`server-*`, most of `bundle-*`'s dynamic-import-for-route guidance, `rendering-hydration-*`); this project is a Vite SPA with no server components, so those rules apply only where their underlying principle transfers. Rules that concretely shape this build:

- **`async-parallel`** — independent requests (e.g. an event detail page's event + attendees) must fire together, not be awaited sequentially. TanStack Query's per-hook `useQuery` calls are independent by construction — no manual `Promise.all` needed, but component code must call the hooks side by side, not nest one inside the other's `onSuccess`.
- **`bundle-barrel-imports`** — import icons/utilities directly from their module, never through a package's barrel `index.ts` (e.g. `lucide-react/dist/esm/icons/calendar` semantics via named import, not `import * as Icons`).
- **`bundle-dynamic-imports`** — route-level code splitting via `React.lazy` for every page component; the router shell stays small.
- **`client-swr-dedup`** — the skill's stated principle (automatic request deduplication for client-fetched data) is what TanStack Query provides natively; no separate library needed, this is the reason Query was mandated in the prompt instead of raw `fetch`-in-`useEffect`.
- **`rerender-derived-state-no-effect`** — derive UI state (e.g. "is this event full") from query data during render, never copy query data into `useState` inside an effect.
- **`rerender-no-inline-components`** — no component definitions inside another component's render body (a real risk in list-item renderers like `EventCard` inside `EventList`).
- **`rerender-functional-setstate`** / **`rerender-move-effect-to-event`** — local UI state (modals, dropdowns) updates via event handlers and functional `setState`, not effects reacting to other state.
- **`rendering-conditional-render`** — ternaries for loading/error/empty/success branches, not `&&` chains that can render a stray `0` or `""`.
- **`js-early-exit`** — API client and validation helpers return/throw early rather than nesting.
- **`advanced-init-once`** — the `QueryClient` and the router are constructed exactly once, at module scope in `app/`, never inside a component.

**Deliberate non-applications:** `server-*` (no RSC/SSR in this stack), `rendering-hydration-*` (no server-rendered HTML to hydrate), `bundle-analyzable-paths`'s Next.js-route-manifest framing (Vite's own bundler handles path analysis; the transferable principle — static, literal import paths over computed ones — is still followed).

## A. Frontend Architecture

```
Browser
  → React Router (URL owns route + search-param state)
      → Page component (composes feature components; owns loading/error/empty branching)
          → Feature components (features/events, features/auth, features/rsvp)
              → Custom hooks (useEvents, useEvent, useCreateEvent, …)
                  → TanStack Query (cache, dedup, invalidation, retry)
                      → lib/api/* (typed request functions)
                          → lib/api/client.ts (fetch wrapper: base URL, JSON, auth header, error normalization)
                              → NestJS API (api/v1, JWT bearer auth)
```

Three independent state systems, each with exactly one owner (§ C below): **TanStack Query** (server state), **URL** (list filters/pagination), **React Hook Form** (in-progress form input). `useState` is left for genuinely local, transient UI state only. No Redux/Zustand/global store — nothing in this contract needs one (§ 24 of the brief); the current-user session is server state and TanStack Query owns it (§ G).

## B. Folder Structure

```
frontend/
├── docs/
│   └── specs/                  phase-by-phase spec files (this file, phase.md index)
├── public/
├── src/
│   ├── app/
│   │   ├── providers/
│   │   │   ├── QueryProvider.tsx      QueryClient instance + <QueryClientProvider>
│   │   │   └── AppProviders.tsx       composes all app-wide providers
│   │   ├── router/
│   │   │   └── router.tsx             route table, lazy page imports, protected-route wrapper
│   │   └── App.tsx
│   │
│   ├── features/
│   │   ├── auth/
│   │   │   ├── api.ts                 register/login/me request functions
│   │   │   ├── hooks.ts               useLogin, useRegister, useCurrentUser, useLogout
│   │   │   ├── schemas.ts             loginSchema, registerSchema (Zod)
│   │   │   └── components/            LoginForm, RegisterForm
│   │   ├── events/
│   │   │   ├── api.ts
│   │   │   ├── hooks.ts               useEvents, useEvent, useCreateEvent, useUpdateEvent, useDeleteEvent
│   │   │   ├── schemas.ts             createEventSchema, updateEventSchema
│   │   │   ├── keys.ts                events query-key factory
│   │   │   └── components/            EventCard, EventList, EventForm, EventFilters
│   │   └── rsvp/
│   │       ├── api.ts
│   │       ├── hooks.ts               useRsvp, useCancelRsvp, useAttendees
│   │       ├── keys.ts                attendees query-key factory
│   │       └── components/            RsvpButton, AttendeeList
│   │
│   ├── components/
│   │   ├── ui/                        Button, Input, Textarea, Select, Card, Badge, Dialog, Spinner, Skeleton
│   │   ├── layout/                    AppShell, Header, Nav, ProtectedRoute
│   │   └── feedback/                  EmptyState, ErrorState, Toast
│   │
│   ├── lib/
│   │   ├── api/
│   │   │   ├── client.ts              fetch wrapper: base URL, JSON, auth header, error normalization
│   │   │   ├── errors.ts              APIError class + normalizeError()
│   │   │   └── auth-token.ts          non-React token store (get/set/clear), read by client.ts
│   │   ├── query/
│   │   │   └── queryClient.ts         single QueryClient instance + default options
│   │   └── utils/                     date formatting, cn() class merge, etc.
│   │
│   ├── types/
│   │   ├── user.ts                    User, UserSummary
│   │   ├── event.ts                   Event, PaginatedEvents
│   │   ├── attendee.ts                Attendee, PaginatedAttendees, RsvpResult
│   │   └── auth.ts                    LoginResponse
│   │
│   ├── pages/
│   │   ├── EventsPage.tsx
│   │   ├── EventDetailPage.tsx
│   │   ├── CreateEventPage.tsx
│   │   ├── EditEventPage.tsx
│   │   ├── LoginPage.tsx
│   │   ├── RegisterPage.tsx
│   │   ├── DashboardPage.tsx
│   │   └── NotFoundPage.tsx
│   │
│   ├── styles/
│   │   └── index.css                  Tailwind entry + design tokens
│   │
│   └── main.tsx
│
├── .env.example
├── index.html
├── vite.config.ts
├── tsconfig.json
├── eslint.config.js
├── tailwind.config.ts
└── package.json
```

Deliberately **not** doing `components/EventList/EventCard/EventButton/EventWrapper` — every component in `features/*/components` earns its place by owning real domain UI, not by wrapping one HTML element (§ 13/14 of the brief).

## C. State Ownership

| State                                  | Owner                                                                 |
| -------------------------------------- | --------------------------------------------------------------------- |
| Events list                            | TanStack Query                                                        |
| Event detail                           | TanStack Query                                                        |
| Attendees list                         | TanStack Query                                                        |
| Current user (`auth.me`)               | TanStack Query                                                        |
| Login form fields                      | React Hook Form                                                       |
| Register form fields                   | React Hook Form                                                       |
| Create/edit event form fields          | React Hook Form                                                       |
| Search text                            | URL (`?search=`)                                                      |
| Page number                            | URL (`?page=`)                                                        |
| Date filters (`from`/`to`)             | URL (`?from=&to=`)                                                    |
| Access token (raw string)              | Module-level store (`lib/api/auth-token.ts`), outside React — see § G |
| Modal/dialog open                      | React `useState`, local to the component that owns the dialog         |
| Mobile nav open                        | React `useState`, local to `AppShell`                                 |
| RSVP button pending/optimistic-disable | TanStack Query mutation state (`isPending`), not separate `useState`  |
| Delete-confirmation dialog             | React `useState`, local to the triggering component                   |

## D. TanStack Query Strategy

**Query keys** — one factory per feature, colocated with that feature's hooks, never a raw array literal typed out again in a component:

```ts
// features/events/keys.ts
export const eventKeys = {
  all: ['events'] as const,
  lists: () => [...eventKeys.all, 'list'] as const,
  list: (filters: EventListFilters) => [...eventKeys.lists(), filters] as const,
  details: () => [...eventKeys.all, 'detail'] as const,
  detail: (id: string) => [...eventKeys.details(), id] as const,
};

// features/rsvp/keys.ts
export const attendeeKeys = {
  all: ['attendees'] as const,
  list: (eventId: string, page: number) =>
    [...attendeeKeys.all, eventId, page] as const,
};

// features/auth/keys.ts
export const authKeys = { me: ['auth', 'me'] as const };
```

`filters` is the exact parsed URL-search object (`{ page, limit, search, from, to }`) — since it's already the single source of truth for "what am I looking at," it doubles as the cache key with no duplication.

**Query options** — each feature exposes a `*Options()` function (TanStack Query v5's `queryOptions()` helper) rather than inlining `queryKey`/`queryFn` in the hook, so the same options object works in a `useQuery` call and in `queryClient.prefetchQuery`/`ensureQueryData` identically.

**Mutations and invalidation** (targeted, never `queryClient.invalidateQueries()` with no key — § 7 of the brief):

| Mutation     | Effect                                                                                                                                                                                                                                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create event | Invalidate `eventKeys.lists()` (new item may appear in any filtered list)                                                                                                                                                                                                                                  |
| Update event | `setQueryData(eventKeys.detail(id), response)` with the mutation's response (backend returns the full updated entity), then invalidate `eventKeys.lists()`                                                                                                                                                 |
| Delete event | Remove `eventKeys.detail(id)` via `removeQueries`, invalidate `eventKeys.lists()`                                                                                                                                                                                                                          |
| RSVP (join)  | Backend's `RsvpResponseDto` carries `attendeeCount`/`availableSpots` but not a full `EventResponseDto`, so it can't replace the event-detail cache directly — invalidate `eventKeys.detail(id)` and `attendeeKeys.list(id, *)` (prefix invalidation via `predicate`, since the attendee list is paginated) |
| Cancel RSVP  | `DELETE /events/:id/rsvp` returns `204 No Content` (verified against `rsvp.controller.ts:57-71` — no body to merge), so this is invalidation-only: `eventKeys.detail(id)` + `attendeeKeys.list(id, *)`                                                                                                     |

No normalized global cache, no manual cross-entity syncing — invalidation is the mechanism, `setQueryData` only where a mutation response is provably the authoritative full entity (update-event only).

**Stale time / retry** — EventHub is not live-ticking data (§ 8 of the brief: "events are not financial tick data"):

- Default `staleTime`: 60s. Fresh enough that navigating back to a list right after leaving it doesn't refetch, stale enough that a stale attendee count after someone else RSVPs isn't visible for long — closed by mutation-driven invalidation anyway, not by polling.
- No `refetchInterval` anywhere. No background polling. `refetchOnWindowFocus: true` (default) is kept — cheap, and it's exactly when a stale RSVP count is most likely to matter (user tabs back after being away).
- `retry`: queries retry once on failure, but a custom `retry` function short-circuits (no retry) for any `APIError` with a 4xx status — a 404/401/409 will not resolve itself by asking again. Only network failures / 5xx get the single retry.
- Mutations: `retry: false` by default. A `POST /events/:id/rsvp` retried automatically after a timeout could double-submit against an endpoint that isn't purely idempotent from the client's perspective (though the backend's unique constraint makes a genuine duplicate safe — it 409s — an automatic retry is still surprising UX). Manual retry stays a user action (re-click the button), surfaced by the mutation's `isError` state.

**Error handling** — every `useQuery`/`useMutation` call site gets its error typed as `APIError` (declared once via the `QueryClient`'s generic defaults), so components branch on `error.status`/`error.code` without re-parsing the response shape each time.

## E. API Client Design

```
Component
  → feature hook (useEvents, useCreateEvent, …)
    → feature api.ts function (listEvents(filters), createEvent(dto), …)
      → lib/api/client.ts: request<T>(path, options)
        → fetch(`${API_URL}${path}`, { headers: { Authorization, Content-Type }, ...options })
        → response.ok ? response.json() as T : throw APIError.fromResponse(response)
      → NestJS API
```

`client.ts` responsibilities (and nothing else — no caching, no retry logic; that's TanStack Query's job):

- Base URL from `import.meta.env.VITE_API_URL`, never hardcoded.
- Attaches `Authorization: Bearer <token>` when `auth-token.ts` has a token; omits the header entirely when it doesn't (never sends `Bearer null`/`Bearer undefined`).
- Serializes request bodies to JSON, sets `Content-Type: application/json` only when a body is present.
- On a non-2xx response, parses the backend's actual error body and throws `APIError` (§ F) — never returns an error as a resolved value.
- On `204 No Content` (delete/cancel-RSVP), returns `undefined` rather than attempting `response.json()` on an empty body.

No Axios: `fetch` plus this ~40-line wrapper covers every requirement in § 9 of the brief; Axios would add interceptor/instance-config machinery this project doesn't need.

## F. API Error Model

The **actual** backend error shape (`backend/src/common/types/error-response.type.ts` + `all-exceptions.filter.ts`), which supersedes the illustrative shape in the brief's § 11 — per the brief's own rule ("treat the actual backend implementation as authoritative"):

```json
{
  "statusCode": 409,
  "code": "CONFLICT",
  "message": "Already RSVP'd, event full, or event already started",
  "error": "Conflict",
  "timestamp": "2026-09-25T10:00:00.000Z",
  "path": "/api/v1/events/…/rsvp",
  "requestId": "…"
}
```

Note `code` is **status-derived** (`BAD_REQUEST`, `CONFLICT`, `NOT_FOUND`, …), not a per-business-error taxonomy like `EVENT_FULL` — the backend deliberately chose not to maintain a second enum (documented in `error-code.util.ts`). The frontend must not assume finer-grained codes exist; a 409 on the RSVP endpoint is disambiguated by reading `message`, not `code`, until/unless the backend adds one.

```ts
// lib/api/errors.ts
class APIError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string;
  static async fromResponse(response: Response): Promise<APIError> { … }
}
```

Components never render `message` blindly as the only UX — each feature maps the status/context to a human sentence (e.g. 409 on RSVP → "This event is full" or "You've already joined this event," disambiguated from `message` text since `code` can't do it here), falling back to `message` only for statuses without a bespoke mapping. Network failures (`fetch` throwing, no `Response` at all) produce a distinct `APIError` with `status: 0` so the UI can show "check your connection" instead of a generic error. `500`s show a generic "something went wrong" — `message` for a 500 is not guaranteed to be user-appropriate and the filter itself only ever returns the fixed string `"Internal server error"` for unknown exceptions, never internal detail.

## G. Authentication Architecture

Not implemented this phase — design only, per § 12 of the brief.

**Current user is server state.** `useCurrentUser()` wraps `useQuery({ ...authKeys.me, queryFn: getMe, retry: false })` calling `GET /auth/me`. No separate global auth store duplicating this data — "is the user logged in" is answered by that query's `data`/`status`, exactly like any other server resource.

**Token storage — the one piece that isn't pure server state**, because the backend has no cookie-based session and no refresh-token endpoint (confirmed: `auth.controller`/`login-response.dto.ts` return only `accessToken` + `expiresIn` in the JSON body, no `Set-Cookie`, no `/auth/refresh`). The realistic options and the trade-off:

| Option                                            | Trade-off                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In-memory only (module variable, lost on refresh) | Safest against XSS token theft, but the user is logged out on every page reload — poor UX for a short-lived (`JWT_EXPIRES_IN`, e.g. 15m) token with no silent-refresh mechanism to recover it.                                                                                                                                                 |
| `localStorage` (chosen)                           | Survives reload; standard practice for JWT-in-body APIs without cookie support. Accepted trade-off: vulnerable to token theft via XSS. Mitigated by: React's default JSX escaping (no `dangerouslySetInnerHTML` anywhere in this contract), CSP via the backend's `helmet()`, and the token's own short lifetime limiting the exposure window. |

Chosen: `localStorage`, isolated behind `lib/api/auth-token.ts` (a plain module, not a React context) so `client.ts` can read it synchronously on every request without a hook, and so swapping the storage strategy later (e.g. if the backend adds httpOnly-cookie sessions) touches one file. On app boot, `AppProviders` reads a stored token, seeds it into `auth-token.ts`, and lets `useCurrentUser()` validate it against `GET /auth/me` — an invalid/expired token 401s, the query's `onError`-equivalent (`queryClient` global error handling, § D) clears the stored token, and route protection reacts to `status !== 'success'`.

**Protected routes** — a `<ProtectedRoute>` layout component wraps `useCurrentUser()`; while `isPending` it renders a spinner (never redirects prematurely on unresolved auth state), on success it renders `<Outlet />`, on error/no-user it redirects to `/login` with the attempted path preserved (`?next=`). This is explicitly a **UX mechanism only** (§ 17 of the brief) — every protected mutation still requires a valid bearer token server-side regardless of what the frontend router allowed.

**Logout** — clears `auth-token.ts`, then `queryClient.removeQueries({ queryKey: authKeys.me })` (remove, not just invalidate, so a stale cached user never flashes) plus `queryClient.clear()` is deliberately **not** called — event data isn't user-specific enough to need wiping, and clearing it would just cause a refetch flash for a page that's about to redirect anyway.

## H. Forms Architecture

React Hook Form owns field state/dirty/touched/submission; Zod owns the validation schema; `@hookform/resolvers/zod` bridges them:

```ts
// features/events/schemas.ts
export const createEventSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(2000).optional(),
    location: z.string().trim().min(1).max(200),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    capacity: z.number().int().positive(),
  })
  .refine((d) => new Date(d.endsAt) > new Date(d.startsAt), {
    message: 'End time must be after start time',
    path: ['endsAt'],
  });

export const updateEventSchema = createEventSchema.partial();
```

Field limits mirror the backend DTOs exactly (`CreateEventDto`: `title` ≤200, `description` ≤2000, `location` ≤200 — read directly from `backend/src/events/dto/create-event.dto.ts`) so the frontend rejects invalid input before a round trip, not as a substitute for backend validation (the backend's `ValidationPipe` remains authoritative). `updateEventSchema` is `.partial()` — a PATCH may send a subset of fields, per § 16 of the brief.

`loginSchema`/`registerSchema` similarly mirror `LoginDto`/`RegisterDto` (email format, 8–128 char password, 100-char name).

No field is ever managed with a standalone `useState` in a form component — `register()`/`Controller` for every input, `formState.errors` for inline messages, `handleSubmit` wraps the mutation call so a failed mutation can call `setError('root', …)` to surface a server-side error (e.g. 409 email-taken on register) inline rather than as a disconnected toast.

## I. React Best-Practices Skill Compliance

Already covered in detail above (top of this document). Summary of the rules with the most concrete bearing on EventHub, restated against this specific app:

| Rule                               | Applied as                                                                                                             |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `async-parallel`                   | Event detail page's event + attendees queries run as sibling `useQuery` calls, not chained                             |
| `bundle-barrel-imports`            | Icon imports are direct/named, never a wildcard package import                                                         |
| `bundle-dynamic-imports`           | Every route in `router.tsx` is `React.lazy`                                                                            |
| `client-swr-dedup` (principle)     | TanStack Query's cache is the dedup mechanism — this is why it's mandatory, not optional                               |
| `rerender-derived-state-no-effect` | "Is full" / "spots left" derived inline from query data during render                                                  |
| `rerender-no-inline-components`    | No component defined inside another component's body (e.g. `EventList` maps to `<EventCard>`, never defines it inline) |
| `rerender-functional-setstate`     | Local `useState` updaters use the functional form where the next value depends on the previous                         |
| `rendering-conditional-render`     | Ternaries, not `&&`, for loading/error/empty/success branches                                                          |
| `js-early-exit`                    | `client.ts`/validation helpers return/throw early                                                                      |
| `advanced-init-once`               | `QueryClient` and router constructed once at module scope                                                              |

## J. NestJS ↔ React Integration

Full endpoint mapping, verified directly against the backend controllers/DTOs (not the illustrative list in the brief's § 2 — two corrections below):

| Backend endpoint                   | Auth                 | Frontend hook            | Notes                                                                                     |
| ---------------------------------- | -------------------- | ------------------------ | ----------------------------------------------------------------------------------------- |
| `POST /api/v1/auth/register`       | Public               | `useRegister()`          | Body: `{name, email, password}` → `UserResponseDto` (no token — register does not log in) |
| `POST /api/v1/auth/login`          | Public               | `useLogin()`             | Body: `{email, password}` → `LoginResponseDto {accessToken, tokenType, expiresIn, user}`  |
| `GET /api/v1/auth/me`              | Required             | `useCurrentUser()`       | → `UserResponseDto`                                                                       |
| `POST /api/v1/events`              | Required             | `useCreateEvent()`       | → `EventResponseDto` (201)                                                                |
| `GET /api/v1/events`               | Public               | `useEvents(filters)`     | Query: `page, limit, search, from, to` → `PaginatedEventsResponseDto`                     |
| `GET /api/v1/events/:id`           | Public               | `useEvent(id)`           | → `EventResponseDto`                                                                      |
| `PATCH /api/v1/events/:id`         | Required, owner-only | `useUpdateEvent(id)`     | 403 if not the event's creator                                                            |
| `DELETE /api/v1/events/:id`        | Required, owner-only | `useDeleteEvent(id)`     | 204, no body                                                                              |
| `POST /api/v1/events/:id/rsvp`     | Required             | `useRsvp(id)`            | → `RsvpResponseDto` (201); 409 full/duplicate/already-started                             |
| `DELETE /api/v1/events/:id/rsvp`   | Required             | `useCancelRsvp(id)`      | 204, no body                                                                              |
| `GET /api/v1/events/:id/attendees` | **Required**         | `useAttendees(id, page)` | Query: `page, limit` → `PaginatedAttendeesResponseDto`                                    |

**Corrections vs. the brief's illustrative contract:**

1. `GET /events/:id/attendees` requires a bearer token — confirmed from `rsvp.controller.ts`, where `@Controller('events')` at the `RsvpController` class level carries `@UseGuards(JwtAuthGuard)` with no per-route `@Public()` override on `listAttendees`. (The backend's own Phase-0 doc had once described this route as public; the shipped code is the authority, and it requires auth.) The frontend must not call this endpoint unauthenticated.
2. Register does not return an access token — a successful `POST /auth/register` returns only the created `UserResponseDto`; the frontend must route a fresh registration to the login form/flow, not treat registration as an implicit login.

All requests go through `VITE_API_URL` + `/api/v1` (the backend's global prefix + default URI version, from `main.ts`) — the frontend's `client.ts` base URL should be exactly `VITE_API_URL` with callers passing paths like `/events`, `/auth/login`, so the full URL assembles to `{VITE_API_URL}/api/v1/events` etc. `VITE_API_URL` in development points at `http://localhost:3000`; in production it points at the deployed Render API (`https://eventhub-api-l5ka.onrender.com`), which must also have its `FRONTEND_URL` env var set to this frontend's deployed origin once the frontend itself is deployed (`backend/src/main.ts`'s CORS logic denies all cross-origin requests in production until that's set — see `backend/README.md`'s deployment section).

## K. Phase 1 Plan

Exact scope for the next phase — **foundation only, no feature UI yet**:

1. `npm create vite@latest frontend -- --template react-ts`, moved/merged into the existing `frontend/` directory.
2. Install and wire: `@tanstack/query`, `react-router`, `react-hook-form`, `zod`, `@hookform/resolvers`, Tailwind CSS v4 (`@tailwindcss/vite` plugin), `@tanstack/eslint-plugin-query`, a minimal icon package.
3. `src/lib/query/queryClient.ts` — the single `QueryClient` with the defaults from § D.
4. `src/app/providers/AppProviders.tsx` — `QueryClientProvider` + router provider, composed once in `main.tsx`.
5. `src/app/router/router.tsx` — the full route table from § B/§ 17, every page lazy-imported, pages themselves stubbed as placeholder components (no data fetching yet) so routing/navigation is provably correct before any feature logic exists.
6. `src/lib/api/client.ts`, `errors.ts`, `auth-token.ts` — the API client foundation from § E/§ F, with no feature-specific request functions yet.
7. `src/types/*` — the domain types from § J, hand-written to match the backend DTOs (not code-generated — the backend surface is small and stable enough that OpenAPI codegen would add a build step for limited benefit at this size; revisit if the contract grows).
8. `src/components/ui/*` — the design-system primitives from § 25 of the brief (`Button`, `Input`, `Card`, `Spinner`, `Skeleton`, `EmptyState`, `ErrorState`, etc.), styled with Tailwind, no business logic.
9. `.env.example` with `VITE_API_URL=http://localhost:3000`.
10. ESLint (`@tanstack/eslint-plugin-query` + standard React/TS config) and a base Vitest + React Testing Library setup (no tests written yet beyond a smoke test that `<App />` renders) — the testing _strategy_ is designed here (§ 27/28 of the brief); actual query/mutation/component tests are written alongside the features that introduce them in later phases.
11. `frontend/README.md` documenting architecture, state ownership, why TanStack Query over Redux, folder structure, environment variables — mirroring `backend/README.md`'s depth.
12. Root `README.md` updated: "Frontend: not started" → "Frontend: Phase 1 foundation."

Explicitly **not** in Phase 1: login/register UI logic (forms exist as stubs at most), event CRUD UI, RSVP UI, any real API calls beyond a manual smoke check that `client.ts` can reach `GET /api/v1/health`.
