# EventHub Backend

## Overview

EventHub is an event management and RSVP platform. This repository is the backend API: a modular NestJS application backed by PostgreSQL (via Prisma), with JWT authentication and Swagger-documented endpoints for events and RSVPs.

See [`docs/specs/`](docs/specs) for the full architecture, database design, API contract, security model, and RSVP concurrency strategy, tracked phase by phase.

## Tech Stack

- **Framework:** NestJS 11 (TypeScript, strict mode)
- **Database:** PostgreSQL
- **ORM:** Prisma (Phase 2)
- **Auth:** JWT + Argon2 (later phase)
- **Docs:** Swagger / OpenAPI (later phase)
- **Testing:** Jest, Supertest
- **Logging:** Pino (structured JSON logs, request correlation IDs)
- **Containerization:** Docker (later phase)

## Current Status

**Phase 1 complete.** This is the application foundation only:

- NestJS bootstrap, global config, validation, security middleware, structured logging, exception handling, and a health endpoint.
- **No database, authentication, events, or RSVP functionality exists yet.** `DATABASE_URL` and the JWT variables are part of the validated environment contract but are not consumed by any code in this phase.

## Local Setup

```bash
npm install
cp .env.example .env   # then fill in real values for your machine
npm run start:dev
```

The API will be available at `http://localhost:3000/api/v1`.

## Environment Variables

See [`.env.example`](.env.example). All variables below are validated at startup — the app refuses to boot if any are missing or invalid (see [`src/config/env.validation.ts`](src/config/env.validation.ts)):

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | yes | `development` \| `test` \| `production` |
| `PORT` | yes | 1–65535 |
| `DATABASE_URL` | yes | `postgresql://...` — not used until Phase 2, validated now to fix the contract |
| `JWT_SECRET` | yes | ≥32 characters. In production, must not be the `.env.example` placeholder |
| `JWT_EXPIRES_IN` | yes | e.g. `15m` — not used until auth is implemented |
| `FRONTEND_URL` | no | Origin allowed by CORS. If unset in production, CORS denies all cross-origin requests |

## API

Currently implemented:

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/health` | Liveness check — status, environment, uptime. No database check (introduced in Phase 2). |

Global conventions already in place for future endpoints:
- Base path `/api/v1` (URI versioning, default version `1`)
- Global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`)
- Consistent error shape on every thrown exception (see below)

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

npm test                # unit tests
npm run test:watch      # unit tests, watch mode
npm run test:e2e        # end-to-end tests (Supertest against a full app instance)
npm run test:cov        # unit tests with coverage
```

## Architecture & Decisions

Full write-ups live in [`docs/specs/`](docs/specs), updated at the end of each phase:

- [`docs/specs/phase.md`](docs/specs/phase.md) — phase index and status
- [`docs/specs/phase-0-architecture.md`](docs/specs/phase-0-architecture.md) — architecture, database, API contract, security model, RSVP concurrency design, ADRs
- [`docs/specs/phase-1-foundation.md`](docs/specs/phase-1-foundation.md) — what Phase 1 built and why

## Known Limitations (Phase 1)

- No database connectivity, authentication, events, or RSVP functionality yet.
- `/api/v1/health` performs no downstream checks (by design — added once Postgres exists).
- No Swagger UI yet.
- No Dockerfile yet (deliberately deferred — see `docs/specs/phase-1-foundation.md`).
