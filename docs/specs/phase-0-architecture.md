# Phase 0 — Architecture & Requirements Analysis

Status: **Complete.** No application code was written in this phase — architecture and requirements analysis only.

## Repository Assessment

At the start of Phase 0 the repository was completely empty — no files, no git history, no `package.json`. This is a from-scratch build.

## NestJS Skill Assessment

The installed `nestjs-best-practices` skill (`Kadajett/agent-nestjs-skills`, 40 rules across 10 categories) was read in full for the categories relevant to this project. Key rules shaping the build:

- **`arch-feature-modules`** — organize by feature (`users/`, `events/`, `rsvp/`), not by technical layer.
- **`arch-use-repository-pattern`** — encapsulate queries behind a repository; services stay free of query-building logic.
- **`arch-single-responsibility`** — no "god services"; `EventsService` and `RsvpService` stay separate.
- **`di-prefer-constructor-injection`** — always constructor injection.
- **`security-auth-jwt`** — short-lived access tokens, minimal JWT payload, validate user still exists/active on every request.
- **`security-use-guards`** — declarative `@Public()` / `@Roles()` + global guards, not manual `if` checks in handlers.
- **`security-validate-all-input`** — global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`.
- **`security-rate-limiting`** — `@nestjs/throttler`, stricter limits on auth endpoints.
- **`db-use-transactions`** — multi-step DB operations must be atomic. Directly governs RSVP.
- **`db-use-migrations`** — never rely on schema auto-sync in production.
- **`error-throw-http-exceptions`** / **`error-use-exception-filters`** — services throw `HttpException` subclasses directly; a global exception filter formats all responses and hides stack traces in production.
- **`api-use-dto-serialization`** — never return ORM entities directly; strip sensitive fields.
- **`test-e2e-supertest`** — E2E suite boots the real Nest app with the same global pipes/filters as production.
- **`devops-use-config-module`** — `@nestjs/config` with validation, fail-fast on missing env vars.

**Deliberate deviation, documented as a trade-off:** the skill's code samples are written against **TypeORM** (`DataSource.transaction`, `@InjectRepository`, TypeORM migration files), but this project's explicit requirement is **Prisma**. The skill's *principles* are followed (repository abstraction, transactional writes, migration-based schema changes, no query logic in services); only the ORM API surface differs (`prisma.$transaction`, a `PrismaService`-backed repository, `prisma migrate` instead of the TypeORM equivalents).

## Architecture

Request flow:

```
HTTP Request
  → Helmet + CORS (global middleware)
  → ThrottlerGuard (rate limiting)
  → JwtAuthGuard (authentication; @Public() bypasses)
  → RolesGuard / ownership checks where relevant (authorization)
  → ValidationPipe (DTO validation + transform)
  → Controller (thin — routing + delegation only)
  → Service (business rules, orchestration, authorization decisions)
  → Repository (Prisma queries, encapsulated)
  → Prisma Client
  → PostgreSQL
  → Global Exception Filter (on any thrown error, formats response)
```

Module boundaries:

- `auth/` — registration, login, JWT issuance, `JwtStrategy`, `JwtAuthGuard`, password hashing. Depends on `users/`.
- `users/` — user persistence + current-user lookup. No knowledge of auth mechanics.
- `events/` — event CRUD, ownership enforcement. Owns `EventsRepository`.
- `rsvp/` — join/cancel/attendee-list logic. Separate module from `events/` per `arch-single-responsibility`, even though both touch event-adjacent tables.
- `database/` — `PrismaService` (global, exported), connection lifecycle.
- `config/` — env validation schema + typed config namespaces.
- `common/` — cross-cutting: global exception filter, `@CurrentUser()` decorator, `@Public()` decorator, base DTO utilities.

**Authentication boundary:** enforced once, globally, at the guard layer (`APP_GUARD`), with `@Public()` opting specific routes out.

**Authorization boundary:** authentication tells you *who*; creator-only edit/delete is checked inside `EventsService` against the loaded event's `createdBy`, because it requires the resource to be loaded first — this is service-level logic, not a generic guard.

**Persistence strategy:** Prisma as the sole ORM, one `PrismaService` injected wherever needed, repository classes wrapping Prisma calls so services never construct queries directly.

## Database Design

**Entities:**

| Entity | Key Fields | Notes |
|---|---|---|
| `User` | `id` (PK), `name`, `email` (unique), `passwordHash`, `createdAt`, `updatedAt` | |
| `Event` | `id` (PK), `title`, `description`, `location`, `startsAt`, `endsAt`, `capacity`, `createdBy` (FK → User.id), `createdAt`, `updatedAt` | |
| `EventAttendee` | `eventId` (FK → Event.id), `userId` (FK → User.id), `joinedAt` | Composite unique on `(eventId, userId)`; likely a surrogate `id` PK with the composite as `@@unique` |

**Relationships:** `User 1—N Event` via `createdBy`; `User N—N Event` via `EventAttendee` (`onDelete: Cascade` on both FKs).

**Constraints/indexes:**

- `User.email` — unique index.
- `EventAttendee` — `@@unique([eventId, userId])` — the load-bearing constraint for duplicate-RSVP prevention.
- Index on `Event.createdBy` (ownership checks, "my events").
- Index on `Event.startsAt` (chronological listing).
- Index on `EventAttendee.eventId` (attendee-count queries; this is the row locked during RSVP).

**Open question:** `onDelete` behavior for `Event.createdBy` when a user is deleted — leaning `Restrict`/soft-delete rather than `Cascade`, to avoid silently destroying events other people have RSVP'd to. To confirm before writing the Prisma schema in Phase 2.

## API Contract

Base path: `/api/v1`

| Method | Path | Auth | Purpose | Success | Key Failures |
|---|---|---|---|---|---|
| POST | `/auth/register` | Public | Create account | 201 | 400, 409 email taken |
| POST | `/auth/login` | Public | Issue JWT | 200 | 401 bad credentials |
| GET | `/auth/me` | Required | Current user profile | 200 | 401 |
| POST | `/events` | Required | Create event | 201 | 400 (e.g. `endsAt` ≤ `startsAt`) |
| GET | `/events` | Public | List events | 200 | — |
| GET | `/events/:id` | Public | Event detail | 200 | 404 |
| PATCH | `/events/:id` | Required | Update event | 200 | 401, 403 not owner, 404 |
| DELETE | `/events/:id` | Required | Delete event | 204 | 401, 403 not owner, 404 |
| POST | `/events/:id/rsvp` | Required | Join event | 201 | 401, 404 event, 409 full/duplicate |
| DELETE | `/events/:id/rsvp` | Required | Cancel RSVP | 204 | 401, 404 event/RSVP |
| GET | `/events/:id/attendees` | Public | List attendees | 200 | 404 |

Status convention: `201` create, `200` read/update, `204` delete with no body, `400` validation, `401` unauthenticated, `403` forbidden, `404` missing, `409` business conflict (full event, duplicate RSVP).

## Security Model

- **Authentication:** JWT (`@nestjs/jwt` + `@nestjs/passport`), short-lived access token, minimal payload (no password hash, no unnecessary claims).
- **Authorization:** guard-level for "must be logged in"; service-level ownership check for edit/delete (`403` for non-owners, since events are public-readable).
- **Password hashing:** Argon2id (stronger modern default over bcrypt).
- **JWT secrets:** from `JWT_SECRET` env var, validated at boot, never hardcoded or logged.
- **Input validation:** global `ValidationPipe`, every DTO validated.
- **Sensitive data handling:** `passwordHash` excluded from every response; stack traces suppressed outside development.
- **Rate limiting:** `@nestjs/throttler`, tighter limits on `/auth/login` and `/auth/register`.
- **Transport hardening:** Helmet, CORS scoped to the known frontend origin, reasonable body size limit.

## RSVP Concurrency Strategy

Core correctness requirement, mapped onto `db-use-transactions` (adapted to Prisma):

```
prisma.$transaction(async (tx) => {
  1. SELECT the event row FOR UPDATE (row-level lock, via $queryRaw —
     Prisma's high-level API doesn't expose row locking directly)
  2. Check whether (eventId, userId) already exists in EventAttendee
     within the same transaction — if so, throw ConflictException.
  3. Count current attendees and compare against event.capacity —
     if full, throw ConflictException.
  4. INSERT the EventAttendee row.
  5. COMMIT.
})
```

Why this works:

- `SELECT ... FOR UPDATE` on the event row serializes concurrent RSVP attempts for the *same event* — a second transaction blocks until the first commits/rolls back, so capacity-check-then-insert can't race.
- **`@@unique([eventId, userId])`** is the second, independent layer: even with an application bug, Postgres itself rejects a duplicate insert, mapped to `409`.
- Capacity overflow is prevented because count-and-insert happen inside the same locked transaction.
- Deliberately *not* solved with Redis locks or optimistic-locking retries — Postgres row locks are sufficient at this scale and keep Postgres as the single source of truth.

Will be written up as **ADR-005** once implemented (Phase 5).

## Testing Strategy

- **Unit** — `EventsService`, `RsvpService`, `AuthService` with mocked repositories (`Test.createTestingModule`).
- **Integration** — repository-level tests against a real test Postgres (Docker), proving the constraint and `FOR UPDATE` transaction actually behave as designed.
- **E2E** (Supertest) — register → login → create event → update own → 403 on someone else's → delete own → RSVP → duplicate rejected → full event rejected → cancel.
- **Concurrency test** — event with `capacity: 1`, N concurrent RSVP requests from different users; assert exactly one `201`, the rest `409`, and the DB row count matches capacity exactly.

## Architecture Decisions

**ADR-001 — Modular NestJS Monolith**
Decision: single deployable app, feature modules, not microservices.
Reason: requirements don't justify independent scaling/deployment of separate services.
Trade-off: less process-level isolation; acceptable — assignment explicitly rules out microservices.

**ADR-002 — PostgreSQL as Source of Truth**
Decision: all state in Postgres; no cache layer.
Reason: strong consistency (RSVP capacity) is easiest with a single relational source of truth and native locking.
Trade-off: no read-scaling via cache; not a concern at this scale.

**ADR-003 — Prisma ORM**
Decision: Prisma Client + Prisma Migrate.
Reason: assignment-mandated; type-safe queries, clean migration workflow.
Trade-off: the installed skill's examples are TypeORM-flavored — principles ported to Prisma's API rather than followed verbatim (see NestJS Skill Assessment above).

**ADR-004 — JWT Authentication with Argon2**
Decision: stateless JWT access tokens; Argon2id password hashing.
Reason: simple, standard, matches assignment spec.
Trade-off: no refresh-token/revocation mechanism planned — out of scope for this assignment's size; mitigated by short access-token lifetime.

**ADR-005 — PostgreSQL Transaction + Row Lock for RSVP Capacity**
Decision: `SELECT ... FOR UPDATE` on the event row inside a transaction wrapping duplicate-check, capacity-check, insert.
Reason: eliminates the read-then-write race condition without external locking infrastructure.
Trade-off: concurrent RSVPs to the *same* event serialize (brief lock wait) rather than running in parallel — acceptable; RSVP isn't a high-throughput hot path.

**ADR-006 — Unique Constraint for Duplicate RSVP Prevention**
Decision: database-level `@@unique([eventId, userId])` on `EventAttendee`, in addition to the application-level check.
Reason: defense in depth — guarantees no duplicates even under bugs or retries.
Trade-off: none meaningful.

## Proposed Folder Structure (target end-state)

```
src/
├── auth/
├── users/
├── events/
├── rsvp/
├── database/
├── config/
├── common/
├── app.module.ts
└── main.ts

prisma/
└── schema.prisma

test/
└── *.e2e-spec.ts
```

## Risks / Open Questions

1. **Event deletion with existing RSVPs / creator deletion** — `onDelete` behavior for `Event.createdBy` needs a decision before Phase 2's schema is written.
2. **403 vs 404 on unauthorized edit/delete** — proposed `403` since events are public-readable.
3. **Capacity edge case** — assumed always a positive integer; no "unlimited" case unless specified otherwise.
4. **Refresh tokens** — not planned unless requested; single short-lived access token only.

## Phase 1 Plan (superseded by [phase-1-foundation.md](phase-1-foundation.md))

Scaffold, config, validation, security middleware, logging, health check, testing foundation, developer tooling — no business modules. See the Phase 1 spec for what was actually built.
