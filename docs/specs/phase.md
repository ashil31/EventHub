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
| 7 | Production Deployment & CI/CD Readiness | ✅ Complete | [phase-7-deployment.md](phase-7-deployment.md) |

## What exists right now

- NestJS application foundation (bootstrap, config, validation, security middleware, structured logging, exception handling, split liveness/readiness health checks).
- PostgreSQL + Prisma: schema for `User`/`Event`/`EventAttendee`, an applied initial migration, `PrismaService`/`PrismaModule` database boundary, dev-only seed script, database integration tests against a real Postgres instance.
- Authentication: registration, login, JWT issuance/validation, protected `GET /auth/me`, `@CurrentUser()`/`AuthenticatedUser` authorization foundation, Swagger docs with bearer auth at `/api/docs`.
- Events: full CRUD (`POST`/`GET`/`GET :id`/`PATCH`/`DELETE`), creator-only update/delete authorization, pagination, search, date filtering, `attendeeCount`/`availableSpots` on every event response.
- RSVP: join/cancel/attendee-list, concurrency-safe capacity enforcement (PostgreSQL row-level locking) and duplicate-RSVP prevention, verified with genuinely concurrent requests against real Postgres. Capacity updates on existing events are race-safe against concurrent RSVPs.
- Hardening: rate limiting (`@nestjs/throttler`, per-user tracking, stricter auth-endpoint limit), a `code` field on every error response, and a completed security/logging/error-handling audit.
- Deployment: a minimal, non-root, multi-stage production `Dockerfile` (verified by actually building and running it against real Postgres — full API smoke test, graceful SIGTERM shutdown); a two-job GitHub Actions CI pipeline (full test suite against a Postgres service container; independent Docker build + runtime smoke test); `railway.json` and a documented Railway deployment guide; migrations run as an explicit step (`prisma migrate deploy`) decoupled from the runtime container, not embedded in its start command.
- This is the complete backend feature set the assignment specifies, hardened and deployable. No further phases are scoped in this project's instructions.

## What's next

Nothing further was scoped for this assignment. The application and its deployment path are both complete as specified — see [phase-7-deployment.md](phase-7-deployment.md#m-phase-8-preparation) for what a hypothetical next phase would cover (frontend, observability beyond structured logs), none of which is needed for the backend as currently specified.
