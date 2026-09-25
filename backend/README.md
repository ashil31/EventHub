# EventHub Backend

## Overview

EventHub is an event management and RSVP platform. This directory is the backend API: a modular NestJS application backed by PostgreSQL (via Prisma), with JWT authentication and Swagger-documented endpoints for events and RSVPs.

This is the `backend/` package of the EventHub monorepo (see the [repository root README](../README.md) for the overall layout — a `frontend/` package sits alongside this one). Every command below assumes your shell's working directory is `backend/`, exactly as it would be if this were a standalone repository.

See [`docs/specs/`](docs/specs) for the full architecture, database design, API contract, security model, and RSVP concurrency strategy, tracked phase by phase.

## Tech Stack

- **Framework:** NestJS 11 (TypeScript, strict mode)
- **Database:** PostgreSQL 16
- **ORM:** Prisma 7 (`@prisma/client` + `@prisma/adapter-pg`)
- **Auth:** JWT (`@nestjs/jwt` + `@nestjs/passport` + `passport-jwt`) + Argon2id password hashing
- **Docs:** Swagger / OpenAPI at `/api/docs`
- **Testing:** Jest, Supertest
- **Logging:** Pino (structured JSON logs, request correlation IDs)
- **Containerization:** Docker (multi-stage production `Dockerfile`), Docker Compose (local Postgres)
- **CI/CD:** GitHub Actions (lint, build, full test suite, Docker build + runtime smoke test)
- **Target deployment:** Railway (API container + managed PostgreSQL)

## Current Status

**Phase 7 complete.** Application foundation (Phase 1) + database layer (Phase 2) + authentication (Phase 3) + Events CRUD (Phase 4) + RSVP with concurrency-safe capacity enforcement (Phase 5) + API hardening (Phase 6) + production deployment & CI/CD readiness (Phase 7):

- PostgreSQL + Prisma, schema for `User`/`Event`/`EventAttendee`, an applied initial migration, a `PrismaService`/`PrismaModule` database boundary, and a database integration test suite run against a real Postgres instance.
- Registration, login, JWT issuance/validation, a protected `GET /auth/me`, and Swagger docs with bearer-token auth wired in.
- Full Events CRUD (create/list/get/update/delete), creator-only update/delete authorization, pagination, search, and date filtering.
- Join/cancel RSVP and a paginated attendee list, with capacity enforcement and duplicate-RSVP prevention that are correct under real concurrent load — verified with genuinely concurrent requests against real Postgres, not just sequential tests.
- Rate limiting (per-user where authenticated, stricter on auth endpoints), split liveness/readiness health checks, a `code` field on every error response, and a completed security/logging/error-handling audit.
- A minimal, non-root, multi-stage production `Dockerfile`; a GitHub Actions CI pipeline that lints, builds, runs the full test suite against a real Postgres service container, and builds + runs the production image as a smoke test; and a documented Railway deployment path. See [Production Deployment](#production-deployment) below.
- This is the complete backend feature set the assignment specifies, now hardened and deployable. No new business features remain planned.

## Local Setup

Requires Node **22** (see [`.nvmrc`](.nvmrc) — `nvm use` if you have nvm installed).

```bash
npm install                # also runs `prisma generate` via postinstall
cp .env.example .env       # then fill in real values for your machine
docker compose up -d       # start local PostgreSQL
npm run prisma:migrate:dev # apply migrations to your local database
npm run db:seed            # optional: dev-only sample data
npm run start:dev
```

The API will be available at `http://localhost:3000/api/v1`.

## Environment Variables

See [`.env.example`](.env.example). All variables below are validated at startup — the app refuses to boot if any are missing or invalid (see [`src/config/env.validation.ts`](src/config/env.validation.ts)):

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | yes | `development` \| `test` \| `production` |
| `PORT` | yes | 1–65535 |
| `DATABASE_URL` | yes | `postgresql://...` — now used by Prisma/PrismaService |
| `JWT_SECRET` | yes | ≥32 characters. In production, must not be the `.env.example` placeholder |
| `JWT_EXPIRES_IN` | yes | e.g. `15m` — signs and verifies access tokens |
| `FRONTEND_URL` | no | Origin allowed by CORS. If unset in production, CORS denies all cross-origin requests |
| `THROTTLE_TTL` / `THROTTLE_LIMIT` | no | Default: `60` seconds / `100` requests. General API rate limit. |
| `AUTH_THROTTLE_TTL` / `AUTH_THROTTLE_LIMIT` | no | Default: `60` seconds / `5` requests. Stricter limit for `/auth/register` and `/auth/login`. |

`PORT` is read from the environment, never hardcoded — on Railway, the platform injects its own `PORT` value and the app listens on it automatically (`app.listen(port, '0.0.0.0')` in `src/main.ts`); locally it falls back to `.env`'s value (default `3000`).

## Database

PostgreSQL is the single source of truth (see [ADR-002](docs/specs/phase-0-architecture.md)). Prisma is the ORM (see [ADR-003](docs/specs/phase-0-architecture.md), [ADR-008](docs/specs/phase-2-database.md)).

- Schema: [`prisma/schema.prisma`](prisma/schema.prisma)
- Migrations: [`prisma/migrations/`](prisma/migrations) — applied with Prisma Migrate, never `db push` (see ADR-010)
- Database access boundary: [`src/database/prisma.service.ts`](src/database/prisma.service.ts) + [`prisma.module.ts`](src/database/prisma.module.ts) — the only place `PrismaClient` is instantiated
- Prisma config (used by the CLI, not the running app): [`prisma.config.ts`](prisma.config.ts)

**Prisma 7 note:** `PrismaClient` requires an explicit driver adapter — there is no more implicit query-engine-binary connection. This project uses `@prisma/adapter-pg` (wraps `pg`) for PostgreSQL. The datasource URL is *not* declared in `schema.prisma` (Prisma 7 rejects that); it's read from `prisma.config.ts` for CLI commands and passed explicitly to the adapter at runtime via `ConfigService`.

### Local PostgreSQL (Docker)

```bash
docker compose up -d      # start Postgres (named volume: eventhub_postgres_data)
docker compose down       # stop, keep data
docker compose down -v    # stop and wipe the volume (clean slate)
```

Dev-only credentials (`postgres`/`postgres`/`eventhub`), matching `.env.example`. This compose file is local-development-only — production connects to a managed Postgres instance via `DATABASE_URL`, no Docker involved.

### Prisma Commands

```bash
npm run prisma:generate         # regenerate the Prisma Client (also runs automatically on npm install)
npm run prisma:migrate:dev      # create + apply a migration from schema changes (development)
npm run prisma:migrate:deploy   # apply pending migrations without creating new ones (production/CI)
npm run prisma:studio           # open Prisma Studio (browse/edit data locally)
npm run db:seed                 # populate dev-only sample data (refuses to run if NODE_ENV=production)
```

`prisma:migrate:dev` is development-only — it can create new migrations and will prompt to reset the database if drift is detected. Deployments must use `prisma:migrate:deploy`, which only applies existing, committed migrations.

### Database Architecture

Three tables: `users`, `events`, `event_attendees`. Full relationship diagram and reasoning: [`docs/specs/phase-0-architecture.md`](docs/specs/phase-0-architecture.md#database-design) (design) and [`docs/specs/phase-2-database.md`](docs/specs/phase-2-database.md) (implementation).

- **User** creates many **Events** (`Event.createdBy`).
- **User** attends many **Events** through **EventAttendee** (many-to-many join table).

### Constraints

- `users.email` — `UNIQUE`
- `event_attendees(eventId, userId)` — composite `UNIQUE` — the database-level guarantee against duplicate RSVPs, including under concurrent requests
- `events.capacity` — `CHECK (capacity > 0)`
- Foreign keys: `events.createdBy → users.id` (`RESTRICT`), `event_attendees.eventId → events.id` (`CASCADE`), `event_attendees.userId → users.id` (`CASCADE`) — reasoning for each in [`docs/specs/phase-2-database.md`](docs/specs/phase-2-database.md)
- Indexes: `events.createdBy`, `events.startsAt`, `event_attendees.userId` (plus the unique indexes above) — each tied to a specific query pattern, documented in the same file

## Authentication

JWT bearer authentication, built on `@nestjs/passport` + `passport-jwt`.

- **Register** — `POST /api/v1/auth/register`. Creates an account. Does **not** log the user in (no token returned) — registration and authentication are kept as separate, predictable steps. Duplicate email → `409`.
- **Login** — `POST /api/v1/auth/login`. Verifies the Argon2 password hash, returns `{ accessToken, tokenType: "Bearer", expiresIn, user }`. Wrong password and unknown email both return the identical generic `401 Invalid email or password.` — no user enumeration.
- **Protected endpoints** — send the token in the `Authorization` header:

  ```
  Authorization: Bearer <access-token>
  ```

  (Never a real token in this doc — get one from `/auth/login`.) Missing, malformed, tampered, or expired tokens all return the same generic `401`, never a library-internal error message.

- **Current user** — `GET /api/v1/auth/me`, protected by `JwtAuthGuard`. Returns `{ id, name, email }` — never `passwordHash`.

**How it works under the hood:** `JwtStrategy` validates the token's signature/expiry, then loads the current user from the database on every request (not just trusting the JWT payload) — this is what makes a JWT for a deleted account stop working immediately instead of remaining valid until it expires, since this project has no refresh-token/revocation mechanism (ADR-004). See [`docs/specs/phase-3-authentication.md`](docs/specs/phase-3-authentication.md) for the full trade-off writeup.

**Password hashing:** Argon2id, OWASP's 2023-recommended minimum configuration (19 MiB memory, 2 iterations, 1 degree of parallelism) — sized for a web request, not maximized.

**Authorization foundation for later phases:** any protected route can use `@CurrentUser() user: AuthenticatedUser` to get `{ id, name, email }` without touching `request.user` or knowing anything about JWTs — Events' ownership checks (below) use exactly this.

## Events API

- **Public:** `GET /events`, `GET /events/:id` — no token required, browsable by anyone.
- **Authenticated:** `POST /events`, `PATCH /events/:id`, `DELETE /events/:id` — require a bearer token.
- **Ownership:** the event **creator** is the owner. `createdBy` is *always* derived from the authenticated JWT user server-side — `CreateEventDto` has no `createdBy` field at all, and the global `ValidationPipe`'s `forbidNonWhitelisted: true` (Phase 1) rejects outright any request that tries to send one, rather than silently ignoring it. Only the creator may `PATCH`/`DELETE` their event; anyone else gets `403 Forbidden` (not `404` — the event is already publicly readable via `GET`, so there's nothing to conceal by hiding its existence).
- **Pagination:** `?page=1&limit=20` (defaults shown; `limit` capped at 100), offset-based (Prisma `skip`/`take`), response shaped as `{ data: [...], meta: { page, limit, total, totalPages } }`.
- **Search:** `?search=backend` matches (case-insensitive) against `title`, `description`, and `location` via Prisma's parameterized `contains` — never raw SQL.
- **Date filtering:** `?from=...&to=...` (ISO-8601). **The default listing shows upcoming events only** — `from` defaults to "now" when not supplied, which is the entire mechanism behind that default; pass an explicit past `from` to browse past events.
- **Validation:** `title`/`location` required, `capacity` must be a positive integer, `startsAt`/`endsAt` must be valid ISO-8601 with `startsAt < endsAt` (checked against the *final* resulting state on a partial `PATCH`, not just the field that changed), and `startsAt` may not be in the past (small grace window for clock skew — see `docs/specs/phase-4-events.md`).
- **Response shape:** `EventResponseDto`, with a nested safe `createdBy: { id, name, email }` — never the raw Prisma row, never `passwordHash`.

Full design rationale (ownership, pagination trade-offs, search strategy, index review): [`docs/specs/phase-4-events.md`](docs/specs/phase-4-events.md).

**Capacity vs. attendees (Phase 5):** an event's `capacity` cannot be reduced below its current attendee count (`409` if attempted). Reducing capacity while a concurrent RSVP is in flight for the same event is race-free — both operations lock the same event row (see Concurrency below), so whichever commits first is seen by the other before it makes its own decision. `EventResponseDto` now also reports `attendeeCount`/`availableSpots`, computed via Prisma's relation-count (`_count`) in the same query as the event itself — no N+1, even when listing many events at once.

## RSVP

- **Join** — `POST /events/:id/rsvp`. No request body — the attendee is always the authenticated JWT user; there is no `userId` field to send, so there's nothing to spoof. Returns `201` with `{ message, eventId, userId, joinedAt, attendeeCount, capacity, availableSpots }`.
- **Cancel** — `DELETE /events/:id/rsvp`. `204` on success. `404` (not `409`) if you weren't attending — chosen as the single consistent "the thing you're targeting doesn't apply to you" response, matching how a missing event is also `404`.
- **View attendees** — `GET /events/:id/attendees` (requires auth). Paginated (`?page=1&limit=20`, same convention as Events), ordered by `joinedAt` ascending (earliest RSVP first), each entry `{ user: { id, name, email }, joinedAt }` — never `passwordHash`.
- **Duplicate RSVP:** `409` with `"You have already RSVP'd to this event."` — checked at the application level and enforced underneath by the database's own `UNIQUE(eventId, userId)` constraint, which is the actual final authority under concurrency (see below).
- **Full event:** `409` with `"Event is full."` — the attendee count checked is read inside the same locked transaction as the insert, so this can't be raced (see below).
- **Past events:** RSVP is rejected with `409` once `startsAt` has passed — `"RSVP is closed because the event has already started."`

## Concurrency

This is the correctness-critical part of the whole project: RSVP capacity must never be exceeded, and a user must never RSVP twice, **even under many simultaneous requests for the same event**.

**The mechanism — a PostgreSQL transaction with a row lock:**

```
BEGIN
  SELECT * FROM events WHERE id = $1 FOR UPDATE   -- locks the event row
  check: has this user already RSVP'd?             -- app-level duplicate check
  count attendees for this event
  if count >= capacity: ROLLBACK, return 409
  INSERT INTO event_attendees (...)
COMMIT
```

`SELECT ... FOR UPDATE` locks the event row for the duration of the transaction. A second, concurrent RSVP request for the *same event* blocks at that same line until the first transaction commits or rolls back — it cannot proceed to its own count/capacity check on stale data. This is what actually prevents the classic race (two requests both read "99 of 100 taken," both insert, capacity is silently exceeded to 101): under the lock, the second request's count query only runs *after* the first has already committed its insert, so it sees the true, up-to-date count.

- **Why PostgreSQL row locking, not an application-level lock:** a `Map<eventId, Mutex>` or similar in-process lock only works if the app runs as a single instance — it provides zero protection the moment there's more than one process/container, which is a completely realistic near-term deployment shape. The database is the only component every instance of the app necessarily shares, so it's the only place a correctness guarantee can actually live.
- **Why not Redis:** a distributed lock would solve the same multi-instance problem, but at the cost of a second system that itself needs to be correct, available, and kept in sync with the database — for a guarantee Postgres already provides natively via row locking. Not justified at this project's scale (or arguably any scale, given Postgres already does this correctly).
- **Duplicate-RSVP protection has two layers:** the application checks for an existing RSVP inside the locked transaction (the normal path), and the database's `UNIQUE(eventId, userId)` constraint (Phase 2) is the backstop — if a `P2002` unique-violation ever reached the insert anyway, it's caught and translated into the same friendly `409`, never a raw database error.
- **Raw SQL:** the row lock (`SELECT ... FOR UPDATE`) is the *only* raw SQL in the codebase — Prisma's high-level query API has no way to express PostgreSQL locking. It lives in exactly one place (`EventsRepository.findByIdForUpdate`), uses Prisma's parameterized `$queryRaw` tagged template (never string concatenation), and is documented inline.
- **Verified, not assumed:** `test/rsvp.e2e-spec.ts` fires genuinely concurrent requests (`Promise.all`, not sequential `await`s) against the real running app and real Postgres — capacity=1 with 20 concurrent users (exactly 1 succeeds), capacity=10 with 50 concurrent users (exactly 10 succeed), one user firing 15 concurrent duplicate RSVPs (exactly 1 succeeds), two users racing for the last spot on a capacity=1 event (exactly 1 total attendee, ever), and a capacity-reduction racing a concurrent RSVP (the `attendees <= capacity` invariant always holds, regardless of which request wins). All deterministic across repeated runs.

Full design writeup, including the isolation-level reasoning and every concurrency scenario worked through: [`docs/specs/phase-5-rsvp.md`](docs/specs/phase-5-rsvp.md).

**Phase 6 regression check:** none of the above changed in Phase 6. The full concurrency suite (`test/rsvp.e2e-spec.ts`) was re-run after every hardening change (rate limiting, health split, error-response changes) specifically to confirm no regression — still exactly 1/10 successful RSVPs for capacity 1/10, still exactly 1 for both the same-user and cross-user duplicate races, still `attendees <= capacity` under the capacity-update race. Rate limiting in particular could have silently broken these tests (50 concurrent requests hitting a naive IP-based limit) — see Rate Limiting below for how that's avoided.

## Health

Two separate endpoints, separate concerns:

- **`GET /api/v1/health`** — liveness: *is the process alive?* No dependency checks at all — a container orchestrator (Docker/Railway/k8s) restarts the process if this fails, so it must never fail for a reason restarting wouldn't fix (like Postgres being briefly unreachable). Returns `{ status: 'ok', info: { name, environment, uptime } }`.
- **`GET /api/v1/health/ready`** — readiness: *can this instance actually serve requests?* Pings Postgres with `SELECT 1` (cheapest possible check, not a real query). Returns `{ status: 'ok', database: 'up', info: {...} }`, or `503` if the database is unreachable — orchestrators use this to decide whether to route traffic to this instance, not whether to restart it.

## Rate Limiting

`@nestjs/throttler`, in-memory storage (no Redis — a single-instance concern, not a distributed one at this project's scale).

- **General API:** `THROTTLE_LIMIT` requests per `THROTTLE_TTL` seconds (default 100/60s), tracked **per authenticated user** where a request is authenticated, falling back to per-IP otherwise. Per-user tracking (not just per-IP) matters for a real deployment: users behind a shared NAT/VPN don't share one bucket, and it's what the installed `nestjs-best-practices` skill's own rate-limiting guidance recommends.
- **Auth endpoints:** `POST /auth/register` and `POST /auth/login` get a stricter override (default 5/60s, `AUTH_THROTTLE_LIMIT`/`AUTH_THROTTLE_TTL`) — always tracked by IP, since there's no authenticated user yet at that point. This is the classic credential-stuffing/registration-spam target.
- **Exceeding a limit** returns `429 Too Many Requests` in the same error shape as every other error (`code: "TOO_MANY_REQUESTS"`), plus standard `X-RateLimit-*`/`Retry-After` headers.
- **Rate limiting is not a correctness mechanism.** It does not, and could not, protect RSVP capacity or duplicate-RSVP guarantees — those are enforced by the PostgreSQL transaction/lock/constraint described above, entirely independent of request volume. Throttling exists purely to blunt abusive traffic patterns (credential stuffing, scraping, registration spam).
- Verified with a dedicated, isolated test suite (`test/throttle/rate-limit.spec.ts`, `npm run test:throttle`) configured with deliberately tiny limits to prove enforcement actually triggers — kept separate from the main e2e suites, whose legitimately high request volume (especially the RSVP concurrency tests) run against generous limits instead, so normal test/CI runs are never mistaken for abuse.

## Security

- **Authentication:** JWT (`@nestjs/jwt` + `@nestjs/passport` + `passport-jwt`), secret from `JWT_SECRET` (validated at startup, never hardcoded, never logged), short-lived access tokens, minimal payload (`sub` only). Every failure mode — missing, malformed, tampered, or expired token — returns an identical generic `401`, never a library-internal error message (see Authentication above).
- **Password hashing:** Argon2id, OWASP's 2023-recommended minimum configuration. `passwordHash` is never returned in any response and never logged (see below).
- **Input validation:** global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`) on every request — unknown fields are rejected outright, not silently dropped. Every DTO in the app validates types, formats (UUIDs via `ParseUUIDPipe`, emails, ISO-8601 dates), lengths, and numeric ranges (pagination `limit` capped at 100, `capacity` must be positive, etc.).
- **Authorization:** ownership (`Event.createdBy`) is checked in the service layer against the JWT-derived `currentUser.id` — never a client-supplied ID. `CreateEventDto` has no `createdBy` field and RSVP's join/cancel routes take no request body at all, so there is nothing for a client to spoof either identity or ownership with.
- **CORS:** environment-driven via `FRONTEND_URL`, never a wildcard in production — if unset in production, CORS denies all cross-origin requests rather than defaulting open. Development allows a small set of common local frontend ports for convenience.
- **Security headers:** Helmet, applied globally — verified present on live responses (`Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`).
- **Request body limits:** 100kb on JSON/urlencoded bodies — small enough to bound abuse, generous enough for any legitimate Event/RSVP payload.
- **Safe error responses:** every error goes through one global filter that never forwards stack traces, SQL, connection strings, or other internal detail — see API Errors below.
- **Logging redaction:** pino's `redact` config strips `Authorization`/`Cookie` request headers, `Set-Cookie` response headers, and `password`/`passwordHash` request-body fields before anything is ever written to a log line — verified directly by inspecting live structured log output during testing.
- **User enumeration:** login returns the identical `401 Invalid email or password.` whether the account doesn't exist or the password is wrong — a client cannot distinguish the two from the response.

## API

Currently implemented:

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/health` | Public | Liveness — `{ status, info }`. No dependency checks. |
| GET | `/api/v1/health/ready` | Public | Readiness — `{ status, database, info }`. `503` if Postgres unreachable. |
| POST | `/api/v1/auth/register` | Public | Create an account. `201` + safe user, `409` on duplicate email, `429` if rate-limited. |
| POST | `/api/v1/auth/login` | Public | `200` + `{ accessToken, tokenType, expiresIn, user }`, `401`, or `429` if rate-limited. |
| GET | `/api/v1/auth/me` | Bearer JWT | `200` + `{ id, name, email }`, or `401`. |
| POST | `/api/v1/events` | Bearer JWT | Create an event. `201` + `EventResponseDto`, or `400`. |
| GET | `/api/v1/events` | Public | Paginated, searchable, filterable list. `200`. |
| GET | `/api/v1/events/:id` | Public | `200` + `EventResponseDto`, or `404`. |
| PATCH | `/api/v1/events/:id` | Bearer JWT, creator only | Partial update. `200`, `403` (not creator), `404`, or `409` (capacity below attendee count). |
| DELETE | `/api/v1/events/:id` | Bearer JWT, creator only | `204`, `403` (not creator), or `404`. |
| POST | `/api/v1/events/:id/rsvp` | Bearer JWT | Join an event. `201`, `404`, or `409` (duplicate, full, or already started). |
| DELETE | `/api/v1/events/:id/rsvp` | Bearer JWT | Cancel your RSVP. `204`, or `404` (event missing, or not attending). |
| GET | `/api/v1/events/:id/attendees` | Bearer JWT | Paginated attendee list. `200`, or `404`. |

Interactive API docs: **`http://localhost:3000/api/docs`** (Swagger UI) — click "Authorize" and paste `Bearer <token>` from `/auth/login` to try any protected endpoint directly in the browser.

Global conventions already in place for future endpoints:
- Base path `/api/v1` (URI versioning, default version `1`)
- Global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`)
- Consistent error shape on every thrown exception (see below), including known Prisma errors (unique-constraint violations → `409`, not-found → `404`) mapped generically without leaking database detail

## API Errors

One shape for every error, from every endpoint:

```json
{
  "statusCode": 400,
  "code": "BAD_REQUEST",
  "message": "Validation failed",
  "error": "Bad Request",
  "timestamp": "2026-09-24T12:00:00.000Z",
  "path": "/api/v1/example",
  "requestId": "..."
}
```

- **`code`** — a small, stable, machine-readable set derived from the HTTP status (`BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `TOO_MANY_REQUESTS`, `INTERNAL_SERVER_ERROR`, ...) — a client can branch on this without parsing `message`. Deliberately not a large per-business-error taxonomy (`EVENT_FULL`, `DUPLICATE_RSVP`, etc.) — that would be a second classification system to keep in sync with every error a service throws, not worth the upkeep at this project's size; `message` already carries that detail.
- **`requestId`** matches the `req.id` pino attaches to each request's structured logs, so a client-reported error can be traced straight to the corresponding log line.
- Known Prisma errors are translated to safe, generic messages (never the raw database error, which can include table/column names and query fragments) — unique-constraint violations → `409`, not-found → `404`.
- Anything truly unexpected becomes a generic `500` with the message `"Internal server error"` — never a stack trace, SQL statement, or other internal detail. The real error is still logged server-side with the same `requestId`, so it's traceable from logs even though the client never sees it.

## Development Commands

```bash
npm run start          # start
npm run start:dev      # start with watch mode
npm run start:prod     # run compiled dist/main.js

npm run build           # compile TypeScript

npm run lint            # eslint --fix
npm run format           # prettier --write
npm run format:check     # prettier --check

npm test                # unit tests (no database required)
npm run test:watch      # unit tests, watch mode
npm run test:e2e        # end-to-end tests: auth, Events CRUD/authorization, RSVP + concurrency (requires Postgres running)
npm run test:db         # database integration tests against a real Postgres instance
npm run test:throttle   # rate-limit enforcement, with deliberately tiny limits (requires Postgres running)
npm run test:cov        # unit tests with coverage
```

`npm test` never needs a database. `npm run test:e2e`, `npm run test:db`, and `npm run test:throttle` do — start Postgres first (`docker compose up -d`).

## Production Deployment

### Architecture

```text
GitHub
  |
  v
GitHub Actions (lint, build, full test suite, Docker build + runtime smoke test)
  |
  v
Railway
  +-- EventHub API container (this Dockerfile)
  +-- Railway PostgreSQL (managed, DATABASE_URL supplied by Railway)
```

The app has no idea it's running on Railway specifically — it only ever depends on standard environment variables (`DATABASE_URL`, `JWT_SECRET`, `PORT`, ...), so the same image runs identically on any host that can provide a PostgreSQL connection string.

### Node version

Node **22** (LTS), pinned in [`.nvmrc`](.nvmrc), `package.json`'s `engines.node`, and the Dockerfile's base image (`node:22-bookworm-slim`) — one version, declared once, referenced everywhere, rather than three independent guesses across local/CI/Docker.

### Build

```bash
npm ci             # reproducible install from package-lock.json — never `npm install` in CI/CD
npm run build       # nest build -> dist/
```

The compiled output is plain CommonJS JavaScript in `dist/`. Nothing at runtime (`node dist/main.js`) depends on `ts-node`, the Nest CLI, Jest, ESLint, or Prettier — those are devDependencies, present for local development and CI, absent from the production image.

### Start

```bash
npm run start:prod   # node dist/main.js — this is what the container runs
```

Never `nest start --watch` (development-only) in production.

### Database Migration Strategy

Production migrations use `prisma migrate deploy`, **never** `prisma db push` — see `prisma/migrations/` for the committed, reproducible migration history.

**Where migrations run, and why not inside the container's start command:** the natural-looking design — chain `prisma migrate deploy && node dist/main.js` as the container's `CMD` — was tried first and rejected after actually measuring its cost. In Prisma 7, the `prisma` CLI transitively pulls in Prisma Studio's UI toolchain (React, a diagram-layout library, a functional-programming runtime, and more) as dependencies — installing it in the runtime image added **over 150MB** with zero runtime purpose (measured directly: ~916MB with the CLI present vs. the current, much smaller image without it). That's a real cost for a headless API container, not a hypothetical one.

Instead, migrations run as an **explicit, separate step**, using the `prisma`/`typescript` devDependencies that already exist for local development and CI — never inside the deployed container:

- **Local development:** `npm run prisma:migrate:dev` — creates and applies migrations from schema changes.
- **CI (GitHub Actions):** `npx prisma migrate deploy` runs against a fresh, ephemeral Postgres service container before the test suite — proving the committed migrations apply cleanly from an empty database, not just that they worked once, historically, on someone's machine.
- **Production (Railway):** before deploying a release that depends on a schema change, run `npx prisma migrate deploy` with `DATABASE_URL` pointed at the Railway Postgres instance (its public connection string, or from within Railway's own shell/one-off command runner) from a machine with this repository's devDependencies installed. The deployed API container itself never runs `prisma` — it only ever runs `node dist/main.js` against a schema it expects to already be current.

**What happens on migration failure:** the command exits non-zero and nothing else runs — a failed migration never gets papered over. Because migration is decoupled from container start, a failed migration also can't crash-loop the running production container: whatever was serving traffic before keeps serving it, on the old (but still internally consistent) schema, until the migration is fixed and re-run. This is a stronger safety property than the chained-CMD design would have had.

**Multi-replica caveat:** EventHub is currently a single-service, single-replica deployment, which is what makes "run `migrate deploy` once, as a separate step, before deploying" simple and sufficient. If this were ever scaled to multiple concurrent replicas, migrations must still run exactly once per release, not once per replica — Railway's dashboard exposes a way to configure a command that runs once before a new deployment's containers start serving traffic; consult Railway's current documentation for that feature's exact name and use it instead of relying on the container `CMD` if/when this project scales beyond one replica. No such infrastructure is built now, since it isn't a real requirement yet — see "No Premature Infrastructure" in this phase's brief.

### Rollback Considerations

No automated rollback system is implemented — deliberately, per this phase's "no premature infrastructure" constraint. What's true regardless:

- **Application rollback** (redeploying a previous image) is simple and safe on its own — Railway keeps prior deployments.
- **Database rollback is not the same operation**, and is not always possible or even desirable. Prisma Migrate has no built-in "undo" for an applied migration; reversing one means writing and applying a new, forward-only migration that undoes the schema change (which can be lossy — e.g. a dropped column's data is gone).
- **The dangerous combination:** rolling back the application to a previous version *after* a new migration has already applied. The old code may not understand the new schema (a new NOT NULL column it never writes, a renamed column it still references, etc.). For this reason, an application rollback should only be paired with a matching database state — either the schema hasn't changed since the version being rolled back to, or the rollback also includes a compensating migration. This is a judgment call made at rollback time, not something to pre-build automation for at this project's size.

### Swagger in Production

Swagger UI stays available at `/api/docs` in every environment, including production — a deliberate, not accidental, choice: this assignment explicitly asks for API documentation, and EventHub has no sensitive internal detail exposed by the OpenAPI schema itself (no internal architecture, no credentials — just documented public request/response shapes for an API that's already meant to be called by a separate frontend). If a future deployment target genuinely needs Swagger gated (e.g. behind auth, or disabled entirely), that would be a `NODE_ENV`-driven conditional around `setupSwagger()` in `src/main.ts` — not implemented now because it isn't a real requirement yet.

### Health Endpoint for Railway

`railway.json` points Railway's health check at **`/api/v1/health`** (liveness, not readiness) — deliberately. Railway's health check gates whether a deployment is considered successful and whether the container gets restarted; pointing it at liveness means a transient Postgres blip doesn't cause Railway to kill and restart an otherwise-healthy API process (that's exactly the liveness/readiness distinction from Phase 6 — see Health above). `/api/v1/health/ready` exists for anything that specifically needs to confirm database connectivity (e.g. a load balancer deciding whether to route traffic, or this repository's own Docker `HEALTHCHECK` and CI smoke test).

### Local Docker

```bash
docker build -t eventhub-api .

docker compose up -d   # local Postgres, if not already running

docker run --rm -p 3000:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e DATABASE_URL="postgresql://postgres:postgres@host.docker.internal:5432/eventhub" \
  -e JWT_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" \
  -e JWT_EXPIRES_IN=15m \
  eventhub-api
```

Migrations must already be applied to the target database before starting the container (see "Database Migration Strategy" above) — `npm run prisma:migrate:deploy` with the same `DATABASE_URL`.

The image is a non-root, multi-stage Debian-slim build (not Alpine — Prisma's native/engine binaries and argon2's prebuilt bindings have a history of friction with musl libc; a few tens of MB of extra image size buys real reliability). It ships a dependency-free `HEALTHCHECK` (Node's built-in `fetch`, since the slim base has no `curl`) against `/api/v1/health`.

### Railway Deployment Guide

1. Create a new Railway project.
2. Add a PostgreSQL database to the project (Railway provisions it and exposes `DATABASE_URL` to other services in the project automatically).
3. Add a new service, sourced from this GitHub repository. **Set the service's Root Directory to `backend`** (Railway service Settings → Source → Root Directory) — this is a monorepo, so Railway needs to know the API lives in `backend/`, not the repo root. With that set, Railway finds `Dockerfile` and `railway.json` inside `backend/` and builds from there automatically; no further build configuration is required.
4. Configure the service's environment variables: `NODE_ENV=production`, `JWT_SECRET` (a real, random ≥32-character value — never the `.env.example` placeholder, which the app refuses to boot with in production), `JWT_EXPIRES_IN`, `FRONTEND_URL` (your deployed frontend's origin), and optionally the `THROTTLE_*` overrides. Reference the Postgres service's `DATABASE_URL` rather than retyping it. Do **not** set `PORT` — Railway supplies it.
5. Before the first deploy (and before any future deploy that includes a schema change), run `npx prisma migrate deploy` with `DATABASE_URL` set to the Railway Postgres instance's connection string, from a machine with this repo's devDependencies installed (`npm ci` first) — see "Database Migration Strategy" above.
6. Deploy the service.
7. Once deployed, verify `https://<your-service>.up.railway.app/api/v1/health` and `/api/v1/health/ready` both return `200`.
8. Verify Swagger is reachable at `https://<your-service>.up.railway.app/api/docs`.
9. Verify authentication: `POST /api/v1/auth/register`, then `POST /api/v1/auth/login`, and confirm a bearer token comes back.
10. Verify event creation: `POST /api/v1/events` with that token, then confirm it appears in `GET /api/v1/events`.
11. Verify RSVP: `POST /api/v1/events/:id/rsvp`, then `GET /api/v1/events/:id/attendees` to confirm it's recorded.

No real secrets appear above — every value is either a placeholder or something Railway generates/injects itself.

## Architecture & Decisions

Full write-ups live in [`docs/specs/`](docs/specs), updated at the end of each phase:

- [`docs/specs/phase.md`](docs/specs/phase.md) — phase index and status
- [`docs/specs/phase-0-architecture.md`](docs/specs/phase-0-architecture.md) — architecture, database design, API contract, security model, RSVP concurrency design, ADRs 001–006
- [`docs/specs/phase-1-foundation.md`](docs/specs/phase-1-foundation.md) — what Phase 1 built and why
- [`docs/specs/phase-2-database.md`](docs/specs/phase-2-database.md) — what Phase 2 built and why, ADRs 007–010
- [`docs/specs/phase-3-authentication.md`](docs/specs/phase-3-authentication.md) — what Phase 3 built and why, ADRs 011–013
- [`docs/specs/phase-4-events.md`](docs/specs/phase-4-events.md) — what Phase 4 built and why, ADRs 014–017
- [`docs/specs/phase-5-rsvp.md`](docs/specs/phase-5-rsvp.md) — what Phase 5 built and why, ADRs 018–020
- [`docs/specs/phase-6-hardening.md`](docs/specs/phase-6-hardening.md) — what Phase 6 built and why, ADRs 021–023
- [`docs/specs/phase-7-deployment.md`](docs/specs/phase-7-deployment.md) — what Phase 7 built and why, ADRs 024–027

## Known Limitations (Phase 7)

- No refresh tokens, session revocation, or OAuth/social login — out of scope for this assignment (ADR-004). A deleted user's token stops working immediately (the JWT strategy re-checks the database every request), but there's no way to revoke a *still-valid* user's token before it expires.
- Rate limiting uses in-memory storage — correct for a single instance; a genuinely multi-instance deployment would need a shared store (out of scope, and explicitly not Redis per this project's stated constraints).
- Search is a plain case-insensitive `contains` query (no index) — fine at this project's scale; a `pg_trgm` GIN index is the natural next step if search ever becomes a real bottleneck, deliberately not added now.
- Attendee email is currently visible to any authenticated user who views an event's attendee list (not just the event creator) — a deliberate, documented choice for this assignment's scope (`docs/specs/phase-5-rsvp.md`); a real product would likely want to restrict this further.
- `npm run test:e2e`, `npm run test:db`, and `npm run test:throttle` require a running local Postgres (`docker compose up -d`); they are not hermetic like `npm test`.
- Migrations are a manual/CI-driven step against the target database (`prisma migrate deploy`), not automated as part of the Railway deploy itself — a deliberate choice to keep the runtime image lean (see "Database Migration Strategy" above); it does mean a human or a CI job must remember to run it before a schema-changing deploy.
- No automated rollback tooling — application rollback and the database-schema-compatibility judgment call it requires are both documented (see "Rollback Considerations" above) but not automated, per this phase's "no premature infrastructure" constraint.
- CI's Docker job builds and smoke-tests the image but does not push it to a registry — Railway builds its own image directly from the Dockerfile at deploy time, so there's nothing to push to yet.
- 4 high-severity `npm audit` findings, all transitive through the `prisma` CLI's own `@prisma/config` dependency (`deepmerge-ts`, `mysql2`) — dev-tooling-only, not present in the production dependency tree at all (see Phase 7 report / `docs/specs/phase-7-deployment.md` for the full investigation); fixing them requires downgrading to Prisma 6, which is a larger regression than the vulnerabilities themselves warrant.
