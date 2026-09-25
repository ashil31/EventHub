# EventHub

EventHub is an event management and RSVP platform. This is a monorepo:

```text
EventHub/
├── backend/    NestJS + PostgreSQL + Prisma API — see backend/README.md
├── frontend/   React frontend (not started yet)
└── .github/    CI (runs against backend/)
```

## Backend

The backend is complete: authentication, event CRUD with ownership authorization, RSVP with concurrency-safe capacity enforcement, rate limiting, health checks, structured logging, a production Docker image, CI, and a documented Render deployment path.

Full documentation: **[`backend/README.md`](backend/README.md)**. Phase-by-phase implementation history and architecture decisions: **[`backend/docs/specs/`](backend/docs/specs)**.

```bash
cd backend
npm install
cp .env.example .env
docker compose up -d
npm run prisma:migrate:dev
npm run start:dev
```

## Frontend

Not started. Will live in `frontend/` alongside `backend/` once that phase begins.

## CI/CD

`.github/workflows/ci.yml` lints, builds, and tests the backend (unit, e2e, database, rate-limit, and RSVP concurrency suites against a real PostgreSQL service container), then builds and smoke-tests the production Docker image. All steps run with `backend/` as the working directory. See `backend/README.md`'s "Production Deployment" section for the full CI/CD and Render deployment writeup.
