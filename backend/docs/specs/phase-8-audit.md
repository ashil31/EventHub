# Phase 8 — Final Senior-Level Backend Audit, Testing & Observability

Status: **Complete. Audit passed.** No new business features — this phase reviewed, tested, and hardened the existing system; it is the last backend phase before the React frontend.

## A. Executive Summary

**The repository passes this audit.** Every core invariant (authentication, ownership, RSVP identity, duplicate-RSVP prevention, capacity-under-concurrency, event-time rules, database authority) was traced through the actual code line by line, then proven under real concurrent HTTP load against real PostgreSQL — not just asserted. Two genuine gaps in concurrency test coverage (the cancellation race and the event-deletion race explicitly required by this phase) were found and closed with new tests, both of which pass and confirm the underlying implementation was already correct — no application-code change was needed for either invariant to hold. One real operational bug was found and fixed: `nest-cli.json`'s `deleteOutDir: true` deterministically crashed `npm run start:dev`. A lightweight security review (SQL injection, oversized input, mass assignment, RSVP impersonation, auth/authorization bypass) found nothing exploitable; the two checks that weren't already covered by existing e2e suites (SQL injection, oversized input) are now permanent automated tests, not one-off manual checks. Dependency, dead-code, and TypeScript-strictness audits found nothing to remove or tighten — the codebase was already clean.

**What did NOT pass without qualification:** four high-severity `npm audit` findings remain (documented, dev-tooling-only, unfixable without a Prisma downgrade — see G/L below), and this phase's own instruction not to claim untested things as tested is honored throughout — CI and Railway deployment were validated by faithfully reproducing their exact steps locally, not by actually running them on GitHub's infrastructure or a real Railway project (see F/H/L).

**Context:** partway through this phase, the repository was also restructured into a monorepo (`backend/` + a future `frontend/`) at the user's explicit request — see ADR-028. This was a mechanical move (every file's content is unchanged), verified by re-running the full build/lint/test suite from the new location before continuing the audit.

## B. Architecture

```text
                    React (frontend/, not started)
                              │
                              ▼
                        NestJS API (backend/)
                              │
        ┌─────────────┬───────┴───────┬─────────────┐
        │             │               │             │
      Auth          Events         RSVP          Health
   (JWT/Argon2)   (CRUD, own-    (join/cancel/  (liveness/
                   ership)        attendees)     readiness)
        │             │               │
        └──────┬──────┴───────┬───────┘
               │               │
          UsersRepository  EventsRepository / RsvpRepository
               │               │
               └───────┬───────┘
                        ▼
                  PrismaService (single client, driver-adapter-based)
                        │
                        ▼
                  PostgreSQL (sole source of truth)
```

Deployment:

```text
GitHub
   │
   ▼
GitHub Actions (backend/, working-directory-scoped)
   │
   ▼
Railway
 ┌───────────────────────┐
 │ NestJS API container  │
 │ (this Dockerfile)     │
 │        +              │
 │ Railway PostgreSQL    │
 └───────────────────────┘
```

**Module boundaries, confirmed by re-reading every module file this phase:** `UsersModule` exports `UsersRepository` (consumed by `AuthModule`); `EventsModule` exports `EventsRepository` (consumed by `RsvpModule`, specifically for `findByIdForUpdate`/`countAttendees` — the row-lock primitive both RSVP and capacity-updates share); `PrismaModule` is `@Global()` (the skill-recommended exception for a database connection). No module imports another's controller or service directly — only repositories cross module boundaries, and only where genuinely shared. No circular dependencies exist: `RsvpModule` imports `EventsModule`, never the reverse.

**Dependency direction is consistently controller → service → repository → Prisma → PostgreSQL**, with zero exceptions found. Controllers contain no business logic (every handler is a one-line delegation to a service method). Services contain no HTTP-specific concerns (no `@Req()`/`@Res()`, no status-code literals — they throw semantic exceptions like `ForbiddenException` and let Nest/the global filter translate them). Repositories contain no business rules — `EventsRepository`/`RsvpRepository`/`UsersRepository` are pure Prisma query wrappers with explicit field selection, nothing else.

**Configuration boundary:** `src/config/configuration.ts` is the only file that reads `process.env` directly, with one documented, framework-forced exception — `AuthController`'s `@Throttle()` override values, which must be read at module-load time (before Nest's DI container exists) because decorator arguments can't depend on `ConfigService`.

## C. Security

| Area | Status | Evidence |
|---|---|---|
| Authentication | JWT (`@nestjs/jwt`), Argon2id hashing (OWASP 2023 minimum config), secret validated at startup (≥32 chars, rejects the `.env.example` placeholder in production) | `auth.e2e-spec.ts`, live-verified this phase (no/invalid/tampered/expired token all → 401) |
| Authorization | Server-derived ownership only (`event.createdBy === currentUser.id`); no client-supplied id ever trusted | `events.e2e-spec.ts` cross-user 403 tests, live-verified |
| Validation | Global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`) on every route; every DTO has explicit type/format/length/range validators | Confirmed by reading every DTO in the codebase this phase |
| Mass assignment | `CreateEventDto` has no `createdBy` field; a client-supplied one is rejected outright (400), not silently dropped | `events.e2e-spec.ts` |
| RSVP impersonation | RSVP routes take no `@Body()` at all — a spoofed `userId` is never read | `rsvp.e2e-spec.ts` |
| SQL injection | All queries go through Prisma's parameterized query builder; the one raw SQL statement (`SELECT ... FOR UPDATE`) uses `$queryRaw` tagged-template parameterization | Live-verified this phase with three injection payloads against `search` — all treated as literal strings, zero rows matched, users table unaffected; now permanent tests in `security.e2e-spec.ts` |
| Oversized input | Every string field has `@MaxLength`; pagination `limit` capped at 100 | Live-verified (title, search, password, pagination limit) — now permanent tests |
| Rate limiting | `@nestjs/throttler`, per-user (else per-IP), stricter limit on `/auth/register`/`/auth/login` | Live-verified this phase: repeated `/auth/login` calls returned `429` after the configured limit, with correct headers |
| CORS | Environment-driven via `FRONTEND_URL`; denies all origins in production if unset (never a wildcard) | Code review (`src/main.ts`) |
| Helmet | Applied globally | Confirmed present on live responses this phase (CSP, HSTS, X-Content-Type-Options, etc.) |
| Secret management | `.env` gitignored, never committed; `.env.example` contains only placeholders; JWT_SECRET/DATABASE_URL never logged or returned in any response | Live-verified: `/auth/me` response and structured logs inspected directly this phase, contain neither |
| Logging redaction | Pino `redact` strips `Authorization`/`Cookie` headers, `Set-Cookie`, `password`/`passwordHash` body fields | Code review confirms config; live logs from this phase's testing contain none of these |

## D. Database

**Schema** (`prisma/schema.prisma`): three tables — `users`, `events`, `event_attendees`. Re-read in full this phase; unchanged from Phase 2/5.

**Constraints, all confirmed both in the schema and by live database tests (`test/database/constraints.spec.ts`, re-run this phase):**
- `users.email` — `UNIQUE`
- `events.createdBy → users.id` — `RESTRICT` (deleting a user who owns events fails, rather than silently orphaning or cascading their events — a deliberate choice, ADR from Phase 2)
- `events.capacity` — `CHECK (capacity > 0)`, added by hand to the migration since Prisma's schema language has no native CHECK syntax
- `event_attendees.eventId → events.id` — `CASCADE`
- `event_attendees.userId → users.id` — `CASCADE`
- `event_attendees(eventId, userId)` — composite `UNIQUE`, the actual final authority against duplicate RSVP under any concurrency scenario

**Indexes**, each tied to a real query pattern (no speculative indexes found or added): `events.createdBy` (ownership lookups), `events.startsAt` (upcoming-events ordering/filtering), `event_attendees.userId` (in addition to the composite unique index, which serves `eventId`-leading lookups). No new query pattern was introduced this phase, so no new indexes were needed.

**Timestamps:** `createdAt`/`updatedAt` on `User` and `Event` (`@default(now())`/`@updatedAt`), `joinedAt` on `EventAttendee` (`@default(now())`) — all database-generated, never client-supplied, consistent across the schema.

**Migrations:** one migration (`20260924183554_init`), applied via `prisma migrate deploy` in every environment (local, CI, and the documented production path) — `prisma db push` is never used anywhere in the codebase or docs.

**Transaction boundaries** — every `$transaction` call in the codebase, audited individually:

| Location | Why required | What's inside |
|---|---|---|
| `RsvpService.join` | Atomically lock the event row, verify it, check duplicate/capacity, and insert — must all observe the same consistent snapshot under the lock | `findByIdForUpdate` (locks), `findAttendee`, `countAttendees`, `createAttendee` — all passed the transaction-scoped `tx` client |
| `EventsService.update` (capacity-change path only) | Locking the same event row RSVP locks is what prevents the capacity-reduction-vs-RSVP race | `findByIdForUpdate`, `countAttendees`, `update` — all passed `tx` |

No transaction was found providing no value; none was removed. Non-capacity event updates and `RsvpService.cancel` deliberately use **no** transaction — correctly, since a plain delete can never push `attendeeCount` above `capacity` (removing a row can't violate that invariant), so there's nothing to protect against a race for those operations. This was verified, not assumed: the new cancellation-race test (F below) proves the invariant holds even without a lock there.

**Raw SQL** — exactly one statement in the entire codebase, `EventsRepository.findByIdForUpdate`'s `SELECT ... FOR UPDATE`, re-inspected this phase: parameterized via Prisma's `$queryRaw` tagged template (the `id` is interpolated through Prisma's own escaping, never string concatenation), documented inline, and exists solely because Prisma's high-level query API has no way to express PostgreSQL row locking. No other raw SQL exists anywhere.

**Query efficiency:** every list/detail query uses Prisma's `_count` relation-count feature for `attendeeCount` (one SQL statement with a subquery, not N+1), explicit `select`/`include` everywhere (the creator relation always selects only `id`/`name`/`email`, never `passwordHash`), and pagination is `skip`/`take` at the database layer — never "load everything and slice in JavaScript." Confirmed by re-reading `EventsRepository` and `RsvpRepository` in full this phase; no N+1 pattern found anywhere.

## E. RSVP Concurrency

**The invariant:** `attendeeCount <= event.capacity`, always, even under many simultaneous requests for the same event.

**The mechanism**, re-verified line by line against `RsvpService.join` this phase and confirmed to match the required flow exactly:

```text
POST /events/:id/rsvp
        │
        ▼
   authenticate (JwtAuthGuard)
        │
        ▼
   BEGIN TRANSACTION (prisma.$transaction)
        │
        ▼
   SELECT ... FOR UPDATE   -- locks the event row (findByIdForUpdate)
        │
        ▼
   verify event exists (else 404, rolls back)
        │
        ▼
   verify event hasn't started (else 409, rolls back)
        │
        ▼
   check duplicate RSVP (findAttendee, else 409, rolls back)
        │
        ▼
   count attendees (countAttendees)
        │
        ▼
   compare with capacity (else 409, rolls back)
        │
        ▼
   INSERT attendee
        │
        ▼
   COMMIT (lock released)
```

Confirmed the implementation does **not** do the unsafe `COUNT → COMMIT → INSERT` ordering the phase brief warns against — the insert happens *inside* the same transaction as the count, before commit, while the lock is still held.

**Why this actually works:** `SELECT ... FOR UPDATE` locks the event row for the transaction's duration. A second concurrent request for the *same* event blocks at that exact line until the first transaction commits or rolls back — it cannot proceed to its own count/capacity check against stale data. The database, not application code, is what makes this race-free.

**Proof, not assertion** — every concurrency scenario the phase demands was run against the real app and real Postgres via genuinely concurrent `Promise.all` requests (never sequential `await`s), asserting actual database row counts:

| Scenario | Result |
|---|---|
| capacity=1, 20 concurrent RSVPs | exactly 1 success, 19 conflicts, DB count = 1 |
| capacity=10, 50 concurrent RSVPs | exactly 10 successes, 40 conflicts, DB count = 10 |
| one user, 15 concurrent RSVPs (duplicate protection) | exactly 1 success, DB count = 1 |
| capacity=1, two users racing (10 each, interleaved) | exactly 1 success total, DB count = 1 |
| capacity update racing a concurrent RSVP | exactly one of the two requests gets `409`; `attendeeCount <= capacity` holds afterward regardless of which won |
| **(new, Phase 8)** cancel racing a concurrent rejoin, 10 independent trials | DB row count for that (event, user) pair never exceeds 1, in every trial |
| **(new, Phase 8)** event deletion racing a concurrent RSVP, 10 independent trials | event always ends up deleted; RSVP either succeeds-then-gets-cascaded or correctly 404s; zero orphaned attendee rows in every trial |

All eight scenarios re-run twice in immediate succession during this phase with identical results both times — no flakiness observed.

**Duplicate-RSVP defense in depth:** the application checks for an existing RSVP inside the locked transaction (the normal path), and the database's `UNIQUE(eventId, userId)` constraint is the backstop — if a `P2002` violation ever reached the insert anyway, `RsvpService.createAttendeeSafely` catches it and returns the same friendly `409`, never a raw database error.

## F. Testing

```
npm run lint            → pass (0 problems)
npm run format:check    → pass
npm run build             → pass
npx prisma validate       → "The schema at prisma/schema.prisma is valid"

Unit tests (npm test, no database):                  59 tests, 7 suites — pass
E2E tests (npm run test:e2e, real Postgres):          89 tests, 5 suites — pass
  - auth.e2e-spec.ts, events.e2e-spec.ts, health.e2e-spec.ts, rsvp.e2e-spec.ts (unchanged tests)
  - rsvp.e2e-spec.ts: +2 new concurrency tests (cancellation race, deletion race)
  - security.e2e-spec.ts (NEW): 8 tests — SQL injection resistance (3 payloads +
    a post-injection sanity check), oversized-input rejection (4 fields)
Database tests (npm run test:db, real Postgres):      13 tests, 2 suites — pass
Rate-limit tests (npm run test:throttle):              3 tests, 1 suite — pass

Total: 164/164 passing
```

**Security (live, manual, this phase, in addition to the now-automated suite above):** authentication bypass (protected routes without a JWT → 401, confirmed live), authorization bypass (cross-user event mutation → 403, already covered by the automated suite), mass assignment and RSVP impersonation (already covered by the automated suite, re-confirmed by reading the tests), readiness under a real database outage (see below), rate-limit enforcement (see below).

**Readiness under real PostgreSQL outage** — not just unit-tested (`startup-failure.spec.ts` already covered `PrismaService.onModuleInit` rejecting), but tested live against a running instance: with the app already serving traffic, `docker compose stop postgres` was run, then `GET /api/v1/health/ready` was hit — it returned `503` with the safe generic message `"Database unavailable"` (no connection string, no driver error, no stack trace), while `GET /api/v1/health` continued returning `200` throughout, exactly as the liveness/readiness split is designed to behave. Postgres was restarted and readiness recovered to `200` automatically, with no application restart needed.

**Rate limiting, live:** eight rapid `POST /auth/login` requests (wrong credentials) in the same window — the first several returned `401` (correct, no user enumeration), then further requests returned `429` once the configured limit was reached, matching the shared-bucket-per-IP design.

**Concurrency (Docker smoke test only ran the non-concurrent flow — the full concurrency proof runs against the dev/CI PostgreSQL, as shown in E above), not inside a container**, since spinning up 20-100 concurrent connections against a containerized instance for this audit added no new information beyond what E already proves against the same real Postgres.

**Docker smoke test — full detail in H below.**

## G. CI/CD

`.github/workflows/ci.yml` (two jobs, both scoped to `backend/` via `defaults.run.working-directory`):

- **`test`**: a GitHub Actions Postgres 16 service container, then `npm ci` → `prisma migrate deploy` → lint → format check → build → unit tests → e2e tests (including every concurrency scenario in E) → db tests → throttle tests.
- **`docker`**: builds the production image, starts an independent Postgres container, runs migrations from the runner's own toolchain, starts the built image, polls `/api/v1/health/ready`, smoke-tests the live API, verifies a clean SIGTERM shutdown (exit code 0), then tears everything down.

**What was and wasn't actually run this phase:** every command in both jobs was executed locally, in the same order, against the same kind of fresh Postgres container the workflow itself uses — this is what F and H above report. The workflow file itself has **not** been executed on GitHub's own Actions runners, since that requires pushing to a GitHub-hosted remote, which is outside this phase's scope. The distinction matters and is stated plainly per this phase's own instruction not to claim untested things as tested — see L.

## H. Deployment

**Railway readiness**, per `railway.json` and the README's 11-step guide: Dockerfile-based build, health check pointed at liveness (`/api/v1/health`, not readiness — a deliberate Phase 7 decision re-confirmed correct this phase), `DATABASE_URL` supplied by Railway's own Postgres, `PORT` supplied by Railway and respected (`app.listen(port, '0.0.0.0')`), migrations run as an explicit step decoupled from the container (see Phase 7's `phase-7-deployment.md` for the full reasoning — re-confirmed unchanged this phase).

**What was actually tested this phase (locally, via Docker — not on Railway itself):**
1. `docker build --no-cache` from a clean state — succeeds, 555MB image (identical to Phase 7's measured size; unchanged since no dependency or Dockerfile-logic change was made).
2. Container started against the real `docker-compose` Postgres over the shared Docker network.
3. Confirmed non-root: `docker exec ... whoami` → `nestjs`; `id` → `uid=1001(nestjs) gid=1001(nodejs)`.
4. Full API flow against the running container in `NODE_ENV=production`: register → login → create event → RSVP → list attendees → delete event, plus Swagger reachable at `/api/docs` (`200`).
5. Graceful shutdown: `docker stop -t 10` → exit code `0`, `"Disconnected from PostgreSQL"` logged, confirming Nest's shutdown hooks + `PrismaService.onModuleDestroy` work correctly inside the actual container, not just in a test mock.

**What was NOT tested this phase:** an actual deployment to Railway's infrastructure. No Railway project exists for this repository yet. The deployment guide in the README is accurate and has been cross-checked against the Dockerfile/`railway.json`/environment-variable contract, but "the guide is correct" and "it was deployed and verified" are different claims, and only the former is made here.

## I. Performance

**Actual optimizations already in place** (Phase 4/5, re-confirmed this phase, not newly added): database-level pagination (`skip`/`take`, never in-memory slicing), `_count` relation-counting for `attendeeCount` (avoids N+1 across every event list), explicit field selection everywhere (never over-fetching, never accidentally including `passwordHash`), parameterized `contains` search (correct, not necessarily fast — see below).

**No caching was added.** This phase found no concrete, demonstrated bottleneck that would justify one — per the phase's own instruction, correctness and simplicity outweigh premature optimization at this project's scale.

**No benchmarks were measured.** This report does not claim any latency or throughput numbers, because none were captured — inspection of the query patterns above is the actual basis for the performance statements in this section, not measurement. If real load numbers are ever needed, that would be a deliberate, separate exercise (e.g. `autocannon`/`k6` against a seeded database), not something to fabricate here.

**Known, already-documented performance trade-off, unchanged this phase:** `search` is a plain case-insensitive `contains` query with no supporting index, meaning it's a sequential scan. Correct and fine at this project's current scale; a `pg_trgm` GIN index is the documented next step if search volume or dataset size ever make it a real bottleneck (Phase 4 ADR).

## J. Code Quality

- **Strict TypeScript:** `tsconfig.json` has `"strict": true` plus `noImplicitAny`, `strictNullChecks`, `strictBindCallApply`, `noFallthroughCasesInSwitch`, `noImplicitReturns` all explicitly enabled. Unchanged this phase — nothing was weakened to make anything pass.
- **`any`/`@ts-ignore`/`@ts-expect-error`:** grepped across the entire `src/` and `test/` trees this phase. Zero occurrences of `@ts-ignore` or `@ts-expect-error`. No genuine untyped `any` usage — the only "any"-containing matches were substrings inside unrelated words/comments (e.g. "any future," "Deletes...if any").
- **`eslint-disable`:** six occurrences, all previously documented, all the same well-understood pattern — `@typescript-eslint/unbound-method` and `@typescript-eslint/no-unsafe-assignment` false positives on Jest's `expect.any()`/mock-function assertions, not real type-safety issues. Re-reviewed this phase; none are unnecessary, none were added or removed.
- **Lint/format:** `npm run lint` (0 problems) and `npm run format:check` both pass.
- **Dead code:** grepped for `TODO`/`FIXME`/`XXX`/`HACK`, commented-out code blocks, and stray `console.log` calls across the entire codebase this phase. Found none. Nothing was removed because nothing dead was found.
- **Dependency review:** every production dependency justified individually — see J's continuation below (this phase's dependency audit, section 27 of the brief).

**Dependency audit (`package.json`, `package-lock.json`):**

| Dependency | Why EventHub needs it |
|---|---|
| `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express` | The framework itself |
| `@nestjs/config` | `ConfigModule`/`ConfigService` — the app's single env-var access point |
| `@nestjs/jwt` | Signs/verifies access tokens |
| `@nestjs/passport`, `passport`, `passport-jwt` | The JWT auth strategy (`JwtStrategy`) |
| `@nestjs/swagger` | Generates `/api/docs`, the assignment's explicit documentation requirement |
| `@nestjs/throttler` | Rate limiting (Phase 6) |
| `@prisma/client`, `@prisma/adapter-pg`, `pg` | The database layer — Prisma 7 requires an explicit driver adapter, which wraps `pg` |
| `argon2` | Password hashing |
| `class-transformer`, `class-validator` | DTO validation/transformation, driving the global `ValidationPipe` |
| `helmet` | Security headers |
| `nestjs-pino`, `pino`, `pino-http` | Structured logging with request correlation |
| `reflect-metadata` | Required by Nest's/`class-validator`'s decorator metadata |
| `rxjs` | Required peer of `@nestjs/core` |

No unused production dependency was found. `prisma` and `dotenv` remain devDependencies, not production ones — a deliberate Phase 7 decision (running `prisma` CLI in the production image would add ~150MB of Prisma Studio's UI toolchain for no runtime benefit; see `phase-7-deployment.md`), re-confirmed still correct this phase. devDependencies are all standard build/lint/test tooling; none looked unused or redundant.

## K. Documentation

- **README:** added a new "Core Invariants" table (the nine guarantees from the phase brief's §3, each with what enforces it and what test proves it) placed immediately after the Overview, ahead of every implementation-detail section — a reviewer sees the contract before the mechanism. Updated Current Status, Architecture & Decisions, and Known Limitations for Phase 8. The existing API contract table (`## API`) was cross-checked against the live running app this phase and found already accurate — no changes needed.
- **ADRs:** reviewed the full existing set (001–027) against this phase's required topics (why NestJS, PostgreSQL, Prisma, modular monolith, JWT, Argon2, row locking, the unique RSVP constraint, offset pagination, no Redis) — all already present, in `phase-0-architecture.md`, `phase-3-authentication.md`, `phase-4-events.md`, `phase-5-rsvp.md`, and `phase-6-hardening.md`. Nothing needed to be added there. Two new ADRs were added for this phase's own genuine new decisions (028–029, below) — no ADR was created for a trivial implementation detail.
- **Swagger:** opened `/api/docs` this phase and walked every endpoint — method, path, auth requirement (padlock icon + `@ApiBearerAuth`), request body schema, response schema (including error responses), and status codes are all present and correct for all 13 routes. "Authorize" with a bearer token was exercised live against a protected endpoint and worked as documented.
- **New:** `docs/specs/phase-8-audit.md` (this file).

## L. Problems Found

This section is mandatory and complete — every genuine problem found this phase, and how it was resolved:

1. **`npm run start:dev` crashed deterministically with `MODULE_NOT_FOUND` on `dist/main`.** Root cause: `nest-cli.json`'s `compilerOptions.deleteOutDir: true` races with `nest start --watch` — it wipes `dist/` as part of starting the watcher, and the watcher's runner then tries to `require('dist/main')` before the compiler has (re)written it. Reproduced consistently, including from a fully clean `dist/`. Fixed by removing `deleteOutDir` (it only meaningfully matters for one-shot `nest build`, cleaning up renamed/deleted source files' stale output — a minor benefit not worth breaking watch mode over). Verified: `start:dev` now boots cleanly, serves `200` on both health and Swagger; `npm run build` still produces a correct `dist/` afterward.
2. **Two required concurrency proofs were missing:** the cancellation-race and event-deletion-race scenarios (phase brief §12/§13) had no test coverage, despite the underlying application code already appearing correct on inspection. Added both as new tests in `rsvp.e2e-spec.ts`, each run across 10 independent trials to increase confidence beyond a single race attempt. Both pass, and — importantly — **no application code change was required for either to pass**: `RsvpService.cancel`'s plain (unlocked) delete and the FK `CASCADE` on `event_attendees.eventId` were already sufficient, because Postgres's own row-level locking (for the RSVP transaction) and referential-integrity enforcement (for the cascade) provide these guarantees without any additional apphttp-level coordination. This is a genuinely reassuring finding, not a gap that needed a fix.
3. **Two pentest checks existed only as one-off manual curl commands, not automated tests:** SQL-injection resistance and oversized-input rejection. Both were verified manually this phase (three injection payloads against `search`, four oversized-field cases) and found safe, then codified as `test/security.e2e-spec.ts` so they're regression-tested going forward rather than re-verified by hand next time.
4. **Readiness-under-real-outage had only unit-level coverage** (`PrismaService.onModuleInit` rejecting against a bad connection string), not a live end-to-end check of the actual `/health/ready` HTTP response while PostgreSQL was genuinely down mid-request. Verified live this phase (see F) — behaves exactly as designed. No code change needed; this was a testing gap, not an implementation gap, and it's now documented as verified rather than assumed.
5. **The monorepo restructuring (moving everything into `backend/`) silently broke `docker-compose ps`/`down`'s ability to find the already-running local Postgres container.** Root cause: Compose derives its project name from the enclosing directory by default, which changed when the file moved. Fixed with an explicit `name: eventhub` in `docker-compose.yml`, verified by confirming `docker compose ps` found the existing container again afterward. (This was found and fixed during the restructuring itself, ahead of this phase's audit proper, but is recorded here as it's a genuine problem-found-and-fixed within this phase's timeframe.)

**No problems were found in:** RSVP concurrency correctness, authorization/ownership enforcement, authentication semantics, database constraints, SQL injection safety, mass-assignment/impersonation resistance, dependency hygiene, or TypeScript strictness. These were all audited and confirmed already correct, not silently assumed.

## M. Remaining Limitations

Acceptable, deliberate, and already documented in the README's "Known Limitations (Phase 8)" section — repeated here for completeness: no refresh tokens/session revocation (ADR-004); in-memory rate-limit storage (single-instance scope); unindexed search (fine at current scale); attendee email visible to any authenticated viewer of an attendee list (documented Phase 5 scope decision); the four dev-tooling-only `npm audit` findings; no image-registry push in CI; no automated rollback tooling; and — the two honesty-driven limitations from this phase specifically — CI has not run on GitHub's actual infrastructure, and Railway deployment has not actually been performed, only locally simulated and documented.

## N. Interview Talking Points

**Why NestJS?** Opinionated structure (modules/controllers/services/DI) that scales better across a team or a growing codebase than an unopinionated Express app, while still sitting directly on Express underneath — nothing here required stepping outside what a plain Express developer would recognize.

**Why PostgreSQL?** Strong relational guarantees (foreign keys, unique constraints, row-level locking) that this project's core correctness requirement — RSVP capacity — depends on directly. A document store would have made the concurrency guarantee much harder to get right without reinventing what Postgres already does natively.

**Why Prisma?** Type-safe queries generated from one schema (the schema, the TypeScript types, and the migrations never drift apart), while still allowing an escape hatch (`$queryRaw`) for the one thing its query builder can't express — row locking.

**Why a modular monolith, not microservices?** One deployable unit, one database, one team-sized codebase — the complexity microservices solve (independent scaling, independent deploys, polyglot services) isn't a problem EventHub has. Module boundaries inside the monolith (`auth/`, `events/`, `rsvp/`, etc.) already give most of the organizational benefit without the operational cost (network calls, distributed transactions, service discovery) of actually splitting them into separate services.

**Why JWT?** Stateless — no server-side session store to keep available and in sync. The trade-off (no built-in revocation before natural expiry) is explicitly accepted and documented (ADR-004), mitigated by re-checking the user's existence in the database on every request.

**Why Argon2?** The current OWASP-recommended password hash — winner of the Password Hashing Competition, memory-hard (resistant to GPU/ASIC cracking in a way bcrypt isn't), and this project uses OWASP's specific 2023 minimum-configuration numbers rather than arbitrary ones.

**How does authorization work?** `event.createdBy` (set once, at creation, from the JWT — never from the request body) is compared to `currentUser.id` (from the JWT on every subsequent request) in the service layer, before any mutation. There's no separate "roles" system because there's only one kind of authorization rule in this app: "are you the creator?"

**How does RSVP work, and how do you prevent overbooking?** A single database transaction locks the event row (`SELECT ... FOR UPDATE`), checks for a duplicate RSVP and the current attendee count against capacity, then inserts — all before releasing the lock. A second concurrent request for the same event physically cannot proceed past the lock until the first transaction finishes, so it always sees genuinely up-to-date state, never a stale count.

**What happens if 100 users RSVP simultaneously to a capacity-10 event?** All 100 requests arrive concurrently; Postgres serializes them one at a time at the lock. The first 10 to acquire the lock (in whatever order Postgres's lock queue happens to grant it — not predictable, and that's fine) each see capacity still available and succeed; the remaining 90 each see the count has reached capacity and get a `409`. This was verified directly, not just reasoned about, with 50 concurrent requests against a capacity-10 event.

**Why PostgreSQL row locking instead of Redis?** Redis would solve the same problem for a multi-instance deployment, but at the cost of running and keeping consistent a second stateful system for a guarantee Postgres already provides natively — the database is the one thing every instance of the app necessarily already talks to.

**Why is the unique constraint still necessary if the transaction already checks for duplicates?** Defense in depth. The application-level check is the normal path; the `UNIQUE(eventId, userId)` constraint is what makes a duplicate RSVP *impossible*, not just *unlikely* — it's the actual final authority, in case any future code path ever bypasses the service layer's check.

**What happens if an RSVP transaction fails partway through?** Postgres rolls the entire transaction back — the lock is released, no partial state (no attendee row without a corresponding capacity check having passed, no held lock left dangling) ever persists. The client sees whatever exception was thrown (404/409), and the database is left exactly as it was before the request.

**How does deployment work?** A multi-stage Dockerfile compiles the app and produces a minimal, non-root runtime image; Railway builds that image directly from the repo (root directory set to `backend/`) and runs it, connecting to Railway's own managed Postgres via `DATABASE_URL`.

**How do migrations work?** `prisma migrate deploy` applies the committed migration history — never `db push`. It's run as an explicit step (locally or in CI against a real database), not embedded in the container's start command, so the production image itself never needs the Prisma CLI.

**How does CI verify the project?** Every push/PR runs the full test suite (unit, e2e including RSVP concurrency, database integration, rate-limit enforcement) against a real, freshly migrated Postgres service container, then independently builds and runs the actual production Docker image as a smoke test — proving both "the code is correct" and "the deployment artifact works," not just one or the other.

**What happens if PostgreSQL goes down?** Liveness (`/health`) keeps returning `200` — the Node process itself is fine, so nothing restarts it unnecessarily. Readiness (`/health/ready`) starts returning `503` with a safe generic message. Any in-flight request that needs the database fails with a generic `500`; no request ever crashes the process. Verified live this phase by actually stopping the database container.

**How does the health endpoint differ from readiness?** Liveness asks "is the process alive?" (no dependency checks — an orchestrator restarts the process if this fails). Readiness asks "can this instance actually serve requests right now?" (checks Postgres — an orchestrator stops routing traffic here if this fails, without restarting anything). Conflating them means a transient database blip looks identical to the process being dead, risking an unnecessary restart.

**What would you change if this grew to 10 million users?** These are documented future options, not current requirements — none are implemented, and none should be, without an actual demonstrated need: read replicas for `GET /events` traffic (the read-heavy path); a cache (e.g. Redis) in front of hot event-detail reads, invalidated on write; cursor-based pagination instead of offset (offset pagination degrades on very deep pages — not a problem at this project's scale); queue-based notifications (e.g. "you got a spot off the waitlist") instead of synchronous work in the request path; database partitioning if a single Postgres instance's write volume became the bottleneck; an observability stack (metrics/tracing, not just structured logs) for diagnosing issues at that scale; and, if ever genuinely multi-region or multi-service, an event-driven architecture between bounded contexts. The RSVP row-locking mechanism itself would likely still be correct at that scale for a single Postgres primary — the scaling questions are about read throughput and operational visibility, not the core correctness guarantee.

## O. NestJS Mental Model

| Concept | What it means in NestJS | Where EventHub uses it | Express equivalent |
|---|---|---|---|
| **Module** | A `@Module()`-decorated class that groups related controllers/providers and declares what it imports from/exports to other modules — Nest's unit of organization and dependency boundary | `AuthModule`, `EventsModule`, `RsvpModule`, `UsersModule`, `HealthModule`, `PrismaModule` (global), `AppModule` (the root, composing all of them) | No direct equivalent — closest is manually organizing `require()`d route files into folders, with no enforced boundary |
| **Controller** | A `@Controller()`-decorated class whose methods (`@Get()`/`@Post()`/etc.) handle HTTP routes — parses the request, delegates to a service, returns what gets serialized as the response | `EventsController`, `AuthController`, `RsvpController`, `HealthController` — each one line per method, no business logic | An Express route handler function (`app.get('/events', handler)`) |
| **Provider / Service** | Any class Nest can inject via its DI container (`@Injectable()`) — services hold business logic; repositories (also providers) hold persistence logic | `EventsService`/`RsvpService`/`AuthService` (business rules), `EventsRepository`/`RsvpRepository`/`UsersRepository` (pure Prisma queries) | A plain module/class you `require()` and instantiate or call directly — no framework-managed lifecycle or injection |
| **Guard** | Runs before the route handler, decides whether the request is *allowed* to proceed (returns true/false or throws) | `JwtAuthGuard` (is there a valid JWT?), `AppThrottlerGuard` (is this caller under their rate limit?) — the latter applied globally via `APP_GUARD` | Express middleware that calls `next()` or sends a 401/403 and returns |
| **Pipe** | Runs on route arguments before the handler, transforms and/or validates them | The global `ValidationPipe` (validates every `@Body()`/`@Query()` DTO via `class-validator`), `ParseUUIDPipe` (validates/parses every `:id` route param) | Manual validation code at the top of a route handler, or a validation middleware library |
| **Exception Filter** | Catches thrown exceptions and converts them into an HTTP response | `AllExceptionsFilter` — the single global `@Catch()` filter (registered via `APP_FILTER`) that turns every thrown exception (Nest's `HttpException` subclasses, known Prisma errors, or anything unexpected) into the one consistent, safe error shape | Express's `app.use((err, req, res, next) => ...)` four-argument error-handling middleware |
| **Interceptor** | *Not used anywhere in this codebase* — Nest's mechanism for wrapping a handler's execution (transforming the response, adding cross-cutting logic before/after). EventHub has no logging/transform/caching interceptor because Pino's HTTP middleware and the DTO response-mapper functions (`toEventResponse`, etc.) already cover those needs without one. | — | — |
| **Middleware** | Runs before routing even resolves which controller handles the request — lowest-level hook in the pipeline | `helmet()`, `pino-http` (via `nestjs-pino`'s `LoggerModule`), Express's own `json()`/`urlencoded()` body parsers — all applied in `main.ts` | Exactly the same concept — `app.use(...)` — Nest's middleware layer *is* Express middleware here, since this app uses the Express platform adapter |
| **Decorator** | A function that attaches metadata to a class/method/parameter, which Nest reads at startup to wire everything together | `@Controller()`, `@Injectable()`, `@Get()`, `@UseGuards()`, and this project's own custom one, `@CurrentUser()` (pulls `request.user` off the request, already typed as `AuthenticatedUser`, set by `JwtStrategy`) | No direct equivalent — closest is a higher-order function wrapping a handler, but without the declarative, framework-read metadata |
| **Config** | `ConfigModule`/`ConfigService` — a typed, centralized way to read environment variables, validated at startup | `configuration.ts` (typed namespaces: `app`, `database`, `jwt`, `throttle`) + `env.validation.ts` (`class-validator`-based schema that fails startup fast on anything missing/invalid) | Reading `process.env.X` directly wherever it's needed, usually with a small hand-rolled wrapper or the `dotenv` package alone |

**The complete request lifecycle, as it actually happens for e.g. `POST /events/:id/rsvp`:**

```text
HTTP Request
   │
   ▼
Middleware        (Helmet headers, JSON body parsing, Pino request logging — main.ts)
   │
   ▼
Guards             (AppThrottlerGuard checks the rate limit, then JwtAuthGuard validates
                     the bearer token via JwtStrategy, loading the current user from the DB)
   │
   ▼
Pipes              (ParseUUIDPipe validates the :id param is a real UUID)
   │
   ▼
Controller         (RsvpController.join — one line, delegates immediately)
   │
   ▼
Service            (RsvpService.join — the actual business logic: opens the transaction,
                     locks the event row, checks duplicate/capacity, decides the outcome)
   │
   ▼
Repository/Prisma  (EventsRepository.findByIdForUpdate, RsvpRepository.findAttendee/
                     createAttendee — the only code that actually queries the database)
   │
   ▼
PostgreSQL         (executes the locked SELECT/INSERT, enforces UNIQUE(eventId,userId)
                     as the final backstop)
   │
   ▼
Response           (RsvpResponseDto returned up through Service → Controller; if anything
                     threw along the way, AllExceptionsFilter — outside this normal
                     left-to-right flow — catches it and produces the standard error shape)
```

No Interceptor sits in this pipeline anywhere in this codebase, so it's omitted from the diagram above — accurately, not by oversight.

## P. Frontend Readiness

The backend is fully ready for the React frontend to build against. Concretely available now:

- **Base URL:** `http://localhost:3000/api/v1` locally; the Railway URL once deployed. `FRONTEND_URL` must be set (to the frontend's dev/prod origin) for CORS to allow it.
- **Auth flow:** `POST /auth/register` → `POST /auth/login` (returns `{ accessToken, tokenType, expiresIn, user }`) → send `Authorization: Bearer <accessToken>` on every subsequent authenticated request. `GET /auth/me` for "who am I" on app load/refresh.
- **Events:** full CRUD, with `GET /events`/`GET /events/:id` public (no token needed to browse), `POST`/`PATCH`/`DELETE` requiring a token, and `PATCH`/`DELETE` additionally requiring the requester to be the creator (403 otherwise — the frontend should hide/disable edit controls for non-owners, but the backend enforces it regardless of what the UI does or doesn't show). Every event response already includes `attendeeCount`/`availableSpots`, so the frontend never needs a second call to show "12/50 spots taken."
- **RSVP:** `POST /events/:id/rsvp` / `DELETE /events/:id/rsvp` (no body needed for either — identity comes from the token), `GET /events/:id/attendees` for the attendee list. All three require auth.
- **Pagination:** every list endpoint uses the identical `{ data, meta: { page, limit, total, totalPages } }` shape — one pagination component/hook on the frontend can serve both Events and Attendees.
- **Errors:** every error response has the same shape (`statusCode`, `code`, `message`, `error`, `timestamp`, `path`, `requestId`) — the frontend can build one central error handler keyed on `code` (e.g. show a specific message for `CONFLICT` on RSVP: "This event is full") rather than parsing `message` strings per-endpoint.
- **Rate limiting:** `429` responses carry standard `X-RateLimit-*`/`Retry-After` headers — a frontend can surface "try again in N seconds" using those rather than guessing.
- **API discovery:** the full OpenAPI schema is live at `/api/docs` (and `/api/docs-json` for tooling) — a frontend codebase can generate a typed API client from it rather than hand-writing fetch calls, if desired.
- **What the frontend does NOT need to worry about:** ownership enforcement, capacity enforcement, duplicate-RSVP prevention, or race conditions from multiple users acting on the same event at once — all of that is fully handled server-side and will produce the correct response (200-series or the appropriate 4xx) regardless of what the frontend does or fails to check client-side.

Nothing in the backend needs to change for frontend work to begin. If frontend development surfaces a genuine need (e.g. a "my events" filter, a websocket for live attendee-count updates), that's new backend scope to plan deliberately then, not something to pre-build speculatively now.

## Skill Compliance

The installed `nestjs-best-practices` skill's guidance was the lens for this entire audit: module boundaries (`arch-module-sharing`), the controller→service→repository→Prisma layering, `devops-use-config-module` (re-confirmed satisfied except the one documented decorator-argument exception), `security-rate-limiting` (re-confirmed per-user tracking and the auth-specific override), `error-use-exception-filters`/`error-throw-http-exceptions` (the single global filter, unchanged and re-confirmed correct), and the general "don't build framework abstractions the app doesn't need" principle — which this phase's own findings reinforce: no factory, generic repository, service locator, or inheritance hierarchy exists anywhere in the codebase, and none was added. No architectural rule was violated or knowingly deviated from this phase.

## Architecture Decisions (ADR-028 – ADR-029)

**ADR-028 — Monorepo Layout: `backend/` Now, `frontend/` Later**
Decision: move the entire NestJS application into `backend/`, at the repository root, leaving room for a sibling `frontend/` package; `.git`/`.github` stay at the true repo root since GitHub requires workflow files there.
Reason: the React frontend phase is next; a monorepo with clearly separated packages is simpler to work in and review than either two separate repositories (which would need coordinated versioning/deployment) or an unstructured single flat directory once frontend code arrives.
Trade-off: every path-sensitive config (CI's working directory, Railway's Root Directory setting, Compose's project name) needed an explicit fix rather than an implicit default — all three were found and fixed as part of the move (see L above), not deferred as latent bugs.

**ADR-029 — No New Infrastructure Added for Future Scale**
Decision: this audit explicitly considered and declined to add caching, a message queue, read replicas, or an observability stack (metrics/tracing beyond structured logs), despite the phase brief inviting discussion of 10-million-user scale.
Reason: none of these solve a problem EventHub actually has today: no demonstrated performance bottleneck was found (I above), rate limiting already covers the single-instance abuse case it needs to, and structured logs already provide sufficient debugging context for this project's current operational needs. Building any of them now would be complexity added for a hypothetical future, not a real present requirement — directly against this phase's explicit instruction.
Trade-off: none, at current scale. These remain documented future options (N above), not deferred work items — they should only be built if/when a concrete, measured need actually appears.
