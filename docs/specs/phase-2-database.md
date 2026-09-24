# Phase 2 — PostgreSQL + Prisma Database Foundation

Status: **Complete.** Scope was restricted to the database foundation only — no auth, event CRUD, RSVP, or attendee endpoints (Phase 3+).

## 1. What was implemented

1. PostgreSQL via Docker Compose for local development.
2. Prisma 7 (`prisma`, `@prisma/client`, `@prisma/adapter-pg`) configured against `DATABASE_URL`.
3. `prisma/schema.prisma` — `User`, `Event`, `EventAttendee` models with the full constraint/index set from Phase 0's design.
4. Initial migration (`prisma/migrations/20260924183554_init/`), including one hand-added `CHECK (capacity > 0)` constraint.
5. `src/database/` — `PrismaService` (the only place `PrismaClient` is instantiated) + `PrismaModule` (global, exported to the whole app).
6. Database-backed health check (`GET /api/v1/health` now pings Postgres, returns `503` if unreachable).
7. Generic Prisma-error → HTTP-status mapping in the existing global exception filter (`P2002` → `409`, `P2025` → `404`), without any Events/RSVP-specific logic.
8. Fail-fast application startup: the app now refuses to start (non-zero exit) if it can't reach Postgres.
9. Dev-only seed script (`prisma/seed.ts`), Argon2-hashed sample data, refuses to run with `NODE_ENV=production`.
10. Database integration test suite (`test/database/`) — run against a **real** Postgres instance, not mocks.

## 2. Current folder structure

```
eventhub-api/
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── migrations/
│       ├── migration_lock.toml
│       └── 20260924183554_init/
│           └── migration.sql
├── prisma.config.ts
├── docker-compose.yml
├── src/
│   ├── database/
│   │   ├── prisma.service.ts
│   │   └── prisma.module.ts
│   ├── common/
│   │   ├── filters/
│   │   │   ├── all-exceptions.filter.ts
│   │   │   └── all-exceptions.filter.spec.ts
│   │   └── types/
│   ├── config/
│   ├── health/
│   ├── app.module.ts
│   └── main.ts
├── test/
│   ├── database/
│   │   ├── constraints.spec.ts
│   │   └── startup-failure.spec.ts
│   ├── health.e2e-spec.ts
│   ├── jest-db.json
│   ├── jest-e2e.json
│   └── setup-env.ts
└── docs/specs/
```

`auth/`, `users/`, `events/`, `rsvp/` still don't exist — no functionality to put in them yet.

## 3. Prisma schema explanation

**`User`** — `id` (UUID, PK), `name`, `email` (unique), `passwordHash`, `createdAt`/`updatedAt`. Relations: `createdEvents` (events this user created) and `attendances` (events this user RSVP'd to).

**`Event`** — `id` (UUID, PK), `title`, `description` (nullable — not every event needs a long write-up), `location`, `startsAt`/`endsAt`, `capacity` (positive `Int`), `createdBy` (FK → `User.id`), timestamps. Relation to its creator (`creator`) and to its attendees (`attendees`).

**`EventAttendee`** — `id` (UUID, PK, surrogate — simpler to reference than a composite key in application code), `eventId` (FK → `Event.id`), `userId` (FK → `User.id`), `joinedAt`. This is the RSVP join table; its `@@unique([eventId, userId])` is the core correctness guarantee for the whole project.

Identifier strategy: **UUIDs** (Prisma's `@default(uuid())`, stored as native Postgres `uuid`), not auto-incrementing integers. Reasoning: public API resource IDs shouldn't be sequential/guessable (an integer PK leaks record counts and enables trivial enumeration of every event/user); UUIDs also avoid coordination issues if the system ever needs multiple writers generating IDs independently. Trade-off: slightly larger index size than `int`/`bigint` — irrelevant at this project's scale.

Email normalization: emails are expected to be normalized (lowercased/trimmed) by the application layer before every write and read — that responsibility belongs to the `users` repository Phase 3 introduces, not the schema. No Postgres extension (e.g. `citext`) was added for this; a plain `@unique String` column plus a consistent application-layer normalization rule is simpler and avoids taking on an extension dependency for a problem application code can fully own.

## 4. Relationship explanation

```
User ──creates (1:N)──> Event            (Event.createdBy)
User ──attends (M:N)──> Event            (through EventAttendee)
Event ──has (1:N)──────> EventAttendee
```

- **User → Events**: one user can create many events (`Event.createdBy`); each event has exactly one creator.
- **User → EventAttendees**: one user can have many attendance records (one per event they've RSVP'd to); each attendance record belongs to exactly one user.
- **Event → EventAttendees**: one event can have many attendees; each attendance record belongs to exactly one event.
- The `(eventId, userId)` pair on `EventAttendee` is what actually encodes the User↔Event many-to-many RSVP relationship, with the composite unique constraint preventing a user from RSVPing to the same event twice.

## 5. Constraints

- **Primary keys**: `users.id`, `events.id`, `event_attendees.id` (all UUID).
- **Foreign keys**: `events.createdBy → users.id`; `event_attendees.eventId → events.id`; `event_attendees.userId → users.id`.
- **Unique constraints**: `users.email`; `event_attendees(eventId, userId)`.
- **Check constraint**: `events.capacity > 0` — added by hand in the migration SQL (Prisma's schema language has no native `@@check` syntax), documented inline in both `schema.prisma` and the migration file.

## 6. Indexes

| Index | Supports |
|---|---|
| `events_createdBy_idx` on `events(createdBy)` | "Find events created by this user" — ownership checks, a future "my events" listing |
| `events_startsAt_idx` on `events(startsAt)` | "List upcoming events ordered by `startsAt`", filtered by `startsAt >= now()` — the primary event-discovery query |
| `event_attendees_userId_idx` on `event_attendees(userId)` | "Find events a user has joined." Needed because the composite unique index below doesn't help here — its leading column is `eventId`, not `userId` |
| `event_attendees_eventId_userId_key` (unique) on `event_attendees(eventId, userId)` | Both the duplicate-RSVP guarantee *and*, as a side effect, an efficient index for "find attendees for an event" (its leading column is `eventId`) |
| `users_email_key` (unique) on `users(email)` | Login lookup (Phase 3) and registration conflict checks |

Deliberately **not** indexed: `events.title`, `events.location`. No search/filter feature exists yet to justify them, and a plain btree index isn't even the right structure for text search — when that feature lands, it'll likely want a trigram or full-text index, decided then against the real query.

## 7. Delete behavior

| Relation | Behavior | Reasoning |
|---|---|---|
| `events.createdBy → users.id` | `RESTRICT` | Deleting a user must not silently cascade-delete events other people have already RSVP'd to. A future account-deletion flow needs its own explicit handling (reassign ownership, soft-delete, or block deletion outright) — not something to default into via cascade. |
| `event_attendees.eventId → events.id` | `CASCADE` | An attendee record has no meaning without its event. Deleting an event should clean up all RSVPs for it — this was explicit in the Phase 2 brief and matches the Phase 0 design. |
| `event_attendees.userId → users.id` | `CASCADE` | If a user's account is deleted, their RSVP rows should go with them rather than becoming orphaned references to a nonexistent user. This does not touch the `Event` row itself — verified explicitly in `test/database/constraints.spec.ts`. |

All three are verified by real database integration tests (Section 12), not just asserted here.

## 8. Migration

One migration: `20260924183554_init`. Generated via `prisma migrate dev --create-only` (so the CHECK constraint could be added by hand before applying), then applied via `prisma migrate dev`. It creates all three tables with their primary keys, foreign keys, unique constraints, and indexes in a single migration — appropriate for an initial schema with no prior data to preserve.

Reproducibility was verified for real: the Docker volume was torn down (`docker compose down -v`), a completely fresh Postgres container was started, and `prisma migrate deploy` (the production-style command — applies existing migrations only, never generates new ones) was run against it. The migration applied cleanly, and `\d` inspection in `psql` confirmed every constraint, foreign key, and index — including the hand-added CHECK constraint — was present exactly as designed.

## 9. PrismaService

`src/database/prisma.service.ts` extends `PrismaClient` and implements `OnModuleInit`/`OnModuleDestroy`, giving it a lifecycle tied to the Nest application:

- **Construction**: Prisma 7 requires an explicit driver adapter (see the note in the README) — the constructor builds a `PrismaPg` adapter from `ConfigService.get('database.url')` and passes it to `super()`.
- **`onModuleInit`**: calls `$connect()` *and* runs `SELECT 1`. This second step matters — `@prisma/adapter-pg` wraps `pg`'s connection pool, which connects lazily and doesn't authenticate until a real query runs. Calling `$connect()` alone does **not** prove the database is reachable (verified: it resolved even with a wrong password). The explicit `SELECT 1` is what actually forces the fail-fast startup behavior in Section 11 to work — without it, bad credentials would silently surface on the first real request instead of at boot.
- **`onModuleDestroy`**: calls `$disconnect()`, invoked automatically by Nest's shutdown hooks (already enabled in `main.ts` since Phase 1).

`PrismaModule` is `@Global()` — a deliberate, documented exception to "avoid global modules." The installed `nestjs-best-practices` skill's own `arch-module-sharing` rule explicitly lists "database connections" as one of the few legitimate cases for `@Global()`, alongside config and logging. `PrismaService` will be a dependency of every future feature module (auth, users, events, rsvp); repeating `imports: [PrismaModule]` in each one would be pure boilerplate for a module with no per-feature configuration. It's still imported explicitly once, in `AppModule`, so it stays visible in the module graph rather than being silently auto-loaded.

## 10. Database health

`HealthService.check()` now runs `SELECT 1` via Prisma before returning. If that throws (connection refused, auth failure, etc.), it throws `ServiceUnavailableException('Database unavailable')` — a fixed, generic message that never includes the connection string, host, or the underlying driver error. The global exception filter turns that into a `503` in the standard error response shape. On success, the response gains a `database: 'up'` field alongside the existing `status`/`info`. No expensive queries — `SELECT 1` is the cheapest possible round trip, proving connectivity without touching real data.

## 11. Docker

`docker-compose.yml` defines a single `postgres:16-alpine` service, a named volume (`eventhub_postgres_data`) for persistence across restarts, dev-only credentials matching `.env.example`, and a `pg_isready` healthcheck. This is **local-development infrastructure only** — there is no application Dockerfile yet (see `phase-1-foundation.md`'s deferral reasoning, still valid), and production is assumed to connect to a managed Postgres instance via `DATABASE_URL`, not a container this compose file manages.

Startup: `docker compose up -d`. Verified end-to-end multiple times in this phase, including a full teardown/recreate (`docker compose down -v` → `docker compose up -d` → migrate → test) to prove the setup is reproducible from nothing.

## 12. Testing

Two new suites, plus one existing suite updated:

- **`test/database/constraints.spec.ts`** (`npm run test:db`) — integration tests against a real Postgres (the same one local dev uses). Covers: connectivity, unique email, the `createdBy` foreign key, the capacity `CHECK` constraint, `event_attendees` foreign keys, the `(eventId, userId)` unique constraint, cascade-on-event-delete, restrict-on-user-with-events-delete, cascade-on-attending-user-delete (and that it leaves the event itself untouched), and — proving Section 19/20's "the schema must support the future RSVP transaction" requirement concretely rather than by assertion — a transaction that locks an event row with `SELECT ... FOR UPDATE` and reads attendee count within the same transaction. Every test cleans the three tables before it runs, and the suite cleans up after itself in `afterAll`; it must never be pointed at a shared or production database (documented in the file itself).
- **`test/database/startup-failure.spec.ts`** (also `npm run test:db`) — verifies the fail-fast mechanism (Section 9) directly: `PrismaService.onModuleInit()` resolves against the real database, and rejects both for wrong credentials and for a port nothing is listening on.
- **`test/health.e2e-spec.ts`** (updated) — now asserts `database: 'up'` in the `200` response body; this is a real HTTP round trip through the real Prisma connection, not a mock.
- **`src/health/health.service.spec.ts`** (updated) — `PrismaService` is now mocked here (unit-level), including a case asserting the `503` path never leaks the underlying driver error text.
- **`src/common/filters/all-exceptions.filter.spec.ts`** (new) — unit tests for the filter's Prisma-error mapping: `P2002` → safe `409`, `P2025` → safe `404`, and confirmation that the raw Prisma message (which can contain field/table names) never reaches the response body.

`npm test` stays fully hermetic — no database required, matching Phase 1's design. `npm run test:e2e` and `npm run test:db` now require `docker compose up -d` first; this is a new, documented prerequisite (README, Section 17 below).

## 13. Dependencies

- **`@prisma/client`**, **`prisma`** — the ORM, pinned to `7.10.0` (not npm's `latest` tag, which currently points at an `8.0.0` release candidate — deliberately avoided; see Section 16).
- **`@prisma/adapter-pg`**, **`pg`** (+ `@types/pg`) — Prisma 7's mandatory driver-adapter pattern for PostgreSQL; there is no more implicit engine-binary connection.
- **`dotenv`** (dev) — `prisma.config.ts` needs it to load `.env` for CLI commands (`migrate`, `generate`, `studio`); the running application already loads env vars through `@nestjs/config`, unrelated to this.
- **`argon2`** — used only by `prisma/seed.ts` in this phase, to hash dev-only seed passwords with the same algorithm Phase 3's real authentication will use. No auth module depends on it yet.

No Redis, message queue, or additional ORM abstraction was added — none was needed.

## 14. NestJS concepts introduced

- **`OnModuleInit` / `OnModuleDestroy`** — lifecycle hooks a provider can implement to run code when the module is initialized or torn down. `PrismaService` uses them to connect (and verify connectivity) on startup and disconnect on shutdown. Express equivalent: there's no direct one — in Express you'd typically call `pool.connect()` yourself somewhere in your bootstrap script and hope nothing depends on it before that line runs; Nest's DI container guarantees `onModuleInit` runs after the provider's dependencies are ready, in a predictable order.
- **`@Global()` module** — makes a module's exported providers available everywhere without every consumer explicitly importing it. Used here for `PrismaModule`, per the skill's own guidance that database connections are one of the few legitimate uses. Express equivalent: closest analogy is a singleton `db` object attached to `app.locals` or a shared module-level export — except Nest's version is still a first-class, testable, DI-managed provider, not a bare object floating in global scope.
- **Class inheritance with DI (`extends PrismaClient`)** — `PrismaService` *is* a `PrismaClient` (not a wrapper around one), gaining all its query methods directly, while still being a normal `@Injectable()` Nest can construct with injected dependencies (`ConfigService`) and manage through the module lifecycle. This is a common Nest+Prisma pattern; nothing framework-specific beyond ordinary TypeScript inheritance plus Nest's DI resolving the constructor's parameters.

## 15. Validation

```
npm run build            →  pass
npm run lint              →  pass (0 problems)
npm run format:check      →  pass
npm test                  →  pass (14 tests, 3 suites, no database required)
npm run test:e2e          →  pass (2 tests — against real Postgres)
npm run test:db           →  pass (13 tests, 2 suites — against real Postgres)
npx prisma validate       →  "The schema at prisma/schema.prisma is valid"
```

Manual verification performed, not just assumed:

- `docker compose up -d` → container reaches `healthy` state.
- `prisma migrate dev` applied the initial migration to a running database; `\d users` / `\d events` / `\d event_attendees` in `psql` confirmed every PK, FK, unique constraint, check constraint, and index matched the design exactly.
- **Clean-database reproducibility**: `docker compose down -v` (deletes the volume) → `docker compose up -d` (fresh Postgres, no schema) → `prisma migrate deploy` → re-verified the schema and re-ran the full test suite — all passed against the freshly created database.
- Fail-fast startup was verified at the mechanism level via `test/database/startup-failure.spec.ts` (real rejection on bad credentials and on an unreachable port). Verifying it via a raw `node dist/main.js` invocation was unreliable on this machine specifically because of the same local VS Code "Console Ninja" extension interference documented in `phase-1-foundation.md` — it intermittently terminates raw `node` processes before user code runs; Jest-driven runs (which is how every other verification here was done, including the full e2e HTTP round trip proving the happy path) are not affected.
- `npm run db:seed` was run twice to confirm idempotency (`upsert`, not `create`) — no duplicate rows on the second run.

## Architecture Decisions (ADR-007 – ADR-010)

**ADR-007 — PostgreSQL as Primary Database**
Decision: Use PostgreSQL.
Reason: Relational consistency, transactions, constraints, and strong support for the concurrency-sensitive RSVP behavior the project's core requirement depends on.
Trade-off: Requires relational schema management and migrations, rather than a schemaless store's flexibility.

**ADR-008 — Prisma as ORM**
Decision: Use Prisma (`@prisma/client` + `@prisma/adapter-pg`), pinned to the stable `7.10.0` line.
Reason: Assignment-mandated; type-safe generated queries, a real migration workflow, and — once verified — full compatibility with the project's existing NestJS/CommonJS/Jest toolchain via the `prisma-client-js` generator.
Trade-off: Prisma 7 requires an explicit driver adapter and forbids `url = env(...)` in `schema.prisma` (both breaking changes from earlier Prisma versions) — the database URL now flows through `prisma.config.ts` (CLI) and `ConfigService` → `PrismaPg` (runtime) instead of a single schema-level declaration. One extra dependency (`pg`) and a few more lines of wiring than pre-7 Prisma, in exchange for using the current stable release rather than an older major.

**ADR-009 — Database-Level RSVP Uniqueness**
Decision: `UNIQUE(eventId, userId)` on `event_attendees`.
Reason: Prevents duplicate RSVPs even under concurrent requests — the unique index causes Postgres itself to reject the second concurrent insert, independent of whatever the application layer does. Verified directly: `test/database/constraints.spec.ts`'s duplicate-RSVP test asserts the second insert fails with Prisma error code `P2002`.
Trade-off: None meaningful — this is close to a free correctness guarantee once the index exists.

**ADR-010 — Migration-Based Schema Management**
Decision: Use Prisma Migrate (`migrate dev` in development, `migrate deploy` in production/CI) for all schema changes — never `prisma db push`.
Reason: Migrations are version-controlled, reviewable, reproducible, and safely rollback-able in principle; `db push` synchronizes the database to match the schema with no history and no way to reason about what changed between two states. Verified directly: the migration was applied to a completely fresh database (`docker compose down -v` → fresh container → `migrate deploy`) and reproduced the exact same schema.
Trade-off: Slightly more ceremony than `db push` for quick prototyping — acceptable, since this project explicitly isn't prototyping-scale.

## 16. Skill compliance

Followed: the repository-boundary principle (`PrismaService`/`PrismaModule` as the only database access point — no controller or business service will ever touch Prisma directly once they exist), migration-based schema management (never `db push`), transactions available and proven usable (`$transaction` + `FOR UPDATE`) without building a custom transaction utility, and the skill's own explicit carve-out for `@Global()` database modules.

Intentional deviations, both driven by the actual currently-published npm ecosystem rather than by choice:

1. **Prisma 7's driver-adapter requirement** — the skill's examples (written for TypeORM) don't cover this at all, and it isn't a NestJS pattern, it's Prisma 7 specifically. `@prisma/adapter-pg` was added because `new PrismaClient()` with no arguments now throws in this version — verified directly, not assumed.
2. **Prisma's own `prisma-client-js` generator instead of the new `prisma-client` default** — Prisma 7's `prisma init` now defaults to a new generator that emits raw TypeScript source to a custom output folder; tested it directly and chose the older, still-supported `prisma-client-js` generator instead, because it's the well-documented, CommonJS-compatible, battle-tested path that matches this project's existing CommonJS/Jest setup (Phase 1) without introducing a second unfamiliar toolchain surface in the same project.

## 17. Known limitations

- `npm run test:e2e` and `npm run test:db` require Postgres running locally — no longer hermetic. This is a genuine, accepted trade-off of wiring in a real database dependency; `npm test` remains database-free.
- No connection-pool tuning, retry/backoff, or read-replica support — not needed at this project's scale, and Phase 2's instructions explicitly said not to build retry loops.
- The seed script is a manual, explicit command only — nothing in the application invokes it automatically, and it refuses to run under `NODE_ENV=production`.
- No Swagger yet (unchanged from Phase 1 — still deferred).
- Raw `node dist/main.js` manual verification on this specific developer machine is affected by the same local VS Code extension interference noted in Phase 1; does not affect Docker, CI, or any other environment without that extension.

## 18. Phase 3 preparation

Phase 3 introduces:

- Authentication: registration, login, `GET /auth/me`.
- Argon2 password hashing in the real auth flow (the seed script already proves the library works; Phase 3 wires it into actual request handling).
- JWT issuance and validation (`@nestjs/jwt` + `@nestjs/passport`), `JwtStrategy`, `JwtAuthGuard`.
- A `users/` module and repository, built on top of `PrismaService` — the first real consumer of the database boundary this phase established.
- Authorization foundation: `@CurrentUser()` decorator, `@Public()` decorator for opting specific routes out of the (now real) auth guard.

Not starting Phase 3 until instructed.
