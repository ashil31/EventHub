# EventHub Backend — Phase Index

Tracks the state of the project phase by phase. Each phase has its own spec file in this folder with the full detail; this file is the status overview. Update this file (and the relevant phase file) at the end of every phase.

| Phase | Title | Status | Spec |
|---|---|---|---|
| 0 | Architecture & Requirements Analysis | ✅ Complete | [phase-0-architecture.md](phase-0-architecture.md) |
| 1 | Production NestJS Foundation | ✅ Complete | [phase-1-foundation.md](phase-1-foundation.md) |
| 2 | PostgreSQL + Prisma Database Foundation | ✅ Complete | [phase-2-database.md](phase-2-database.md) |
| 3 | Authentication & Authorization Foundation | ✅ Complete | [phase-3-authentication.md](phase-3-authentication.md) |
| 4 | Events Module, CRUD & Authorization | ✅ Complete | [phase-4-events.md](phase-4-events.md) |
| 5 | RSVP (with concurrency control) | ⏳ Not started | — |
| 6 | Hardening, deployment prep | ⏳ Not started | — |

## What exists right now

- NestJS application foundation (bootstrap, config, validation, security middleware, structured logging, exception handling, health check).
- PostgreSQL + Prisma: schema for `User`/`Event`/`EventAttendee`, an applied initial migration, `PrismaService`/`PrismaModule` database boundary, database-backed health check, dev-only seed script, database integration tests against a real Postgres instance.
- Authentication: registration, login, JWT issuance/validation, protected `GET /auth/me`, `@CurrentUser()`/`AuthenticatedUser` authorization foundation, Swagger docs with bearer auth at `/api/docs`.
- Events: full CRUD (`POST`/`GET`/`GET :id`/`PATCH`/`DELETE`), creator-only update/delete authorization, pagination, search, date filtering, Swagger-documented.
- No RSVP or attendee endpoints yet.

## What's next (Phase 5, not started)

RSVP: `POST /events/:id/rsvp`, `DELETE /events/:id/rsvp`, `GET /events/:id/attendees`, built on the PostgreSQL transaction + row-lock concurrency design from Phase 0's ADR-005 (already proven usable against the real schema by Phase 2's tests), duplicate-RSVP prevention via the `event_attendees(eventId, userId)` unique constraint, and a dedicated concurrent-RSVP test — as scoped in [phase-0-architecture.md](phase-0-architecture.md#rsvp-concurrency-strategy) and the Phase 5 preparation note in [phase-4-events.md](phase-4-events.md#19-phase-5-preparation).
