# EventHub Backend

## Overview

EventHub is an event management and RSVP platform. This repository is the backend API: a modular NestJS application backed by PostgreSQL (via Prisma), with JWT authentication and Swagger-documented endpoints for events and RSVPs.

See [`docs/specs/`](docs/specs) for the full architecture, database design, API contract, security model, and RSVP concurrency strategy, tracked phase by phase.

## Tech Stack

- **Framework:** NestJS 11 (TypeScript, strict mode)
- **Database:** PostgreSQL 16
- **ORM:** Prisma 7 (`@prisma/client` + `@prisma/adapter-pg`)
- **Auth:** JWT (`@nestjs/jwt` + `@nestjs/passport` + `passport-jwt`) + Argon2id password hashing
- **Docs:** Swagger / OpenAPI at `/api/docs`
- **Testing:** Jest, Supertest
- **Logging:** Pino (structured JSON logs, request correlation IDs)
- **Containerization:** Docker Compose (local Postgres only, so far)

## Current Status

**Phase 3 complete.** Application foundation (Phase 1) + database layer (Phase 2) + authentication:

- PostgreSQL + Prisma, schema for `User`/`Event`/`EventAttendee`, an applied initial migration, a `PrismaService`/`PrismaModule` database boundary, database-backed health check, and a database integration test suite run against a real Postgres instance.
- Registration, login, JWT issuance/validation, a protected `GET /auth/me`, and Swagger docs with bearer-token auth wired in.
- **No events or RSVP endpoints exist yet.** The database schema and authorization foundation (`@CurrentUser()`, `AuthenticatedUser`) are ready for them.

## Local Setup

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

**Authorization foundation for later phases:** any protected route can use `@CurrentUser() user: AuthenticatedUser` to get `{ id, name, email }` without touching `request.user` or knowing anything about JWTs — the future Events module's ownership checks (`event.createdBy === currentUser.id`) will use exactly this.

## API

Currently implemented:

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/health` | Public | `{ status, database, info }`. Pings Postgres with `SELECT 1`; returns `503` if unreachable. |
| POST | `/api/v1/auth/register` | Public | Create an account. `201` + safe user, `409` on duplicate email. |
| POST | `/api/v1/auth/login` | Public | `200` + `{ accessToken, tokenType, expiresIn, user }`, or `401`. |
| GET | `/api/v1/auth/me` | Bearer JWT | `200` + `{ id, name, email }`, or `401`. |

Interactive API docs: **`http://localhost:3000/api/docs`** (Swagger UI) — click "Authorize" and paste `Bearer <token>` from `/auth/login` to try `/auth/me` directly in the browser.

Global conventions already in place for future endpoints:
- Base path `/api/v1` (URI versioning, default version `1`)
- Global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`)
- Consistent error shape on every thrown exception (see below), including known Prisma errors (unique-constraint violations → `409`, not-found → `404`) mapped generically without leaking database detail

### Error response shape

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "timestamp": "2026-09-24T12:00:00.000Z",
  "path": "/api/v1/example",
  "requestId": "..."
}
```

`requestId` matches the `req.id` pino attaches to each request's structured logs, so a client-reported error can be traced straight to the corresponding log line.

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
npm run test:e2e        # end-to-end tests, including the full auth flow (requires Postgres running)
npm run test:db         # database integration tests against a real Postgres instance
npm run test:cov        # unit tests with coverage
```

`npm test` never needs a database. `npm run test:e2e` and `npm run test:db` do — start Postgres first (`docker compose up -d`).

## Architecture & Decisions

Full write-ups live in [`docs/specs/`](docs/specs), updated at the end of each phase:

- [`docs/specs/phase.md`](docs/specs/phase.md) — phase index and status
- [`docs/specs/phase-0-architecture.md`](docs/specs/phase-0-architecture.md) — architecture, database design, API contract, security model, RSVP concurrency design, ADRs 001–006
- [`docs/specs/phase-1-foundation.md`](docs/specs/phase-1-foundation.md) — what Phase 1 built and why
- [`docs/specs/phase-2-database.md`](docs/specs/phase-2-database.md) — what Phase 2 built and why, ADRs 007–010
- [`docs/specs/phase-3-authentication.md`](docs/specs/phase-3-authentication.md) — what Phase 3 built and why, ADRs 011–013

## Known Limitations (Phase 3)

- No events or RSVP endpoints yet — the authorization foundation (`@CurrentUser()`, `AuthenticatedUser`) is ready for them.
- No refresh tokens, session revocation, or OAuth/social login — out of scope for this assignment (ADR-004). A deleted user's token stops working immediately (the JWT strategy re-checks the database every request), but there's no way to revoke a *still-valid* user's token before it expires.
- No rate limiting yet on `/auth/login` / `/auth/register` — flagged as a specific future hardening item in `docs/specs/phase-3-authentication.md`.
- `npm run test:e2e` and `npm run test:db` require a running local Postgres (`docker compose up -d`); they are not hermetic like `npm test`.
- No application Dockerfile yet (Postgres has one via docker-compose; the app's own Dockerfile is deferred — see `docs/specs/phase-1-foundation.md`).
