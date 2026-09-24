# Phase 4 — Events Module, CRUD & Authorization

Status: **Complete.** No RSVP/attendee endpoints (Phase 5).

**ADR numbering note:** Phase 4's brief suggested ADR-011 through ADR-014, but Phase 3 already used ADR-011–013. Continuing the actual sequence, this phase's decisions are **ADR-014 through ADR-017**.

## 1. What was implemented

1. `events/` module: `EventsController`, `EventsService`, `EventsRepository`, following the exact same layered pattern `auth`/`users` established in Phase 3.
2. Full CRUD: `POST /events`, `GET /events` (paginated/searchable/filterable), `GET /events/:id`, `PATCH /events/:id`, `DELETE /events/:id`.
3. Creator-only update/delete authorization, built on Phase 3's `@CurrentUser()`.
4. Offset pagination, case-insensitive search across title/description/location, date-range filtering with an "upcoming by default" listing.
5. Server-derived `createdBy` — impossible for a client to spoof (no such field exists on the create DTO; the global `forbidNonWhitelisted` pipe rejects any attempt to send one).
6. Full Swagger documentation, bearer auth on the three protected routes.
7. 20 new unit tests, 28 new e2e tests (real HTTP + real Postgres), including a dedicated two-user ownership/authorization flow.

## 2. Current folder structure

```
src/events/
├── dto/
│   ├── create-event.dto.ts
│   ├── update-event.dto.ts       (PartialType(CreateEventDto))
│   ├── list-events.dto.ts
│   ├── event-response.dto.ts     (+ toEventResponse mapper)
│   └── paginated-events-response.dto.ts
├── events.controller.ts
├── events.service.ts
├── events.service.spec.ts
├── events.repository.ts
└── events.module.ts

test/events.e2e-spec.ts
```

## 3. Events architecture

```
HTTP → JwtAuthGuard (protected routes only) → ValidationPipe → EventsController
                                                                       ↓
                                                                 EventsService
                                                    (ownership checks, date/business
                                                     validation, orchestration)
                                                                       ↓
                                                                EventsRepository
                                                      (pure Prisma queries, no business
                                                       logic, no HTTP concerns)
                                                                       ↓
                                                                PostgreSQL
```

`EventsController` is routing-only: extract params/DTO/current-user, call the service, return its result — no Prisma, no ownership logic, no business rules. `EventsService` holds every business rule (date ordering, past-event rejection, ownership) and is the only place ownership is checked. `EventsRepository` is a pure persistence boundary — `create`/`findById`/`findMany`/`count`/`update`/`delete`, nothing else, matching the boundary `UsersRepository` (Phase 3) already established. No generic base repository, no CQRS, no event bus — none were justified at this scope.

## 4. API endpoints

| Method | Path | Auth | Success | Failure |
|---|---|---|---|---|
| POST | `/api/v1/events` | Required | `201` + `EventResponseDto` | `400`, `401` |
| GET | `/api/v1/events` | Public | `200` + `PaginatedEventsResponseDto` | `400` |
| GET | `/api/v1/events/:id` | Public | `200` + `EventResponseDto` | `404` |
| PATCH | `/api/v1/events/:id` | Required, creator only | `200` + `EventResponseDto` | `400`, `401`, `403`, `404` |
| DELETE | `/api/v1/events/:id` | Required, creator only | `204`, no body | `401`, `403`, `404` |

## 5. Authentication and authorization

`JwtAuthGuard` (Phase 3) is applied per-route via `@UseGuards(JwtAuthGuard)` on `create`/`update`/`remove` only — `list`/`findOne` carry no guard at all, making them genuinely public. This continues Phase 3's ADR-013 decision (per-route guards, not global) rather than introducing a global guard + `@Public()` pattern now; with the full protected surface still small (three routes across two modules), the per-route approach remains the simpler, equally correct choice. `@CurrentUser()` supplies the authenticated identity to `create`/`update`/`remove` without the controller ever touching `request.user` directly.

## 6. Ownership model

`Event.createdBy` (a plain user id, from Phase 2's schema) is the sole ownership signal. Enforcement happens in `EventsService`, not a generic guard, because it requires the resource loaded first (Phase 0's architecture called this out explicitly):

```
find event (404 if missing)
  → compare event.createdBy to currentUser.id
      → mismatch → 403 Forbidden
      → match    → proceed
```

**Client-supplied ownership is structurally impossible, not just filtered out:** `CreateEventDto` has no `createdBy` property at all. Combined with the Phase 1 global `ValidationPipe({ forbidNonWhitelisted: true })`, a request that includes `createdBy` in the body doesn't get it silently dropped — the *entire request* is rejected with `400`. Verified directly in both `events.service.spec.ts` (the data passed to the repository never contains `createdBy` from the DTO) and `events.e2e-spec.ts` (a spoofing attempt gets `400`, and a real two-user PATCH-ownership test confirms User B modifying User A's event is impossible and that the event is provably unchanged afterward).

**403 vs 404 for non-owners (Phase 4 §23):** consistently **403**, not 404. Reasoning, continuing Phase 0's security-model decision: `GET /events/:id` has no auth requirement at all, so the event's existence is never a secret to begin with — there is nothing to conceal by pretending a non-owner's target doesn't exist. A genuinely nonexistent event is still `404` (checked first, before the ownership comparison even runs).

## 7. Validation

- **Shape** (DTO-level, `class-validator`): `title`/`location` required and non-empty (≤200 chars), `description` optional (≤2000 chars), `startsAt`/`endsAt` valid ISO-8601, `capacity` a positive integer. `UpdateEventDto` reuses `CreateEventDto`'s validators via `PartialType`, so every field is optional but validated the same way when supplied — no duplicated validator logic between create and update.
- **Cross-field / business rules** (service-level, not DTO-level): `startsAt < endsAt`, and `startsAt` not in the past. These live in `EventsService`, not a custom class-validator decorator, for one specific reason: **on a `PATCH`, only the supplied fields are known to the DTO** — validating "is `endsAt` after `startsAt`" in isolation on a request that only sends `endsAt` is meaningless without the existing record's `startsAt`. `EventsService.update` merges the incoming values onto the existing event first, then validates that *final* state — exactly what Phase 4 §25's example ("existing 10:00–12:00, request `endsAt: 09:00`, must be rejected") requires, and verified directly by a test that patches only `endsAt` to before the *existing* `startsAt`.
- **Past-event policy (§8):** `startsAt` must not be more than 60 seconds in the past (`PAST_EVENT_GRACE_MS`). This absorbs realistic client/server clock skew and request latency without meaningfully allowing "past" events — a request whose `startsAt` was valid when the client built it but arrives a few seconds late still succeeds; a genuinely stale or backdated request does not.
- **UTC (§9):** the API accepts and stores ISO-8601 timestamps. Prisma's `DateTime` (Postgres `timestamp(3)` — Phase 2's existing schema, unchanged) always round-trips as UTC on both read and write regardless of the column's own timezone-awareness — no local-timezone conversion happens at any layer of this stack. No schema migration was needed for "UTC internally"; it already held.
- Every validation failure — DTO shape or business rule — surfaces as `400` through the existing global exception mechanism (Phase 1/2), never a raw internal error.

## 8. Pagination

`?page=1&limit=20` (defaults), `limit` capped at 100 (`@Max(100)` on `ListEventsDto`, rejecting anything higher with `400` rather than silently clamping). Implemented as real database-level offset pagination — `EventsRepository.findMany` uses Prisma's `skip`/`take`, computed as `skip = (page - 1) * limit`; there is no in-memory fetch-everything-then-slice anywhere. Total count comes from a separate `EventsRepository.count` query using the *same* filter, run concurrently with `findMany` via `Promise.all` (not a transaction — a total count that's off by one row between two near-simultaneous reads is inconsequential for a list UI, and forcing transactional consistency here would be unjustified ceremony). Response shape: `{ data: EventResponseDto[], meta: { page, limit, total, totalPages } }`.

**ADR-016** (below) covers the offset-vs-cursor trade-off.

## 9. Search/filtering

`?search=term` matches (case-insensitive) against `title`, `description`, and `location` via Prisma's `contains` + `mode: 'insensitive'` — compiled to a parameterized `ILIKE`, never raw SQL string concatenation, so there is no injection surface regardless of what a client sends as the search term (verified: the value flows through Prisma's query builder exactly like any other filter argument).

`?from=...&to=...` (ISO-8601) filters on `startsAt`. **The default listing is upcoming events only**, implemented as: when `from` isn't supplied, it defaults to `new Date()` (now) inside `EventsService.list` — there is no separate "upcoming" flag or code path. Passing an explicit past `from` opts out of that default and browses past events, satisfying §16's note about a future past-events filter without needing one. If both `from` and `to` are given and `from > to`, the service throws `400` before querying.

**ADR-017** (below) covers why this is plain PostgreSQL, not a dedicated search engine.

## 10. Database/query optimization

- **Field selection:** every event query that includes the creator relation uses an explicit `select: { id, name, email }` (`CREATOR_SELECT` constant in `EventsRepository`) — `passwordHash` is never fetched from the database for an event response in the first place, not filtered out afterward.
- **N+1 avoidance:** `EventsRepository.findMany` uses Prisma's `include: { creator: ... }` on the single list query — one SQL query (with a join) returns every event and its creator together. There is no loop issuing a per-event query for creator data.
- **Index review (§35):** the two indexes Phase 2 already created — `events(createdBy)` and `events(startsAt)` — are exactly what this phase's queries need: ownership lookups don't happen via a dedicated query (findById + in-memory compare), and the default/filtered list query orders and filters by `startsAt`, which the existing index directly serves. **No new indexes were added.** The search query (`contains` across three text columns) cannot use a plain btree index regardless — a full sequential scan is what Postgres will do, and that's an accepted, documented trade-off (see ADR-017), not an oversight.

## 11. Swagger

Every endpoint carries `@ApiOperation`, accurate `@ApiResponse` entries for every status code it can actually return (verified by fetching `/api/docs-json` directly and diffing the documented codes against this file's own API table), and `@ApiBearerAuth('access-token')` on the three protected routes (the same security scheme Phase 3 registered). DTOs carry only the `@ApiProperty()`/`@ApiPropertyOptional()` needed to describe each field with a realistic example — no extra metadata. `CreateEventDto`'s schema was inspected directly via the generated OpenAPI document and confirmed to have no `createdBy` property, matching the ownership model above.

## 12. Tests

**Unit (`events.service.spec.ts`, no database, 20 tests):** `create` derives `createdBy` from the authenticated user; rejects `startsAt >= endsAt`; rejects a past `startsAt`; allows one inside the clock-skew grace window. `list` defaults `from` to now; computes `skip`/`take` correctly from `page`/`limit`; rejects `from > to`; returns correct pagination metadata. `findById` throws `404` for a missing event; never exposes `passwordHash` via the nested creator. `update` allows the creator; rejects a non-owner with `403`; throws `404` for a missing event *before* the ownership check even runs; validates the final merged date state on a partial patch; confirms a client-supplied `createdBy` never reaches the repository call. `delete` mirrors the same ownership/not-found cases.

**E2E (`test/events.e2e-spec.ts`, real Postgres, 28 tests):** every create-validation case from §41 (auth required, spoofed `createdBy` rejected, empty title, non-positive capacity, bad date order, past `startsAt`); list behavior (public access, default pagination, limit ceiling, invalid pagination, search hit, date-range filter, `from > to` rejection, invalid date value, upcoming-ordering with two events); get-by-id (existing event with a safe nested creator confirmed to contain no `passwordHash` anywhere in the response body, and a `404` case); the full update matrix (owner succeeds, unauthenticated `401`, non-owner `403` **with a follow-up read proving the event was genuinely untouched**, missing event `404`, partial update leaves other fields alone, final-state date validation, invalid capacity); the full delete matrix (unauthenticated `401`, non-owner `403`, missing event `404`, owner succeeds with `204` and an empty body, followed by a `404` on re-fetch); and a dedicated end-to-end lifecycle test spanning two real registered/logged-in users exercising create → read → list → update → forbidden-update → forbidden-delete → delete → confirm-gone. This directly satisfies §42's requirement that ownership be proven through the real HTTP layer, not unit tests alone.

Test users/events are tagged under a dedicated email domain and removed in `afterAll` (events first, then users, respecting the `RESTRICT` foreign key) — verified zero leftover rows after a full run.

## 13. Security review

- **Ownership manipulation:** covered in depth in §6 above — structurally prevented (no `createdBy` field to send), not just runtime-checked, and proven via a real two-user HTTP test, not just a unit-level assertion.
- **Response safety:** `EventResponseDto`'s `createdBy` is always built from an explicit `{ id, name, email }` selection at the query layer (§10) — there is no code path where a full Prisma `User` row (with `passwordHash`) could be serialized into an event response, by construction rather than by an exclusion decorator that could be forgotten on a new field.
- **Search injection:** Prisma's parameterized `contains` (§9) — confirmed no raw SQL is constructed anywhere in `EventsRepository`.
- **Logging:** reviewed — event operations produce ordinary pino request logs (method, path, status, request id) through the existing Phase 1 HTTP logging; no event body field is sensitive enough to warrant redaction (nothing password- or token-shaped ever appears in an Events request/response), and the existing redaction list (`Authorization` header, `password`, `passwordHash`) already covers every actually-sensitive field anywhere in the app.

## 14. Dependencies

None added. Everything needed (Prisma, class-validator, `@nestjs/swagger`, the JWT guard/decorator from Phase 3) already existed.

## 15. NestJS concepts learned

- **Layered module composition:** `EventsModule` needs no explicit import of `AuthModule` to use `JwtAuthGuard`/`@CurrentUser()` — Passport strategies self-register into a process-wide registry on instantiation, so as long as `AuthModule` is loaded somewhere in the app (it is, in `AppModule`), any module can use the guard without a direct dependency edge. Worth understanding precisely because it's easy to assume Nest's DI graph is the only thing wiring cross-module behavior together — here, Passport's own registration model is doing some of that work.
- **`PartialType`:** a `@nestjs/swagger` utility that derives a new DTO class from an existing one with every property wrapped in `@IsOptional()` (and Swagger metadata preserved), used for `UpdateEventDto extends PartialType(CreateEventDto)`. Express equivalent: manually hand-writing a second, nearly-identical validation object and keeping it in sync by hand every time the first one changes.
- **Service-layer business validation vs. DTO-layer shape validation:** the DTO validates that a submitted value is well-formed in isolation (a valid date, a positive integer); it structurally cannot validate a rule that depends on *other* data (the existing database row, in a partial update). This phase is a concrete example of where that boundary actually falls in a real feature, not just an abstract principle.

## 16. Validation

```
npm run build            →  pass
npm run lint               →  pass (0 problems)
npm run format:check       →  pass
npm test                   →  pass (42 tests, 6 suites — no database required)
npm run test:e2e           →  pass (51 tests, 3 suites — against real Postgres)
npm run test:db            →  pass (13 tests, 2 suites — unchanged from Phase 2)
npx prisma validate        →  "The schema at prisma/schema.prisma is valid"
```

Manual verification against the running app (not just tests):
- Fetched `/api/docs-json` directly and confirmed every Events path, its security requirement, and its documented response codes match this document's API table exactly; confirmed `CreateEventDto`'s schema has no `createdBy` property.
- Full live curl walkthrough: register/login User A → create event → `GET /events` (list, paginated) → `GET /events/:id` → register/login User B → User B `PATCH` the event → `403` → User B `DELETE` the event → `403` → User A `PATCH` (capacity change) → `200` with the new value → User A `DELETE` → `204` → re-`GET` → `404`.
- Confirmed the `events.createdBy → users.id` `RESTRICT` foreign key (Phase 2) is live and correct: attempting to delete a test user who still owned an event failed with the expected Postgres constraint error until the event was removed first — the database-level protection this ownership model relies on is real, not just assumed.

## 17. Skill compliance

Followed: the controller/service/repository layering with each layer's responsibilities kept strictly separate (no Prisma in the controller, no HTTP concerns in the repository — matching `arch-feature-modules`/`arch-use-repository-pattern`), constructor injection throughout, guards for access control rather than manual checks, DTOs + the global `ValidationPipe` for every input surface, explicit field selection to avoid over-fetching (`perf-optimize-database`/`db-avoid-n-plus-one`), and services throwing `HttpException` subclasses directly rather than returning result objects for controllers to interpret.

No deviations from the skill this phase — the only version-pinning issue class from Phases 1–3 (ESM-only package majors) didn't recur here since no new dependencies were needed.

## 18. Known limitations

- Reducing an event's `capacity` is currently unconstrained by attendee count — correctly so for now, since nothing in the running system writes `EventAttendee` rows yet; Phase 5 must add a check here before applying a capacity decrease once RSVP exists (flagged directly in `EventsService.update`'s source).
- Search has no dedicated index (ADR-017) — acceptable at this project's scale; would need a `pg_trgm` GIN index if the dataset or query volume grew substantially.
- No rate limiting on any Events endpoint (unchanged limitation from Phase 3, applies here too).
- `findByIdForUpdate` (row-locking for RSVP capacity checks) was deliberately not added to `EventsRepository` — Phase 4 explicitly said not to establish that abstraction yet; it belongs to Phase 5's concurrency design.

## Architecture Decisions (ADR-014 – ADR-017)

**ADR-014 — Events as a Modular Domain**
Decision: `events/` is its own NestJS module (controller, service, repository, DTOs), not folded into an existing module.
Reason: Events is a distinct bounded concern with its own persistence, validation, and authorization rules — the same reasoning that gave `users/` and `auth/` their own modules in Phase 3. Feature-module organization (per the installed skill) keeps the codebase navigable as it grows toward Phase 5's RSVP module.
Trade-off: None meaningful at this scale — this is the default, not a special-case decision.

**ADR-015 — Event Ownership via `createdBy`**
Decision: `Event.createdBy` (already the schema from Phase 2) is the sole, simple ownership signal; whoever created an event is its only owner.
Reason: Sufficient for every requirement this assignment actually specifies. Simple to reason about, simple to test, simple to explain.
Trade-off: Does not support co-organizers, ownership transfer, or organization-owned events — a real product would likely need at least one of these eventually; out of scope here.

**ADR-016 — Offset Pagination**
Decision: `page`/`limit` query parameters, implemented with Prisma `skip`/`take` plus a separate `count` query.
Reason: Simple to implement, simple for API consumers to reason about, and entirely sufficient for this assignment's expected data volume.
Trade-off: Offset pagination degrades at very large offsets (Postgres still has to scan/skip the preceding rows) and is not stable under concurrent inserts (a page boundary can shift between requests). Cursor-based pagination avoids both, but is more complex to implement and consume correctly, and was explicitly out of scope for this phase per Phase 4 §15 ("do not over-engineer pagination with cursor pagination yet").

**ADR-017 — Plain PostgreSQL Search, No Search Infrastructure**
Decision: Case-insensitive `contains` across `title`/`description`/`location`, no dedicated search index, no external search service.
Reason: Elasticsearch/OpenSearch/Algolia are unjustified operational complexity for this project's expected scale — an entire additional service to run, sync, and monitor for a search box over what will realistically be, at most, a few thousand rows.
Trade-off: A sequential scan per search query, and no relevance ranking, fuzzy matching, or typo tolerance. If this ever becomes a real bottleneck, the next step is a `pg_trgm` GIN index (still plain PostgreSQL, no new infrastructure) before reaching for external search — deliberately not added preemptively now, per the project's stated "avoid speculative indexes" principle from Phase 2.

## 19. Phase 5 preparation

Phase 5 introduces:

- RSVP: `POST /events/:id/rsvp`, `DELETE /events/:id/rsvp`, `GET /events/:id/attendees`.
- The concurrency-safe capacity-check design from Phase 0's ADR-005: a PostgreSQL transaction that locks the event row (`SELECT ... FOR UPDATE` — already proven usable against this exact schema by Phase 2's `test/database/constraints.spec.ts`), checks for an existing RSVP and current attendee count within that same transaction, then inserts.
- Duplicate-RSVP prevention leaning on the `event_attendees(eventId, userId)` unique constraint (Phase 2) as the database-level backstop behind the transaction's own check.
- The capacity-vs-attendee-count validation flagged as a known limitation in this phase's `EventsService.update` — Phase 5 is where it becomes meaningful and should be added.
- A dedicated concurrency test: fire many simultaneous RSVP requests against a capacity-1 event, assert exactly one succeeds.

Not starting Phase 5 until instructed.
