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
| 6 | API Hardening & Production Readiness | ✅ Complete | [phase-6-hardening.md](phase-6-hardening.md) |

## What exists right now

- NestJS application foundation (bootstrap, config, validation, security middleware, structured logging, exception handling, split liveness/readiness health checks).
- PostgreSQL + Prisma: schema for `User`/`Event`/`EventAttendee`, an applied initial migration, `PrismaService`/`PrismaModule` database boundary, dev-only seed script, database integration tests against a real Postgres instance.
- Authentication: registration, login, JWT issuance/validation, protected `GET /auth/me`, `@CurrentUser()`/`AuthenticatedUser` authorization foundation, Swagger docs with bearer auth at `/api/docs`.
- Events: full CRUD (`POST`/`GET`/`GET :id`/`PATCH`/`DELETE`), creator-only update/delete authorization, pagination, search, date filtering, `attendeeCount`/`availableSpots` on every event response.
- RSVP: join/cancel/attendee-list, concurrency-safe capacity enforcement (PostgreSQL row-level locking) and duplicate-RSVP prevention, verified with genuinely concurrent requests against real Postgres. Capacity updates on existing events are race-safe against concurrent RSVPs.
- Hardening: rate limiting (`@nestjs/throttler`, per-user tracking, stricter auth-endpoint limit), a `code` field on every error response, and a completed security/logging/error-handling audit.
- This is the complete backend feature set the assignment specifies, hardened for production use. No further phases are scoped in this project's instructions.

## What's next

Nothing further was scoped for this assignment. Natural next steps outside this project's instructed phases would be deployment-focused: a production Dockerfile (deferred since Phase 1), CI/CD, and platform-specific configuration — see [phase-6-hardening.md](phase-6-hardening.md#p-phase-7-preparation).
