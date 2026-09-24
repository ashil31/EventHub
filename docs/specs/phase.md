# EventHub Backend — Phase Index

Tracks the state of the project phase by phase. Each phase has its own spec file in this folder with the full detail; this file is the status overview. Update this file (and the relevant phase file) at the end of every phase.

| Phase | Title | Status | Spec |
|---|---|---|---|
| 0 | Architecture & Requirements Analysis | ✅ Complete | [phase-0-architecture.md](phase-0-architecture.md) |
| 1 | Production NestJS Foundation | ✅ Complete | [phase-1-foundation.md](phase-1-foundation.md) |
| 2 | PostgreSQL + Prisma Database Foundation | ✅ Complete | [phase-2-database.md](phase-2-database.md) |
| 3 | Auth (register/login/JWT/me) | ⏳ Not started | — |
| 4 | Events CRUD | ⏳ Not started | — |
| 5 | RSVP (with concurrency control) | ⏳ Not started | — |
| 6 | Swagger, hardening, deployment prep | ⏳ Not started | — |

## What exists right now

- NestJS application foundation (bootstrap, config, validation, security middleware, structured logging, exception handling, health check).
- PostgreSQL + Prisma: schema for `User`/`Event`/`EventAttendee`, an applied initial migration, `PrismaService`/`PrismaModule` database boundary, database-backed health check, dev-only seed script, database integration tests against a real Postgres instance.
- No auth, events, or RSVP business modules yet.

## What's next (Phase 3, not started)

Authentication: registration, login, `GET /auth/me`, Argon2 password hashing, JWT issuance/validation (`@nestjs/jwt` + `@nestjs/passport`), `JwtStrategy`, `JwtAuthGuard`, a `users/` module built on the Phase 2 database boundary, and the `@CurrentUser()`/`@Public()` authorization foundation — as scoped in [phase-0-architecture.md](phase-0-architecture.md#security-model) and the Phase 3 preparation note in [phase-2-database.md](phase-2-database.md#18-phase-3-preparation).
