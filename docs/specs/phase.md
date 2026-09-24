# EventHub Backend — Phase Index

Tracks the state of the project phase by phase. Each phase has its own spec file in this folder with the full detail; this file is the status overview. Update this file (and the relevant phase file) at the end of every phase.

| Phase | Title | Status | Spec |
|---|---|---|---|
| 0 | Architecture & Requirements Analysis | ✅ Complete | [phase-0-architecture.md](phase-0-architecture.md) |
| 1 | Production NestJS Foundation | ✅ Complete | [phase-1-foundation.md](phase-1-foundation.md) |
| 2 | PostgreSQL + Prisma + Database Schema | ⏳ Not started | — |
| 3 | Auth (register/login/JWT/me) | ⏳ Not started | — |
| 4 | Events CRUD | ⏳ Not started | — |
| 5 | RSVP (with concurrency control) | ⏳ Not started | — |
| 6 | Swagger, hardening, deployment prep | ⏳ Not started | — |

## What exists right now

- NestJS application foundation (bootstrap, config, validation, security middleware, structured logging, exception handling, health check). No database, no auth, no business modules.

## What's next (Phase 2, not started)

PostgreSQL + Prisma: schema for `User`/`Event`/`EventAttendee`, migrations, `PrismaService`, repositories, database constraints and indexes — as scoped in [phase-0-architecture.md](phase-0-architecture.md#database-design) and the Phase 2 preparation note in [phase-1-foundation.md](phase-1-foundation.md#phase-2-preparation).
