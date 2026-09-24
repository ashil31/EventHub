# EventHub Backend — Phase Index

Tracks the state of the project phase by phase. Each phase has its own spec file in this folder with the full detail; this file is the status overview. Update this file (and the relevant phase file) at the end of every phase.

| Phase | Title | Status | Spec |
|---|---|---|---|
| 0 | Architecture & Requirements Analysis | ✅ Complete | [phase-0-architecture.md](phase-0-architecture.md) |
| 1 | Production NestJS Foundation | ✅ Complete | [phase-1-foundation.md](phase-1-foundation.md) |
| 2 | PostgreSQL + Prisma Database Foundation | ✅ Complete | [phase-2-database.md](phase-2-database.md) |
| 3 | Authentication & Authorization Foundation | ✅ Complete | [phase-3-authentication.md](phase-3-authentication.md) |
| 4 | Events CRUD | ⏳ Not started | — |
| 5 | RSVP (with concurrency control) | ⏳ Not started | — |
| 6 | Hardening, deployment prep | ⏳ Not started | — |

## What exists right now

- NestJS application foundation (bootstrap, config, validation, security middleware, structured logging, exception handling, health check).
- PostgreSQL + Prisma: schema for `User`/`Event`/`EventAttendee`, an applied initial migration, `PrismaService`/`PrismaModule` database boundary, database-backed health check, dev-only seed script, database integration tests against a real Postgres instance.
- Authentication: registration, login, JWT issuance/validation, protected `GET /auth/me`, `@CurrentUser()`/`AuthenticatedUser` authorization foundation, Swagger docs with bearer auth at `/api/docs`.
- No events or RSVP business modules yet.

## What's next (Phase 4, not started)

Events CRUD: `events/` module (controller/service/repository following the Phase 3 boundary pattern), Event DTOs, ownership authorization built on `@CurrentUser()`, pagination/filtering for the list endpoint, and Event API tests — as scoped in [phase-0-architecture.md](phase-0-architecture.md#api-contract) and the Phase 4 preparation note in [phase-3-authentication.md](phase-3-authentication.md#21-phase-4-preparation).
