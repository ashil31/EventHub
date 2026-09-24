# EventHub Backend — Phase Index

Tracks the state of the project phase by phase. Each phase has its own spec file in this folder with the full detail; this file is the status overview. Update this file (and the relevant phase file) at the end of every phase.

| Phase | Title | Status | Spec |
|---|---|---|---|
| 0 | Architecture & Requirements Analysis | ✅ Complete | [phase-0-architecture.md](phase-0-architecture.md) |
| 1 | Production NestJS Foundation | ✅ Complete | [phase-1-foundation.md](phase-1-foundation.md) |
| 2 | PostgreSQL + Prisma Database Foundation | ✅ Complete | [phase-2-database.md](phase-2-database.md) |
| 3 | Authentication & Authorization Foundation | ✅ Complete | [phase-3-authentication.md](phase-3-authentication.md) |
| 4 | Events Module, CRUD & Authorization | ✅ Complete | [phase-4-events.md](phase-4-events.md) |
| 5 | RSVP, Attendee Tracking & Concurrency | ✅ Complete | [phase-5-rsvp.md](phase-5-rsvp.md) |
| 6 | Hardening, deployment prep | ⏳ Not started | — |

## What exists right now

- NestJS application foundation (bootstrap, config, validation, security middleware, structured logging, exception handling, health check).
- PostgreSQL + Prisma: schema for `User`/`Event`/`EventAttendee`, an applied initial migration, `PrismaService`/`PrismaModule` database boundary, database-backed health check, dev-only seed script, database integration tests against a real Postgres instance.
- Authentication: registration, login, JWT issuance/validation, protected `GET /auth/me`, `@CurrentUser()`/`AuthenticatedUser` authorization foundation, Swagger docs with bearer auth at `/api/docs`.
- Events: full CRUD (`POST`/`GET`/`GET :id`/`PATCH`/`DELETE`), creator-only update/delete authorization, pagination, search, date filtering, `attendeeCount`/`availableSpots` on every event response, Swagger-documented.
- RSVP: join/cancel/attendee-list, concurrency-safe capacity enforcement (PostgreSQL row-level locking) and duplicate-RSVP prevention, verified with genuinely concurrent requests against real Postgres. Capacity updates on existing events are now race-safe against concurrent RSVPs.
- This is the complete backend feature set the assignment specifies. Phase 6 is hardening, not new functionality.

## What's next (Phase 6, not started)

Hardening: rate limiting (`@nestjs/throttler`) on auth and RSVP endpoints, a consistency pass over error handling/logging/request-ID propagation, a full security review across the API surface, and production-readiness review (env validation, graceful shutdown under load, query performance) — as scoped in the Phase 6 preparation note in [phase-5-rsvp.md](phase-5-rsvp.md#22-phase-6-preparation).
