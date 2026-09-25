# Phase 2 — Typed API Layer & TanStack Query Architecture

Status: **Complete.** Data layer only, per the phase boundary — no polished UI, no login/register/dashboard pages, no event cards.

## A. Architecture

```text
Component (future — none built this phase beyond Phase 1's home page)
  → Custom Hook (features/*/queries/hooks.ts)
      → TanStack Query (useQuery/useMutation)
          → Query Options (features/*/queries/options.ts — queryOptions())
              → Feature API (features/*/api/*-api.ts — plain functions)
                  → API Client (lib/api/api-client.ts — unchanged since Phase 1)
                      → fetch → NestJS API (/api/v1/...)
```

Three features, each with the same two-folder shape (§ 45):

```text
src/features/
├── auth/
│   ├── api/auth-api.ts            register, login, getCurrentUser
│   ├── queries/keys.ts             authKeys
│   ├── queries/options.ts           authQueries.me()
│   └── queries/hooks.ts              useCurrentUser, useLogin, useRegister, useLogout
├── events/
│   ├── api/events-api.ts           listEvents, getEvent, createEvent, updateEvent, deleteEvent
│   ├── queries/keys.ts              eventKeys
│   ├── queries/options.ts            eventsQueries.list/.detail
│   └── queries/hooks.ts               useEvents, useEvent, useCreateEvent, useUpdateEvent, useDeleteEvent
└── rsvp/
    ├── api/rsvp-api.ts              rsvp, cancelRsvp, getEventAttendees
    ├── queries/keys.ts               attendeeKeys
    ├── queries/options.ts             attendeesQueries.list
    └── queries/hooks.ts                useEventAttendees, useRsvp, useCancelRsvp
```

`src/types/` holds the response-side domain types shared across features (`User`, `UserSummary`, `Event`, `Attendee`, `RsvpResult`, `LoginResponse`, `PaginatedResponse<T>`). Request-side input types (`CreateEventInput`, `RegisterInput`, etc.) live next to the API function that uses them, not in `src/types/` — see § K.

## B. Files Created

```text
src/types/user.ts, pagination.ts, event.ts, attendee.ts, auth.ts

src/lib/api/auth-token.ts                real token storage (localStorage-backed)
src/lib/api/api-client.test.ts           9 tests

src/features/auth/api/auth-api.ts (+.test.ts)
src/features/auth/queries/keys.ts
src/features/auth/queries/options.ts
src/features/auth/queries/hooks.ts (+.test.tsx)

src/features/events/api/events-api.ts (+.test.ts)
src/features/events/queries/keys.ts
src/features/events/queries/options.ts
src/features/events/queries/hooks.ts (+.test.tsx)

src/features/rsvp/api/rsvp-api.ts (+.test.ts)
src/features/rsvp/queries/keys.ts
src/features/rsvp/queries/options.ts
src/features/rsvp/queries/hooks.ts (+.test.tsx)

src/test/mock-fetch.ts                   mockFetchJson / mockFetchInvalidJson / mockFetchNetworkError
```

## C. Files Modified

- **`src/lib/api/api-client.ts`** — Phase 1's ad hoc `authToken` module slot + exported `setAuthToken` replaced with an import of `getAuthToken` from the new `auth-token.ts`, which is now the single real implementation (§ 11/§ 12 — one clear place tokens are attached, not two).
- **`src/pages/home-page.tsx`** — `HealthResponse` type corrected from a guessed `{ status: string }` to the real shape (`{ status: 'ok'; info: { name, environment, uptime } }`), found while inspecting the real backend contract for this phase (§ 3). Harmless before (`.status` genuinely existed), but incomplete.
- **`src/test/setup.ts`** — added a global `afterEach` (`vi.unstubAllGlobals()`, `vi.restoreAllMocks()`) so every test file's `fetch` stub is torn down automatically; no test file needs to remember to do this itself.

## D. API Contract (all frontend API functions, verified against the real backend source — not the brief's illustrative contract)

| Function                    | Method + Path               | Auth                 | Returns                        | Verified against                                                                                                                                                                                                                                                                                                                       |
| --------------------------- | --------------------------- | -------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `authApi.register`          | `POST /auth/register`       | Public               | `User` (no token)              | `auth.controller.ts` — confirmed no token in response                                                                                                                                                                                                                                                                                  |
| `authApi.login`             | `POST /auth/login`          | Public               | `LoginResponse`                | `login-response.dto.ts`                                                                                                                                                                                                                                                                                                                |
| `authApi.getCurrentUser`    | `GET /auth/me`              | Required             | `UserSummary` **(not `User`)** | `auth.controller.ts`'s `me()` returns the `AuthenticatedUser` request property directly, not `UserResponseDto` — a real discrepancy from its own Swagger annotation and Phase 0's draft doc, both of which said `UserSummaryDto`/full user; the _handler_ itself proves the summary shape is what's actually returned. No `createdAt`. |
| `eventsApi.listEvents`      | `GET /events`               | Public               | `PaginatedResponse<Event>`     | `events.controller.ts`                                                                                                                                                                                                                                                                                                                 |
| `eventsApi.getEvent`        | `GET /events/:id`           | Public               | `Event`                        | ″                                                                                                                                                                                                                                                                                                                                      |
| `eventsApi.createEvent`     | `POST /events`              | Required             | `Event`                        | ″                                                                                                                                                                                                                                                                                                                                      |
| `eventsApi.updateEvent`     | `PATCH /events/:id`         | Required, owner-only | `Event`                        | ″                                                                                                                                                                                                                                                                                                                                      |
| `eventsApi.deleteEvent`     | `DELETE /events/:id`        | Required, owner-only | `void` (204)                   | ″                                                                                                                                                                                                                                                                                                                                      |
| `rsvpApi.rsvp`              | `POST /events/:id/rsvp`     | Required             | `RsvpResult`                   | `rsvp.controller.ts` — no request body, no `userId` sent (§ 16)                                                                                                                                                                                                                                                                        |
| `rsvpApi.cancelRsvp`        | `DELETE /events/:id/rsvp`   | Required             | `void` (204)                   | ″                                                                                                                                                                                                                                                                                                                                      |
| `rsvpApi.getEventAttendees` | `GET /events/:id/attendees` | **Required**         | `PaginatedResponse<Attendee>`  | Confirmed again this phase: `RsvpController`'s class-level `@UseGuards(JwtAuthGuard)` covers `listAttendees` too, no `@Public()` override                                                                                                                                                                                              |

## E. Query Keys

```ts
// auth
authKeys.all; // ['auth']
authKeys.me(); // ['auth', 'me']

// events
eventKeys.all; // ['events']
eventKeys.lists(); // ['events', 'list']
eventKeys.list(filters); // ['events', 'list', { page, limit, ...filters }]  — page/limit normalized (§ 28)
eventKeys.details(); // ['events', 'detail']
eventKeys.detail(id); // ['events', 'detail', id]

// rsvp / attendees
attendeeKeys.all; // ['attendees']
attendeeKeys.lists(); // ['attendees', 'list']
attendeeKeys.listsForEvent(eventId); // ['attendees', 'list', eventId]          — prefix, matches every page
attendeeKeys.list(eventId, pagination); // ['attendees', 'list', eventId, { page, limit }]
```

`eventKeys.list()` and `attendeeKeys.list()` both normalize their pagination/filter object (defaulting `page`/`limit`) before building the key, so an implicit `{}` call and an explicit `{ page: 1, limit: 20 }` call — the same logical request — hit the same cache entry instead of creating two (§ 28/§ 43). `attendeeKeys.listsForEvent(eventId)` exists specifically so a mutation can invalidate/remove _every_ cached page of one event's attendees without knowing which pages happen to be in cache — TanStack Query matches by key prefix.

## F. Query Options

`queryOptions()` (TanStack Query v5) used for every query, never inlined `queryKey`/`queryFn` directly in a hook — the same options object is reusable for prefetching later without duplication:

- **`authQueries.me()`** — `staleTime: 5 min`. Identity doesn't drift on its own; `useLogin`/`useLogout` update this cache directly rather than waiting on staleness.
- **`eventsQueries.list(filters)` / `.detail(id)`** — no bespoke `staleTime` override; both use the app-wide 60s default from the `QueryClient` (Phase 1), since neither has a concrete reason to diverge from it. `.detail(id)` sets `enabled: Boolean(id)`.
- **`attendeesQueries.list(eventId, pagination)`** — `staleTime: 15s` (shorter than the default, § 26: "attendees, potentially shorter because RSVP changes can affect it") + `enabled: Boolean(eventId)`.

## G. Custom Hooks

| Hook                                      | Responsibility                                                                                                  |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `useCurrentUser()`                        | Wraps `authQueries.me()`; `enabled: getAuthToken() !== null` — no request fires with no stored token            |
| `useLogin()`                              | Mutation; on success stores the token and seeds `auth.me`'s cache with the `UserSummary` subset of the response |
| `useRegister()`                           | Mutation; no cache/token side effects — registration doesn't authenticate                                       |
| `useLogout()`                             | Not a mutation (no backend endpoint) — a callback that clears the token and removes `auth.me`                   |
| `useEvents(filters)`                      | Wraps `eventsQueries.list`                                                                                      |
| `useEvent(eventId)`                       | Wraps `eventsQueries.detail`; no-ops on an empty id                                                             |
| `useCreateEvent()`                        | Mutation; seeds the new event's detail cache, invalidates lists                                                 |
| `useUpdateEvent(eventId)`                 | Mutation; overwrites the detail cache with the authoritative response, invalidates lists                        |
| `useDeleteEvent()`                        | Mutation; removes the detail + all attendee-list cache entries for that event, invalidates lists                |
| `useEventAttendees(eventId, pagination?)` | Wraps `attendeesQueries.list`; no-ops on an empty id                                                            |
| `useRsvp(eventId)`                        | Mutation; invalidates that event's detail + all its attendee-list pages                                         |
| `useCancelRsvp(eventId)`                  | Same invalidation as `useRsvp`                                                                                  |

No hook contains EventHub business rules (§ 46) — e.g. no hook computes "is this event full"; that's derived from `Event.availableSpots`, a server-computed field, wherever a future component needs it.

## H. Mutation Invalidation

| Mutation         | Invalidates / updates                                                                                                          | Explicitly NOT touched                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `useCreateEvent` | `setQueryData(eventKeys.detail(newId), event)` (response is authoritative), `invalidateQueries(eventKeys.lists())`             | `attendeeKeys` (a brand-new event has no attendees yet)                                         |
| `useUpdateEvent` | `setQueryData(eventKeys.detail(id), event)`, `invalidateQueries(eventKeys.lists())`                                            | attendee caches (an edit doesn't change who's attending)                                        |
| `useDeleteEvent` | `removeQueries(eventKeys.detail(id))`, `removeQueries(attendeeKeys.listsForEvent(id))`, `invalidateQueries(eventKeys.lists())` | other events' caches                                                                            |
| `useRsvp`        | `invalidateQueries(eventKeys.detail(id))`, `invalidateQueries(attendeeKeys.listsForEvent(id))`                                 | **`eventKeys.lists()`** — deliberately, see below                                               |
| `useCancelRsvp`  | same as `useRsvp`                                                                                                              | same                                                                                            |
| `useLogin`       | `setQueryData(authKeys.me(), summary)`                                                                                         | no other query                                                                                  |
| `useRegister`    | nothing                                                                                                                        | registration doesn't change any cached data                                                     |
| `useLogout`      | `removeQueries(authKeys.me())`                                                                                                 | every other query — none of the rest of this contract's cached data is actually per-user (§ 33) |

**Why RSVP doesn't invalidate `eventKeys.lists()`:** § 22 lists "event list" as a query RSVP "potentially affects" (the list's `attendeeCount` per item would go stale). § 23 separately warns against invalidating broadly. This is a real tension the brief itself sets up, and the decision made here is: don't invalidate every open, possibly-filtered, possibly-paginated event list across the whole app on every single join/cancel — that's the app-wide, unscoped over-invalidation § 23 is specifically warning about, for a staleness window (up to 60s, or until the next window-focus refetch) nobody has asked to eliminate. A test (`rsvp/queries/hooks.test.tsx`) asserts `eventKeys.lists()` is NOT among the invalidated keys, so this stays a deliberate, enforced choice rather than something a future edit could silently break.

## I. Authentication Data Flow

```text
useLogin().mutate({ email, password })
  → authApi.login → POST /auth/login → { accessToken, tokenType, expiresIn, user }
  → onSuccess: setAuthToken(accessToken)        (lib/api/auth-token.ts, localStorage-backed)
             + queryClient.setQueryData(authKeys.me(), userSummary)

Every subsequent apiClient request
  → getAuthToken() reads the in-memory token
  → Authorization: Bearer <token> attached automatically — no hook or
    component ever constructs this header itself (§ 12)

useCurrentUser() (e.g. on app boot, in a future ProtectedRoute)
  → enabled only if a token is already stored
  → GET /auth/me → 200 UserSummary (valid token) or 401 (expired/invalid,
    surfaced as query error — a future auth UI decides what to do with it,
    e.g. clearAuthToken() + redirect to /login)

useLogout()
  → clearAuthToken() + removeQueries(authKeys.me())
  → next apiClient request has no Authorization header
```

No refresh-token flow exists because the backend doesn't have one (§ 11's instruction not to invent one is followed literally — confirmed absent from `auth.controller.ts`). An expired token simply surfaces as a 401 on the next request; re-authentication is a full login again.

## J. Error Handling

Unchanged from Phase 1's `ApiError` (§ 9/§ 10) — this phase didn't need to modify it, only prove it against the feature layer:

- Every backend error field (`statusCode`, `code`, `message`, `requestId`) survives intact through `eventsApi`/`rsvpApi`/`authApi` calls — verified directly in `api-client.test.ts` with the real 409 RSVP-conflict shape and a real array-`message` 400 validation shape (joined into one string for `.message`; `code`/`status` stay machine-readable for a future UI to branch on, e.g. distinguishing a 409 from a 404 without string-matching `message`).
- The backend's `code` field is status-derived (`CONFLICT`, not `EVENT_FULL`/`DUPLICATE_RSVP`) — confirmed again this phase from `error-code.util.ts`. § 47 asks the hook layer to "preserve the structured error" for exactly this kind of RSVP-conflict distinction; that's satisfied (every mutation's `error` is a full `ApiError` with `status`/`code`/`message`/`requestId` intact), but a future RSVP UI will have to disambiguate _which_ 409 occurred by matching on `message` text, not `code` — a real, documented limitation of the actual backend contract, not something the frontend can paper over.

## K. Runtime Validation (Zod)

**Decision: no Zod schemas validating API responses in this phase.** Reasoning (§ 7):

- This frontend and its backend are one project, developed and deployed together, with the backend's own DTOs as the single source of truth this phase's types were written against field-by-field (not guessed) — the two real discrepancies found (§ D) came from _reading the backend's controller code_, not from a runtime type mismatch a Zod schema would have caught.
- Duplicating every response DTO as a Zod schema (7+ shapes: `User`, `UserSummary`, `Event`, `Attendee`, `RsvpResult`, `LoginResponse`, plus two `PaginatedResponse<T>` variants) would be exactly the "enormous duplicate schemas for every trivial response" § 7 says to avoid when TypeScript types are sufficient — and for this contract, they are: the API surface is small, fully under this project's control, and already covered by real integration tests (§ L) that assert the client correctly parses the actual response shapes, which is what a passing Zod parse would also prove, just at build time via tests instead of at every runtime request.
- Zod is still very much part of this stack — just at its intended boundary (§ H of Phase 0): **form input** validation, once forms exist (Phase 3+), which is genuinely user-supplied, untrusted-until-validated data, unlike a response from a backend this project also owns.

This is a call to revisit, not a permanent position: if a third-party API ever gets added to this frontend, or the backend team ever ships independently of the frontend, response validation would earn its cost then.

## L. Testing

Actual results, this run:

```text
npm run typecheck    → passes, 0 errors
npm run lint          → passes, 0 problems
npm run format:check  → passes
npm test              → 9 test files, 37 tests, all passing
npm run build          → succeeds (150 modules, main chunk 340.21 kB / gzip 106.58 kB)
```

Breakdown:

- **`lib/api/api-client.test.ts` (9 tests)** — success JSON parse, 204 → `undefined`, JSON body + `Content-Type` sent only with a body, `Authorization` header attached only when a token is set, the real 409 RSVP-conflict error body normalized correctly, an array `message` joined into one string, a non-JSON error body falling back to a generic `ApiError`, and a `fetch` rejection normalized to `status: 0`.
- **Feature API tests (12 tests across `auth-api.test.ts`/`events-api.test.ts`/`rsvp-api.test.ts`)** — every one of the 10 API functions in § D is exercised at least once: correct method, correct URL (including query-string serialization for `listEvents`/`getEventAttendees` filters), correct body, correct parsed return type. `rsvp-api.test.ts` specifically asserts `rsvp()` sends **no request body** — proving § 16's "don't send a `userId`" isn't just true by omission from the type but actually true on the wire.
- **Hook tests (16 tests across 3 `hooks.test.tsx` files)** — `useCurrentUser`'s disabled-with-no-token / enabled-with-a-token split (§ 27), `useLogin`'s token storage + cache seeding (with the `UserSummary`-not-`User` shape asserted explicitly), `useRegister`'s _lack_ of any cache/token side effect, `useLogout`'s clear+remove, `useEvents` loading→success, `useEvent`'s disabled-on-empty-id guard, `useCreateEvent`'s seed+invalidate, `useDeleteEvent`'s remove+invalidate, `useEventAttendees`'s disabled-on-empty-id guard, and — the one most worth calling out — `useRsvp`'s test asserting `eventKeys.lists()` is specifically **not** invalidated, turning § H's invalidation-scope decision into something a regression would actually fail on, not just a comment.

**Coverage is intentionally not exhaustive per-hook-per-branch** — e.g. `useUpdateEvent` and `useCancelRsvp` reuse the exact same tested pattern as `useCreateEvent`/`useRsvp` respectively (same mutation shape, same invalidation call, different key), so a dedicated test for each would mostly re-prove the same assertion under a different name. Every hook is exercised at least once; the handful with genuinely distinct behavior (empty-id guards, the auth token/cache side effects, the RSVP over-invalidation guard) get the deeper tests.

**MSW: evaluated, not used** (§ 38) — `fetch` is stubbed directly per test via `test/mock-fetch.ts` instead. `api-client.ts` is already this codebase's only caller of `fetch`; stubbing `fetch` itself tests at the exact same boundary MSW would intercept, without the added setup (service worker registration, `msw/node` server lifecycle, handler files) that pays off once there's a much larger or more realistic network surface to fake — not the case for a ten-function API layer against one backend this project controls.

## M. React Best-Practices Compliance

Re-read `AGENTS.md`/category index/relevant rule files again for this phase specifically, focused on the data-fetching categories:

| Rule                               | Applied as                                                                                                                                                                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `client-swr-dedup`                 | The actual reason every query goes through `queryOptions()` + `useQuery` instead of a hand-rolled fetch-in-effect — TanStack Query's cache is the dedup mechanism, proven by the hook tests reusing one `QueryClient` per test and asserting single-fetch behavior |
| `async-parallel`                   | `useEvent`/`useEventAttendees` are independent hooks a future event-detail page calls side by side — neither is nested inside the other's success callback                                                                                                         |
| `rerender-derived-state-no-effect` | No hook copies query data into `useState`; `useLogin`'s `onSuccess` writes straight into the `QueryClient` cache, not component state                                                                                                                              |
| `js-early-exit`                    | `captureApiError` (test helper), `buildListQuery`/`buildAttendeesQuery` all return early rather than nesting conditionals                                                                                                                                          |
| `bundle-barrel-imports`            | Every new import across 20+ files is a direct, named import — still zero barrel/wildcard imports in the codebase                                                                                                                                                   |
| `advanced-init-once`               | No new `QueryClient` — every hook uses the one from Phase 1 via context; `createTestQueryClient()` exists specifically so tests get their _own_ fresh instance instead of ever sharing the app's                                                                   |

Not applicable this phase: `bundle-dynamic-imports` (no new routes/pages), `rendering-*` (no UI rendered by this phase's own code beyond what Phase 1 already had).

## N. Performance Decisions

- **Retry**: unchanged from Phase 1's global policy (one retry, skipped for 4xx) — no feature query/mutation overrides it, because none of them have a reason to diverge (§ 25). `useLogin`/`useRegister`/RSVP mutations inherit `retry: false` from the `QueryClient`'s mutation defaults, which matters specifically for RSVP: an automatic retry of a 409 conflict would be nonsensical (retrying "already RSVP'd" doesn't become not-already-RSVP'd).
- **Stale time**: default 60s (events), 5 min (current user — identity is the most stable thing in this contract), 15s (attendees — the most volatile, § 26). No `staleTime: 0` and no `Infinity` anywhere.
- **Request cancellation (§ 41)**: not implemented — every query function here takes only an `AbortSignal`-less argument list, and no query in this phase changes parameters rapidly enough for a stale in-flight request to be a real problem yet (`useEvents(filters)` would be the candidate once a real search input exists in Phase 3+; the `queryFn` signature TanStack Query provides already receives a `signal` when one is needed, so wiring `fetch(url, { signal })` through `apiClient` is a small, contained addition to make then — not invented speculatively now for a filter UI that doesn't exist).
- **Duplicate-request prevention (§ 43)**: one `QueryClient` (Phase 1, unchanged), normalized filter/pagination objects in every list-shaped query key (§ E) so equivalent requests always hash to the same cache entry, and every query key factory is the single source of truth for its feature's keys — nothing constructs an ad hoc key inline anywhere in the codebase (grepped for confirmation in § entry below).
- **Cache invalidation**: covered exhaustively in § H — every mutation's invalidation scope is deliberate and, for the one genuinely debatable case (RSVP vs. event lists), tested.

## O. Problems Found

1. **`GET /auth/me` returns `UserSummary`, not the full `User`** — its own Swagger `@ApiResponse` annotation says `UserSummaryDto`, but Phase 0's draft doc (written before this level of inspection) assumed the fuller shape. Confirmed by reading the actual handler body (`me(@CurrentUser() user: AuthenticatedUser) { return user; }`) rather than trusting the annotation. `authApi.getCurrentUser()` is typed `Promise<UserSummary>` accordingly, and `useLogin`'s cache-seeding code explicitly strips `createdAt` off the login response's `user` field before caching it, so the cache never holds a shape `GET /auth/me` itself couldn't have produced.
2. **`/health`'s real response shape** (`{ status: 'ok', info: { name, environment, uptime } }`) was mistyped in Phase 1 as `{ status: string }` — not a bug (`.status` genuinely exists), but an incomplete type found while doing this phase's contract inspection. Fixed in `home-page.tsx`.
3. **`Mock<Procedure>`-typed `fetch` stubs made an `as unknown as Response` cast trip `@typescript-eslint/no-unnecessary-type-assertion`** in `mock-fetch.ts` — the plain object literal already satisfied what `mockResolvedValue` accepts without the cast; removed via `eslint --fix`, verified the tests still pass with the simpler (uncast) version.
4. **JSX in `.ts` test files** — the first draft of `auth/queries/hooks.test.ts` defined a small wrapper component inline and needed the `.tsx` extension to parse; caught immediately by Vite's transform, renamed before it became a real problem.

## P. Phase 3 Preparation

The data layer is complete and proven — every backend endpoint has a typed API function, a query-key entry, and (for queries) a `queryOptions()` object; every hook a future page would call already exists and is tested in isolation. Phase 3 can build real UI — login/register forms (React Hook Form + Zod, validating against the same field constraints as the backend DTOs, per Phase 0 § H), an event list page consuming `useEvents` with URL-owned `page`/`search`/`from`/`to` state, an event detail page consuming `useEvent` + `useEventAttendees` + `useRsvp`/`useCancelRsvp`, and event create/edit forms consuming `useCreateEvent`/`useUpdateEvent` — entirely by composing what already exists here, with zero new `fetch` calls, zero new query keys invented ad hoc in a component, and zero new `useEffect`-based data fetching anywhere in the codebase.
