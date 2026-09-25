# Phase 5 — RSVP, Attendee Tracking & Concurrency

Status: **Complete.** This is the correctness-critical phase of the whole project.

**ADR numbering note:** the brief suggested ADR-015 through ADR-017, but those numbers are already used (Phase 4). Continuing the actual sequence, this phase's decisions are **ADR-018 through ADR-020**.

## 1. What was implemented

1. `rsvp/` module: `RsvpController`, `RsvpService`, `RsvpRepository`, mirroring the layered pattern every prior module established.
2. `POST /events/:id/rsvp`, `DELETE /events/:id/rsvp`, `GET /events/:id/attendees` — all three require authentication.
3. Concurrency-safe join: PostgreSQL transaction + `SELECT ... FOR UPDATE` row lock, encompassing the entire capacity/duplicate decision and the insert.
4. Duplicate-RSVP prevention at two layers: an application-level check inside the locked transaction, and the Phase 2 `UNIQUE(eventId, userId)` constraint as the final backstop.
5. Capacity enforcement that cannot be raced, verified with genuinely concurrent HTTP requests against real Postgres.
6. Revisited Phase 4's `EventsService.update`: capacity reductions now lock the same event row and are rejected (`409`) if the new capacity would be below the current attendee count — including under a concurrent RSVP for the same event.
7. `EventResponseDto` now reports `attendeeCount`/`availableSpots`, computed via Prisma's relation-count feature (no N+1, even across a paginated list).
8. 12 new unit tests, 25 new e2e tests — including 5 dedicated concurrency tests firing real concurrent HTTP requests via `Promise.all`.

## 2. Current folder structure

```
src/
├── events/
│   ├── events.repository.ts     (extended: findByIdForUpdate, countAttendees,
│   │                              _count relation include, transaction-aware update)
│   ├── events.service.ts        (extended: capacity-change transactional path)
│   └── events.module.ts         (extended: exports EventsRepository)
├── rsvp/
│   ├── dto/
│   │   ├── rsvp-response.dto.ts
│   │   ├── attendee-response.dto.ts       (+ toAttendeeResponse mapper)
│   │   ├── list-attendees.dto.ts
│   │   └── paginated-attendees-response.dto.ts
│   ├── rsvp.controller.ts
│   ├── rsvp.service.ts
│   ├── rsvp.service.spec.ts
│   ├── rsvp.repository.ts
│   └── rsvp.module.ts

test/rsvp.e2e-spec.ts
```

## 3. RSVP architecture

```
HTTP → JwtAuthGuard → ParseUUIDPipe(:id) → RsvpController
                                                  ↓
                                             RsvpService
                    (owns the transaction boundary; the whole
                     "join this event if a seat is available"
                     decision happens here)
                                                  ↓
                        ┌─────────────────────────┴─────────────────────────┐
                        ↓                                                   ↓
                 EventsRepository                                   RsvpRepository
        (findByIdForUpdate — the row lock;               (findAttendee/createAttendee/
         countAttendees — shared with the                 deleteAttendee/listAttendees —
         capacity-update path in EventsService)            pure EventAttendee persistence)
                        └─────────────────────────┬─────────────────────────┘
                                                    ↓
                                               PostgreSQL
```

`RsvpController` is routing-only — no `@Body()` DTO on `join`/`cancel` at all (RSVP takes no request body; identity comes from `@CurrentUser()`). `RsvpService` owns the transaction boundary and every business rule (duplicate check, capacity check, past-event check). Both repositories stay pure persistence — no business rules, matching every prior module's boundary discipline.

`RsvpModule` imports `EventsModule` specifically to reuse `EventsRepository` — the row-lock and attendee-count logic isn't duplicated in a second place; it's shared with `EventsService`'s capacity-update path (§10).

## 4. Transaction boundary

Everything that decides whether a seat is available happens inside one `prisma.$transaction(async (tx) => { ... })` call in `RsvpService.join`:

```
BEGIN                                                    ┐
  SELECT id, capacity, "startsAt", "createdBy"           │
  FROM events WHERE id = $1::uuid FOR UPDATE              │
  → event not found? NotFoundException                    │
  → event already started? ConflictException               │  all inside
  SELECT ... FROM event_attendees                          │  the SAME
  WHERE eventId = $1 AND userId = $2   -- duplicate check   │  transaction,
  → already exists? ConflictException                       │  on the tx-
  SELECT COUNT(*) FROM event_attendees WHERE eventId = $1   │  scoped client
  → count >= capacity? ConflictException                    │
  INSERT INTO event_attendees (eventId, userId) VALUES (…) │
COMMIT                                                     ┘
```

Every one of these operations uses the transaction-scoped client (`tx`), passed explicitly as a parameter to every repository method involved — never the plain `PrismaService` for any step that must participate in the transaction (Phase 5 §34's explicit warning). The lock is held from the `SELECT ... FOR UPDATE` until `COMMIT`; nothing releases it early.

`EventsService.update`'s capacity-changing path (§10) follows the identical pattern: lock, check, write, all inside one transaction.

**Cancellation deliberately does not use a transaction or lock** (§24) — removing a row can never push `attendeeCount` above `capacity`, so there is no race to protect against; `RsvpRepository.deleteAttendee` is a single atomic `deleteMany`.

## 5. Row-level locking

`SELECT ... FOR UPDATE` locks the matched row for the duration of the transaction. A second transaction's own `SELECT ... FOR UPDATE` on the *same* row blocks at that statement until the first transaction commits or rolls back — it cannot read past the lock to make its own decision on stale data. Once the first transaction commits, the second proceeds and reads the now-current state (including the just-inserted attendee).

This is necessary because none of the individual read/write steps in the RSVP flow are atomic with each other on their own — "count attendees" and "insert if count < capacity" are two separate statements, and without a lock serializing the whole read-decide-write sequence per event, two concurrent transactions can both read the same (stale) count and both decide to insert, overshooting capacity (Phase 5 §6's exact example — 99/100, two requests both insert, ending at 101). The lock turns "the decision for event X" into something only one transaction can be actively making at a time, for that specific event — different events are entirely unaffected and RSVP to different events proceeds fully in parallel.

## 6. Duplicate RSVP protection

Two independent layers, per Phase 5 §11's explicit requirement that the database constraint remain the final authority regardless of what the application does:

1. **Application-level check**, inside the locked transaction: `RsvpRepository.findAttendee` queries by the `eventId_userId` compound key before inserting. Under the row lock, this check is reliable — no other transaction can insert an attendee for this event between this check and the insert below it, because they're all serialized behind the same lock.
2. **Database-level constraint**, `UNIQUE(eventId, userId)` (Phase 2), enforced by Postgres itself on the `INSERT`. In the row-locked flow above, this should never actually fire (the app-level check already caught it) — it exists as defense in depth, not as the primary mechanism. `RsvpService.createAttendeeSafely` catches a hypothetical `P2002` and translates it into the identical friendly `"You have already RSVP'd to this event."` message, never a raw Prisma error.

Verified directly: a dedicated concurrency test fires 15 concurrent RSVP requests from the *same* user (§10 below) — exactly 1 succeeds, the other 14 get `409`, and the final database row count for that user/event pair is exactly 1.

## 7. Capacity enforcement

`attendeeCount >= event.capacity` is checked with `EventsRepository.countAttendees(eventId, tx)` — a real `COUNT(*)` query against `event_attendees`, run inside the same locked transaction, immediately before the insert. Because the lock has been held since before this count was taken, the count cannot go stale before the insert happens: no other transaction could have inserted an attendee for this event in between. This is also why the RSVP response's `attendeeCount` can be computed as `count + 1` rather than re-queried — it's provably correct under the lock, not an assumption.

`Event.capacity` itself remains protected at the database level too (Phase 2's `CHECK (capacity > 0)`), independent of this application-level enforcement.

## 8. Cancellation

`RsvpService.cancel`:
1. `EventsRepository.findById(eventId)` — `404 "Event not found"` if missing.
2. `RsvpRepository.deleteAttendee(eventId, userId)` — a `deleteMany` (not `delete`, since there's no guaranteed-to-exist unique lookup key being asserted; `deleteMany` returns a count instead of throwing if nothing matched).
3. If the delete affected zero rows, `404 "You are not attending this event."`

**Decision (§23): `404`, not `409`, for "not attending".** The brief allowed either; `404` was chosen to keep one consistent rule across all three RSVP endpoints — "the thing you're targeting isn't there for you" is always `404` (a missing event is `404`, a missing attendance record is `404`), rather than splitting "missing resource" (`404`) from "missing relationship to a resource that does exist" (`409`) as two different concepts a client has to distinguish.

## 9. Attendee tracking

`GET /events/:id/attendees` (auth required, per §2's explicit scope for all three RSVP endpoints) returns `{ data: [{ user: {id,name,email}, joinedAt }], meta: {page, limit, total, totalPages} }` — the same pagination shape Phase 4 established for event listing, per §22's explicit instruction to reuse it.

**Ordering:** `joinedAt ASC` (earliest RSVP first) — deterministic, and the natural reading of "who's attending, in the order they joined" (§38).

**Privacy (§21):** attendee `email` is included, matching the example response given in the brief itself, gated behind authentication (any authenticated user can view any event's attendee list — not creator-only). This is a deliberate, scoped choice for this assignment rather than an oversight: restricting further (e.g., creator-only, or omitting email) would be straightforward to add later if the product required it, by tightening the guard or the response mapper — nothing in the current design makes that harder to retrofit.

**Count/pagination (§18/§19/§22/§55/§56):** the count comes from `EventsRepository.countAttendees` — a real `COUNT(*)`, never a cached or application-maintained counter (`Event.attendeeCount` deliberately does not exist as a column). Listing uses real database `skip`/`take`, verified directly by a test that fetches three pages of a 25-attendee list and confirms no overlap and the correct final partial page.

## 10. Event capacity update

Revisiting Phase 4's `EventsService.update` (§28/§29): when `dto.capacity` is present, the update now runs inside a `prisma.$transaction` that locks the **same event row** RSVP locks, via the same `EventsRepository.findByIdForUpdate`:

```
BEGIN
  SELECT ... FOR UPDATE          -- same lock RsvpService.join takes
  COUNT(*) FROM event_attendees WHERE eventId = ?
  if newCapacity < count: ConflictException (409), rollback
  UPDATE events SET capacity = ? WHERE id = ?
COMMIT
```

Non-capacity field updates (title, description, location, dates) skip this transaction entirely and go through the plain, unlocked `EventsRepository.update` — they don't touch the `attendees <= capacity` invariant, so locking for them would only add unnecessary contention against RSVP for no correctness benefit (§29: "do not blindly add locks everywhere").

Because both operations lock the identical row, they serialize against each other exactly the way two concurrent RSVPs do: whichever transaction acquires the lock first completes its entire check-then-write atomically before the second one can even begin its own check. The second transaction, once it acquires the lock in turn, sees fully up-to-date state — either the new capacity (if the update committed first) or the new attendee (if the RSVP committed first) — and makes its decision against that, never against stale data. This is what closes the exact race in §29's example (capacity reduced to 50 while a 100th attendee concurrently joins): the two possible outcomes are (a) the reduction commits first, so the 100th RSVP is evaluated against the new capacity 50 and correctly rejected as full, or (b) the RSVP commits first, so the reduction is evaluated against 100 existing attendees and correctly rejected as being below the new capacity — **never** both succeeding into an impossible `capacity=50, attendees=100` state.

## 11. Concurrency scenarios

All five verified with real concurrent HTTP requests (`Promise.all`) against the real app and real Postgres, run repeatedly to confirm determinism (§61):

| Scenario | Result |
|---|---|
| **capacity=1, 20 concurrent users** | Exactly 1 `201`, 19 `409`. DB count: 1. |
| **capacity=10, 50 concurrent users** | Exactly 10 `201`, 40 `409`. DB count: 10. |
| **Same user, 15 concurrent RSVPs** | Exactly 1 `201`, 14 `409`. DB count for that user/event: 1. |
| **capacity=1, User A and User B each fire 10 concurrent RSVPs (20 total, interleaved)** | Exactly 1 `201` total across both users combined. DB count: 1. |
| **capacity update (→50) racing a concurrent RSVP, starting at 99/100 attendees** | Exactly one of the two requests succeeds; the other gets `409`. Final state always satisfies `attendeeCount <= capacity` — verified directly against the database after the race, not assumed. |

Every test asserts the **database state**, not just HTTP response codes — an implementation with a subtle race could plausibly return the right *number* of `201`s while still leaving the database in a corrupted state (e.g., an extra attendee, or an orphaned row); these tests check the actual row counts in Postgres after every scenario.

## 12. Database consistency

`event_attendees.eventId → events.id` remains `ON DELETE CASCADE` (Phase 2, unchanged). Re-verified in this phase specifically with a *real* RSVP created through the API (not just synthetic Phase 2 test rows): create an event, RSVP a real user through `POST /events/:id/rsvp`, confirm the attendee row exists, delete the event through `DELETE /events/:id`, confirm the attendee row is gone — the database's own foreign-key behavior handles the cleanup; `EventsService.delete` still contains no manual attendee-deletion code, per §27's explicit instruction not to duplicate what the database already guarantees.

**Event deletion racing a concurrent RSVP** (§61 Scenario F) was reasoned through rather than given its own dedicated test: a `DELETE FROM events WHERE id = ...` also requires Postgres to acquire a lock on that row, so it serializes against a concurrent `SELECT ... FOR UPDATE` the same way two RSVPs do. If the delete commits first, the row is gone and the RSVP transaction's own `SELECT ... FOR UPDATE` simply returns no rows, which the existing code already handles as `404`. If the RSVP commits first, the delete proceeds afterward and the `CASCADE` removes the newly-inserted attendee row along with everything else. Either ordering ends in a valid, non-orphaned state without any new code — a direct consequence of both operations locking the same row and the foreign key's `CASCADE` behavior, not something that needed separate handling.

## 13. Raw SQL

**Location:** `EventsRepository.findByIdForUpdate` — the *only* raw SQL in the codebase.

**Why:** Prisma's high-level query API (`findUnique`, `findMany`, etc.) has no method to express PostgreSQL's `SELECT ... FOR UPDATE` row locking — this is confirmed by inspecting Prisma's own query-building API surface; there is no `lock` or `forUpdate` option anywhere in it. Row locking is the mechanism this entire phase's correctness depends on, so raw SQL is genuinely necessary here, not a convenience shortcut.

**The query:**
```ts
const rows = await tx.$queryRaw<EventLockRow[]>`
  SELECT id, capacity, "startsAt", "createdBy"
  FROM events
  WHERE id = ${id}::uuid
  FOR UPDATE
`;
```

**Parameterization:** Prisma's tagged-template `$queryRaw` automatically parameterizes every interpolated value (`${id}` becomes a bound parameter, never string-concatenated into the SQL text) — this is Prisma's own documented safe-raw-query mechanism, not a manual escaping scheme this project built. There is no injection surface regardless of what `id` contains; malformed values are also caught earlier by `ParseUUIDPipe` on the route parameter before this query ever runs.

**Isolation:** this is the only method in the entire codebase that issues raw SQL — every other query, in every other repository, uses Prisma's typed query builder. It's a single, small, heavily-commented method, not a pattern spread across the codebase.

**Column quoting:** `"startsAt"`/`"createdBy"` are double-quoted because Prisma's schema uses camelCase column names, which Postgres would otherwise fold to lowercase and fail to find.

**Transaction-scoping:** the method's only parameter is `tx: Prisma.TransactionClient` — there is no overload that accepts the plain `PrismaService`, because a lock acquired outside a transaction is released the instant that statement finishes, providing no protection at all. Making the transaction client the only accepted input makes the mistake structurally harder to make, not just documented against.

## 14. Tests

**Unit — `rsvp.service.spec.ts` (12 tests, no database):** successful join with correct authoritative counts; the whole decision happens inside one `$transaction` call; `404` for a missing event; `409` for a duplicate (app-level check); `409` for a full event; `409` for an already-started event; a hypothetical `P2002` race is translated to the same friendly duplicate message; cancellation success/not-attending/missing-event; attendee listing pagination and that `passwordHash` never appears.

**Unit — `events.service.spec.ts` (extended):** capacity increases proceed through the locked transaction; capacity reductions below the current attendee count are rejected; a reduction to exactly the current count is allowed.

**E2E — `test/rsvp.e2e-spec.ts` (25 tests, real Postgres):**
- Basic join flow: auth required, success with correct counts, spoofed `userId` in the body is inert (identity is always the JWT's), duplicate → `409`, missing event → `404`, malformed id → `400`, full event → `409` (with a DB-level check that nothing was inserted), already-started event → `409`.
- Cancel flow: auth required, success (and the freed spot is immediately takeable by someone else), not-attending → `404`, missing event → `404`.
- Attendee listing: auth required, missing event → `404`, correct `joinedAt` ordering, real pagination across three pages with no overlap.
- Event responses reflect live `attendeeCount`/`availableSpots`.
- Event deletion cascades to real, API-created attendee rows.
- Capacity-vs-attendee-count: rejection below the count, success at exactly the count.
- **The five concurrency scenarios from §11**, each firing genuine concurrent HTTP requests and asserting real database state afterward.

Every test run was repeated multiple times during development specifically to check for flakiness (§63's explicit instruction) — all runs were fully deterministic; no retry logic or flakiness workaround was needed or added.

Test users/events are tagged under a dedicated email domain and removed in `afterAll`; verified zero leftover rows after a full run.

## 15. Test results

```
npm run build            →  pass
npm run lint               →  pass (0 problems)
npm run format:check       →  pass
npm test                   →  pass (57 tests, 7 suites — no database required)
npm run test:e2e           →  pass (76 tests, 4 suites — against real Postgres)
npm run test:db            →  pass (13 tests, 2 suites — unchanged from Phase 2)
npx prisma validate        →  "The schema at prisma/schema.prisma is valid"
```

The RSVP e2e suite specifically (including all 5 concurrency tests) was run 4 times in direct succession during development: 25/25 passed every time.

## 16. Swagger

All three endpoints fully documented: `@ApiBearerAuth('access-token')` (all require auth — applied once at the controller level via `@UseGuards(JwtAuthGuard)`/`@ApiBearerAuth` on `RsvpController` itself, rather than repeated per-route, since every route in this controller needs it), `@ApiParam` for the `:id` path parameter, and accurate `@ApiResponse` entries for every status code each endpoint can actually return (`400`/`401`/`404`/`409` where applicable — verified against `/api/docs-json` directly). `EventResponseDto` (Phase 4) now documents `attendeeCount`/`availableSpots` too.

## 17. Security review

- **User identity:** `userId` is never accepted from any request — `RsvpController.join`/`cancel` have no `@Body()` parameter at all, so there is nothing for a client to supply; the only source of identity is `@CurrentUser()`, populated by the already-verified JWT. Verified directly: a request that includes a spoofed `userId` in its body is completely ignored, and the RSVP is correctly attributed to the actual authenticated caller, never the spoofed target.
- **Event ID validation:** `ParseUUIDPipe` on every `:id` parameter across both `EventsController` and `RsvpController` (extended to Events' routes too in this phase, for consistency, once RSVP's explicit `400`-on-malformed-id requirement made the existing gap in Phase 4's controller visible) — malformed IDs never reach a query, raw or otherwise.
- **Attendee information:** `id`/`name`/`email` only, via the same explicit-select discipline as every other user-facing query in the app — `passwordHash` is never fetched from the database for this response in the first place.
- **Safe errors:** every RSVP-specific failure (duplicate, full, already started, not attending) is a plain `HttpException` subclass with a fixed, non-leaking message; the one place a raw Prisma error could theoretically surface (a hypothetical `P2002` race) is caught and translated.
- **Transaction safety:** every operation that must participate in the lock uses the transaction-scoped client, passed explicitly — never the ambient `PrismaService` for a step that needs to see the locked, in-progress state.

## 18. ADRs

See the full section below. Summary: **ADR-018** commits to PostgreSQL row-level locking (not an app-level or Redis lock) as the RSVP concurrency mechanism; **ADR-019** reaffirms the database unique constraint as the final duplicate-RSVP authority, application checks notwithstanding; **ADR-020** commits to PostgreSQL (not Redis, not application memory) as the sole source of truth for attendee state and counts.

## 19. NestJS concepts learned

- **Interactive transactions (`prisma.$transaction(async (tx) => ...)`)** — not a NestJS concept specifically, but the pattern that makes this phase's `RsvpService` and `EventsService` structurally different from every prior service: business logic, not just a single query, now lives inside a callback whose every database call must consistently use one specific client instance (`tx`) rather than the module-wide injected one. This is a discipline NestJS's DI doesn't enforce for you — nothing stops a developer from accidentally calling `this.prisma.something()` instead of `tx.something()` inside the callback; avoiding that bug is a matter of deliberate API design (making `tx` a required parameter on every method that needs to participate) rather than something the framework catches.
- **Cross-module repository reuse** — `RsvpModule` importing `EventsModule` specifically to use `EventsRepository` (not `EventsService`) is a concrete example of choosing the right layer to depend on: `RsvpService` needed the *persistence* operations (`findByIdForUpdate`, `countAttendees`), not `EventsService`'s HTTP-facing business logic (ownership checks, response DTOs), so depending on the repository directly — one layer down from what a controller would use — was the correct, minimal cross-module dependency, and it's what avoided a circular-import trap that a naive "just inject EventsService" choice would have created (see the countAttendees placement discussion this phase's implementation notes cover).

## 20. Skill compliance

Followed: the installed `nestjs-best-practices` skill's `db-use-transactions` rule directly — this phase's entire `RsvpService.join` is its recommended pattern (wrap multi-step, must-succeed-or-fail-together operations in `$transaction`), scaled up from the skill's simpler order/inventory example to a row-locked capacity decision. Constructor injection throughout, no business logic in either repository, services throwing `HttpException` subclasses directly, and explicit field selection to avoid over-fetching — all continued from every prior phase.

No deviations from the skill this phase.

## 21. Known limitations

- No rate limiting on the RSVP endpoints yet (unchanged limitation from Phase 3, applies here too — flagged as a future hardening item).
- Attendee email is visible to any authenticated user viewing the list, not restricted to the event creator (§9's documented, deliberate scope decision).
- Capacity=1 with very high concurrency (hundreds of simultaneous requests) will serialize entirely through the single row lock, which is correct but means throughput for one specific very-popular, very-small-capacity event is bounded by lock contention — not a concern at this project's expected scale, and the correct trade-off (correctness over throughput) for what capacity enforcement fundamentally requires.
- No RSVP waitlist — a full event simply rejects further RSVPs; not requested for this phase.

## Architecture Decisions (ADR-018 – ADR-020)

**ADR-018 — PostgreSQL Row-Level Locking for RSVP Capacity**
Decision: `SELECT ... FOR UPDATE` on the event row, inside a transaction encompassing the entire capacity-decision-and-insert.
Reason: RSVP capacity is a concurrency-sensitive invariant that a naive read-then-write sequence cannot protect (Phase 5 §6). Row-level locking makes PostgreSQL itself the serialization point for decisions about the same event, which is correct regardless of how many application instances are running.
Trade-off: concurrent RSVPs for the *same* event are serialized (a brief lock wait); RSVPs for *different* events are entirely unaffected and proceed in full parallel. Verified acceptable at this project's scale — the concurrency tests complete in well under a second even at 50 simultaneous requests.

**ADR-019 — Database Unique Constraint as Final Duplicate-RSVP Authority**
Decision: `UNIQUE(eventId, userId)` (Phase 2) remains the authoritative protection; the application-level duplicate check (inside the lock) is the normal path, not a replacement for it.
Reason: an application-level check alone is inherently racy outside a lock, and even inside one, defense in depth against a bug or an edge case in the locking logic is cheap insurance — a constraint violation is nearly free to catch and translate.
Trade-off: the application must handle a hypothetical `P2002` gracefully rather than letting it surface as a raw error — a few extra lines (`createAttendeeSafely`), not a meaningful cost.

**ADR-020 — PostgreSQL as the RSVP Source of Truth**
Decision: attendee state and counts are read directly from `EventAttendee` via real queries every time — no Redis, no application-memory cache, no denormalized `Event.attendeeCount` column.
Reason: strong consistency requirements (an attendee count that's ever wrong, even briefly, defeats the entire point of this phase) are far simpler to guarantee with a single source of truth than with a cache that needs to be kept in sync with it. This project's scale does not need the read-performance a cache would buy, and Prisma's relation-count feature already keeps the "show attendeeCount on every event in a list" case free of N+1 without one.
Trade-off: every attendee-count read is a real query rather than an O(1) lookup — negligible at this project's scale, and the correct trade-off given the alternative is a second system that can drift from the truth.

## 22. Phase 6 preparation

Phase 6 focuses on hardening rather than new features:

- Rate limiting (`@nestjs/throttler`), specifically on `/auth/login`, `/auth/register`, and the RSVP endpoints — flagged as a known gap in Phases 3 and 5.
- A final consistency pass over error handling, logging, and request-ID propagation across every module.

## Addendum — `GET /events/:id/rsvp` (added during frontend Phase 6)

This backend was marked complete and audited after backend Phase 8 (see `phase.md`: "No further backend phases are scoped"). One small addition was made afterward, while building the frontend's Phase 6 (RSVP UI):

**Why:** `EventResponseDto` has no per-viewer field, and `GET /auth/me` carries no RSVP data either — there was genuinely no way for the frontend to know "is the current authenticated user already attending this event" without paginating through `GET /events/:id/attendees` and scanning every page for a matching user id, which doesn't scale and isn't what that endpoint is for. This was confirmed by inspection before writing any code, and the user explicitly chose the endpoint approach over the alternatives (scan attendees, or infer status reactively from mutation errors only) before it was implemented.

**What was added:**
- `GET /events/:id/rsvp` — new route on the existing `RsvpController` (same `JwtAuthGuard`/`ApiBearerAuth` as `join`/`cancel`/`listAttendees`, no new guard logic).
- `RsvpService.getStatus(eventId, currentUser)` — one `eventsRepository.findById` existence check (404 if missing, same as `cancel`/`listAttendees`) plus one `rsvpRepository.findAttendee` call, the exact same single indexed `eventAttendee.findUnique` lookup on `eventId_userId` that `join`/`cancel` already use to check existence. No new query pattern, no lock, no transaction — this is a plain read of current state, not a decision that needs race-freedom against a concurrent join/cancel.
- `RsvpStatusResponseDto` — `{ attending: boolean, joinedAt: Date | null }`, nothing else.

**What was deliberately not changed:** `EventResponseDto`, `GET /events` (still fully public, no auth requirement added), `GET /events/:id` (same), and every other existing route/response shape — all untouched. This keeps the addition additive and isolated: existing frontend code (Phases 4–5) and existing tests needed zero changes because of it.

**Tests added:** 3 new unit tests (`rsvp.service.spec.ts`'s `getStatus` block — 404, not-attending, attending) and 5 new e2e tests (`rsvp.e2e-spec.ts` — auth required, false before joining, true with a real `joinedAt` after joining, false again after cancelling, 404 for a nonexistent event) against the real HTTP stack and real Postgres. Full suite re-run after the change: 62/62 unit tests and 33/33 RSVP e2e tests pass, including every pre-existing concurrency/capacity test, unaffected.

**Deployment note:** this change exists in the local backend and its git history but has not been deployed to the Render production API as of this addendum — the frontend's local development against this change is verified; redeploying the live API is a separate, explicit decision for whoever owns that deployment to make.
- Security hardening review across the whole API surface (not just what individual phases flagged).
- Production readiness: environment validation review, graceful shutdown behavior under load, and a final performance review of the query patterns introduced across Phases 2–5.

Not starting Phase 6 until instructed.
