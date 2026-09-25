# Phase 7 — Production Deployment & CI/CD Readiness

Status: **Complete.** Deployment/CI-CD readiness only — no new business features, per the phase's own explicit constraint.

## A. Deployment Architecture

```text
GitHub
  |
  v
GitHub Actions (.github/workflows/ci.yml)
  +-- Job "test":   install -> prisma migrate deploy -> lint -> format check
  |                 -> build -> unit tests -> e2e tests (incl. RSVP
  |                 concurrency) -> db tests -> throttle tests
  |                 (all against a real Postgres service container)
  +-- Job "docker": docker build -> run migrations from the runner ->
                     run the built image -> wait for readiness -> smoke
                     test the live API -> verify graceful SIGTERM shutdown
  |
  v
Railway
  +-- EventHub API service, built directly from this repo's Dockerfile
  +-- Railway PostgreSQL, connected via DATABASE_URL
```

The application has zero Railway-specific code or configuration in `src/` — it depends only on standard environment variables. `railway.json` supplies build/health-check/restart configuration; Railway auto-detects the Dockerfile regardless.

## B. Files Created

- `Dockerfile` — multi-stage (deps / build / prod-deps / runtime) production image.
- `.dockerignore` — excludes `node_modules`, `.git`, tests, docs, env files, and the Dockerfile/compose files themselves from the build context.
- `.github/workflows/ci.yml` — two-job GitHub Actions workflow (test suite; Docker build + runtime smoke test).
- `.nvmrc` — pins Node 22, referenced by CI's `setup-node` and documented as the Dockerfile's base image version.
- `railway.json` — minimal Railway config: Dockerfile builder, liveness health-check path, restart policy.
- `docs/specs/phase-7-deployment.md` — this file.

## C. Files Modified

- `src/main.ts` — explicit `app.listen(port, '0.0.0.0')` (was `app.listen(port)`); containers route traffic to the container's network interface, not just loopback, so the app must bind all interfaces rather than relying on Node's platform-dependent default.
- `src/database/prisma.service.ts` — added a `"Disconnected from PostgreSQL"` log line to `onModuleDestroy`, symmetric with the existing `"Connected to PostgreSQL"` log in `onModuleInit`, so a shutdown is as visible in logs as a startup (Phase 7 §27's "logs should help diagnose ... shutdown").
- `package.json` — added `engines.node: ">=22.0.0"`. Dependency section placement is otherwise unchanged from Phase 6 (see D below for why a first attempt to move `prisma`/`dotenv` into `dependencies` was reverted).
- `package-lock.json` — regenerated from the `package.json` changes.
- `README.md` — new "Production Deployment" section (architecture, Node version, build, start, database migration strategy, rollback considerations, Swagger-in-production decision, health endpoint choice, local Docker usage, Railway deployment guide); updated Tech Stack, Current Status, Local Setup, Environment Variables, Architecture & Decisions, and Known Limitations.

## D. Docker

**Base image:** `node:22-bookworm-slim` (Debian, not Alpine). Alpine's musl libc has a documented history of friction with Prisma's engine binaries and argon2's prebuilt native bindings; Debian slim costs some tens of MB more but removes an entire class of container-only failures. Reliability over size, per this phase's explicit instruction.

**No `--platform` pin.** The image builds natively wherever `docker build` runs — arm64 on the Apple Silicon machine this was developed on, amd64 on GitHub Actions runners and Railway's build infrastructure. `npm ci`/`prisma generate` resolve native/engine binaries for whichever architecture is actually building, so every build is internally self-consistent; the canonical production image is whichever one CI/Railway (amd64) produces.

**Four stages**, not three — this is the direct result of a real problem discovered by measuring, not assuming:

1. `deps` — full `npm ci` (all dependencies), generates the Prisma Client against `prisma/schema.prisma`.
2. `build` — `npm run build` (`nest build` → `dist/`), reusing `deps`' full node_modules.
3. `prod-deps` — a **separate, clean** `npm ci --omit=dev --omit=optional --ignore-scripts`, then the already-generated `node_modules/@prisma/client` and `node_modules/.prisma` are copied in from `deps` (overwriting the ungenerated stub `npm ci` produced without a `prisma` CLI to run `generate`).
4. `runtime` — non-root user, `node_modules` from `prod-deps`, `dist`/`package.json` from `build`. `CMD ["node", "dist/main.js"]`.

**Why stage 3 exists — the discovery that shaped this Dockerfile:** the first version used the conventional `npm prune --omit=dev` after `build`, then ran `npx prisma migrate deploy && node dist/main.js` as the container's `CMD`. Both choices looked reasonable and matched common Prisma/Docker guides. Building and actually running the image (rather than assuming the Dockerfile was correct) surfaced two real problems:

1. **`npm prune --omit=dev` didn't remove `prisma`.** `@prisma/client` (a production dependency) declares `prisma` as an *optional peer dependency*; npm auto-installs resolvable optional peers and `npm prune --omit=dev` keeps anything satisfying a peer of a production package, regardless of where it's also listed. Measured directly: the pruned image was **916MB**.
2. **`prisma` itself is heavy in v7.** `du -sh node_modules/*` inside the built image showed `effect` (34MB), `@electric-sql` (26MB), `react-dom` (7.9MB), `elkjs` (7.7MB), `@visx`, `remeda`, `valibot`, `fast-check`, `libphonenumber-js` — none of which are EventHub dependencies. `npm why react-dom`/`npm why effect` traced every one of them to `@prisma/studio-core`, a transitive dependency of the `prisma` CLI package — Prisma 7 bundles Studio's React-based UI toolchain directly into the CLI. None of it has any purpose in a headless API container.

Given that, embedding `prisma migrate deploy` in the container's start command wasn't worth ~150MB of unrelated frontend code for one CLI invocation. The fix was to decouple migrations from the runtime image entirely (see E below) and install production dependencies via a **fresh** `npm ci --omit=dev --omit=optional`, which does correctly skip the optional peer. Rebuilding with this design measured **555MB** — a 361MB reduction, verified by rebuilding and re-measuring, not assumed.

**Non-root:** a system user/group (`nestjs`, uid/gid 1001) is created explicitly (Debian's base image ships no default unprivileged app user the way some Node images do) and the final `USER nestjs` applies before `CMD`.

**`.dockerignore`:** excludes `node_modules`, `.git`, `.github`, test files, `docs/`, `README.md`, `.env*`, logs, editor directories, `*.tsbuildinfo`, and the Docker-related files themselves — while deliberately *not* excluding `prisma/` (needed by the `deps` stage to generate the client) or any of the TypeScript config files the `build` stage needs.

**Healthcheck:** `HEALTHCHECK` uses Node's built-in global `fetch` against `/api/v1/health` — no `curl` is installed (Debian slim doesn't ship it, and adding it just for this would grow the image for no runtime benefit).

**Verified, not assumed** — the full loop was run for real, twice (once against the 916MB build to find the problem, once against the final 555MB build to confirm the fix): `docker build`, then the container run against the real `eventhub-postgres` Docker Compose database (shared network, service-name DNS resolution), with `prisma migrate deploy` run from the host first. Confirmed: clean startup with structured JSON logs (no `pino-pretty` in production), `GET /api/v1/health` → `200`, `GET /api/v1/health/ready` → `200` with `"database":"up"`, the full API flow (register → login → create event → list → get → RSVP → list attendees → cancel RSVP → update event → delete event) all succeeded end-to-end against the containerized app, Swagger UI reachable at `/api/docs`, an unknown route returned the safe generic error shape (no stack trace/internal detail), and `docker stop` (SIGTERM) produced exit code `0` with a logged `"Disconnected from PostgreSQL"` line — Nest's shutdown hooks (`app.enableShutdownHooks()`, already present since Phase 1) plus `PrismaService.onModuleDestroy` working exactly as designed inside a real container, not just in a test mock.

## E. Database Migration Strategy

**Command:** `prisma migrate deploy`, never `prisma db push`, in every environment — local, CI, and production alike.

**Where migrations run — deliberately *not* inside the deployed container.** The chained `CMD ["sh","-c","npx prisma migrate deploy && node dist/main.js"]` design was tried first and discarded once it was shown to require installing the Prisma CLI (and, by extension, Prisma Studio's ~150MB UI toolchain — see D above) in the runtime image. Instead:

- **Local development:** `npm run prisma:migrate:dev` — creates and applies migrations from schema changes, using the `prisma`/`dotenv` devDependencies already present for local work.
- **CI:** the `test` job runs `npx prisma migrate deploy` against a completely fresh GitHub Actions Postgres service container before any tests run — proving the committed migration history applies cleanly from an empty database. The `docker` job does the same, independently, against its own fresh Postgres container, before starting the built image — proving migrations work from the *deployed artifact's* perspective too, not just the test suite's.
- **Production (Railway):** `npx prisma migrate deploy` is run as an explicit, separate step against Railway's `DATABASE_URL`, from a machine with this repo's devDependencies installed, before a deploy that depends on the new schema. The deployed API container itself never runs `prisma` at all — it only ever runs `node dist/main.js` against a schema it expects to already be current.

**On failure:** the command exits non-zero and nothing downstream runs — in CI, the job fails and nothing merges/deploys; for a manual production migration, the operator sees the failure directly and the currently-running container (on the old, still-internally-consistent schema) is never touched. This is a stronger safety property than a chained container `CMD` would have had, where a migration failure would instead crash-loop the container the orchestrator is trying to bring up.

**Multi-replica caveat (documented, not built):** this design is correct and simple because EventHub is currently a single-service, single-replica deployment. If it were ever scaled to N concurrent replicas, migrations must still run exactly once per release, not once per replica — Railway's dashboard exposes a way to run a command once before new replicas start serving traffic; consult Railway's current documentation for that feature's exact name if this project ever scales beyond one replica. No such infrastructure is built now, since it isn't a real requirement yet.

## F. CI/CD

Two independent jobs in `.github/workflows/ci.yml`, both on `pull_request` and `push` to `main`:

**`test`** — a GitHub Actions Postgres 16 service container (health-checked via `pg_isready` before any step proceeds), then: `npm ci` → `prisma migrate deploy` → `npm run lint` → `npm run format:check` → `npm run build` → `npm test` → `npm run test:e2e` (includes the full Phase 5 RSVP concurrency suite) → `npm run test:db` → `npm run test:throttle`. Every step uses this repository's actual `package.json` scripts — nothing invented for CI.

**`docker`** — proves the actual deployment artifact, not just the source: `docker build`, a second independent Postgres container (network-isolated, published to the host so the runner's own `prisma migrate deploy` can reach it), migrations applied from the runner's toolchain, the built image started against that database, a poll loop waiting for `/api/v1/health/ready` to return `200`, then a real smoke test (health, Swagger, register, login, create an event) against the running container, then a graceful-shutdown check (`docker stop`, assert exit code `0`), then teardown (`if: always()`, so a failed run still cleans up its containers/network).

**Node version consistency:** both jobs' `actions/setup-node` read `node-version-file: .nvmrc` — the same file the Dockerfile's `ARG NODE_IMAGE` and the README both point to, so local development, CI, and the Docker image are never three independent guesses at a Node version.

**No `npm audit` gate in CI.** Investigated manually instead (see G) — the only findings are transitive through the `prisma` CLI's own dev-tooling dependency, unfixable without a Prisma downgrade, and would make CI red on every run for a problem entirely outside this project's dependency choices. Per this phase's explicit instruction not to force breaking upgrades just to make an audit command look clean, this was a documented decision, not an oversight.

## G. Security

- **Secrets:** no real credential appears anywhere in `Dockerfile`, `.dockerignore`, `.github/workflows/ci.yml`, `railway.json`, `.nvmrc`, or the README's deployment documentation. CI uses fixed, clearly-labeled fake values (`CI_JWT_SECRET: ci-only-secret-not-for-production-use-...`) for an ephemeral, throwaway database that exists only for the job's duration.
- **No secret-printing:** no step in the workflow echoes an environment variable, dumps `env`, or enables shell tracing (`set -x`) — a leak vector explicitly called out in this phase's brief.
- **`.env` never reaches the Docker build context** — excluded by `.dockerignore`; the runtime image has no `.env` file and depends entirely on injected environment variables.
- **`.git`/`.github` excluded from the build context** — no commit history, no workflow definitions, ship inside the image.
- **Docker:** non-root runtime user (D above); minimal image (D above, verified by measurement, not just architecture on paper); no unnecessary OS packages installed (Debian slim's default package set only — no `curl`, no build tools in the final stage).
- **Dependency audit:** `npm audit` (full, and `--omit=dev` separately) reports **4 high-severity findings**, all the same root cause: `prisma` (devDependency) → `@prisma/config` → `deepmerge-ts` (stack-exhaustion advisory) and `mysql2` (auth-downgrade / decompression-bomb advisories, relevant only to Prisma's MySQL support, which this project doesn't use). Verified directly that `npm audit --omit=dev` reports the *same* four findings as the full audit — i.e. nothing about them is specific to the dev-only install; they're inherent to `@prisma/config` at the currently-installed `prisma@7.10.0`. Confirmed via `npm ls prisma`: `prisma` is not, and has never been in this phase, a production dependency (see D/E above for why it's kept out of the runtime image specifically), so **none of these four findings reach the production dependency tree or the deployed container** — they exist only in the local/CI devDependency install used to run migrations and generate the Prisma Client. `npm audit fix --force`'s only offered remediation is downgrading to `prisma@6.19.3`, which would reverse this project's earlier, deliberate Prisma 7 adoption (driver adapters, `prisma.config.ts`, etc. — Phase 2) for advisories that don't affect this project's actual runtime. Left unresolved and documented, per this phase's explicit instruction not to force a breaking downgrade just to clear an audit.
- **Runtime error safety (re-verified in the actual production container, not just via unit tests):** an unknown route hit against the running Docker container returned `{"statusCode":404,"code":"NOT_FOUND","message":"Cannot GET /api/v1/does-not-exist", ...}` — no stack trace, no file path, no Prisma/SQL detail. Structured JSON logs (no `pino-pretty`, matching the Phase 1 `NODE_ENV === 'production'` branch) were inspected directly and contain no `Authorization` header, cookie, or password field, consistent with Phase 6's redaction config.

## H. Railway Readiness

`railway.json` sets `builder: DOCKERFILE` (Railway would auto-detect the Dockerfile regardless — this makes the choice explicit) and `deploy.healthcheckPath: /api/v1/health`. **Liveness, not readiness, deliberately** — Railway's health check gates deploy success and container restarts; pointing it at readiness would mean a transient Postgres blip could make Railway kill and restart an otherwise-healthy API process, exactly the failure mode Phase 6 split liveness/readiness to avoid. `/api/v1/health/ready` remains available for anything that specifically needs to confirm database connectivity (this repository's own Docker `HEALTHCHECK` and the CI Docker job's smoke test both use it).

The full 11-step Railway deployment guide (create project → add Postgres → add service from GitHub → configure env vars → run migrations → deploy → verify health/readiness → verify Swagger → verify auth → verify event creation → verify RSVP) is in the README's "Production Deployment" section — written to be followed literally, with no real secrets and no assumed familiarity with Railway's dashboard beyond what's described.

## I. Testing

```
npm run lint            → pass (0 problems)
npm run format:check    → pass
npm run build            → pass
npx prisma validate      → "The schema at prisma/schema.prisma is valid"

Unit tests (npm test, no database):                 59 tests, 7 suites — pass
E2E tests (npm run test:e2e, real Postgres):         79 tests, 4 suites — pass
  (includes the full Phase 5 RSVP concurrency suite — capacity=1/20 users,
   capacity=10/50 users, same-user race, cross-user race, capacity-update
   race — re-run as a regression check, zero result changes)
Database tests (npm run test:db, real Postgres):     13 tests, 2 suites — pass
Rate-limit tests (npm run test:throttle):             3 tests, 1 suite — pass

Total: 154/154 passing
```

**Docker build & runtime, verified manually against the real stack** (the same sequence the CI `docker` job automates): `docker build` succeeded; the built image, run against the project's real `docker-compose` Postgres over a shared Docker network, connected, served the full API smoke test (health → register → login → create event → list → get → RSVP → list attendees → cancel RSVP → update event → delete event → Swagger), and shut down cleanly on `docker stop` (SIGTERM), exit code `0`, with the new `"Disconnected from PostgreSQL"` log line present.

No test assertion was weakened, no timeout loosened, and no compiler/lint rule relaxed to make anything pass. No `@ts-ignore`, `@ts-expect-error`, or new `eslint-disable` was added this phase.

## J. Dependency Changes

**Added:** none. No new runtime or dev dependency was introduced this phase — the entire brief was achievable with the existing dependency set (Prisma's CLI, already present as a devDependency since Phase 2, is what CI and local migrations use).

**Removed:** none.

**Section placement (tried, then reverted):** `prisma` and `dotenv` were briefly moved from `devDependencies` to `dependencies`, to support the container-embedded `prisma migrate deploy` design. Once that design was replaced (D/E above), both were moved back to `devDependencies` — their only consumers are local development, CI, and ad hoc production migration runs, none of which are the deployed container.

**`package.json` additions:** `engines.node: ">=22.0.0"` — declarative, not enforced by any tooling change; documents the same version pinned in `.nvmrc` and the Dockerfile.

**`package-lock.json`:** regenerated (`npm install`) after the section-placement changes above; final state has the same resolved versions as Phase 6, just corrected dependency-graph metadata.

## K. NestJS Concepts

- **Application lifecycle & shutdown hooks (`app.enableShutdownHooks()`).** Already present since Phase 1, exercised for real this phase: Nest listens for `SIGTERM`/`SIGINT` and, on receipt, calls `onModuleDestroy()` on every provider that implements it — here, `PrismaService.onModuleDestroy()` closes the underlying `pg` connection pool. This is why `docker stop` (which sends `SIGTERM`, waits, then `SIGKILL`s) produces a clean exit rather than an abrupt connection drop: the framework's lifecycle, not any bespoke signal-handling code, is what makes graceful shutdown work. Express equivalent: manually registering `process.on('SIGTERM', ...)` and closing every resource (DB pools, in-flight request draining) by hand — Nest's module lifecycle does this declaratively, once, for anything that implements the interface.
- **Configuration via `ConfigModule`/`ConfigService`, and where it *can't* reach.** `app.listen(port, '0.0.0.0')` still reads `port` from `ConfigService` (`app.port`, itself sourced from `process.env.PORT` in `configuration.ts`) — this is how the same code works unmodified whether `PORT` comes from a local `.env` file or is injected directly by Railway at container start. The explicit `'0.0.0.0'` host argument is not configuration at all — it's a fixed, correct value for "any environment that isn't literally this developer's own machine," so it's hardcoded rather than environment-driven, unlike every actual tunable in this app.
- **Health checks as ordinary controllers, not a special framework mechanism.** `HealthController`/`HealthService` (Phase 6) are just an `@Controller()` and an `@Injectable()` like any other — NestJS has no bespoke "health check" primitive separate from its normal request-handling pipeline. What makes them suitable for Railway/Docker health checks is entirely how they're *written* (cheap, dependency-free for liveness; a minimal `SELECT 1` for readiness), not anything framework-specific about how they're wired up.
- **Providers instantiated once, at startup, through the DI container.** `PrismaService`'s constructor runs once when Nest builds the module graph at boot — it's the same single `PrismaClient`/connection pool instance injected everywhere throughout the process's life, which is exactly why a container restart (not a request-scoped reconnect) is the correct response to a database becoming unreachable, and why `onModuleInit`'s eager `$queryRaw\`SELECT 1\`` (Phase 2) is what makes bad credentials or a down database fail *at startup* rather than on some later, arbitrary first request.
- **Guards/filters/middleware are indifferent to how the process is hosted.** `AppThrottlerGuard` (`APP_GUARD`), `AllExceptionsFilter` (`APP_FILTER`), and Helmet middleware (Phase 1) all continue to run exactly as before inside the production container — nothing about Dockerizing the app or deploying it to Railway changes the request-handling pipeline. This phase didn't touch any of them; verifying they still worked correctly *inside a real container* (safe error bodies, security headers, rate-limit headers, all observed on live responses from the running Docker container) was the point of the smoke test, not a change to how they operate.

## L. Remaining Risks

- **Migrations require a manual/CI-driven step, not an automatic part of the Railway deploy.** A deliberate trade-off (E above) to keep the runtime image lean — it does mean a human or a CI job must remember to run `prisma migrate deploy` before a schema-changing deploy; nothing currently blocks a deploy from proceeding without it.
- **4 high-severity `npm audit` findings**, transitive through `prisma`'s own `@prisma/config` dependency, confirmed not present in the production dependency tree (G above) — but unresolved, since the only fix Prisma currently offers is a downgrade to v6.
- **No image registry push.** CI's `docker` job builds and smoke-tests the image locally to the runner but doesn't push it anywhere — appropriate for now, since Railway builds its own image directly from the Dockerfile at deploy time rather than pulling a pre-built one, but would need to change if a future deployment target expects a pre-built image from a registry.
- **No automated rollback tooling**, and deliberately so (README "Rollback Considerations") — a rolled-back application version paired with an incompatible newer database schema is a real failure mode that requires a human judgment call at rollback time, not something safely automatable at this project's size.
- **In-memory rate-limit storage and no refresh-token/session-revocation mechanism** — both pre-existing, documented limitations from Phase 6, unchanged and unaffected by this phase.

None of these are regressions — they're either deliberate, documented trade-offs made this phase, or pre-existing limitations carried forward accurately.

## Architecture Decisions (ADR-024 – ADR-027)

**ADR-024 — Multi-Stage Docker Build, Debian Slim, Non-Root**
Decision: four-stage `Dockerfile` (`deps` / `build` / `prod-deps` / `runtime`) on `node:22-bookworm-slim`, with an explicitly created non-root user for the final stage.
Reason: separates "what's needed to build" from "what's needed to run," keeping the shipped image to compiled JS + production dependencies only; Debian over Alpine avoids musl-libc compatibility issues with Prisma/argon2's native code; running as non-root is standard container hardening with no functional cost for a stateless API.
Trade-off: four stages is more than the minimum viable two-stage Dockerfile — justified specifically by the `prod-deps` stage's necessity (see ADR-025); a simpler Dockerfile would have shipped ~150MB of unnecessary dependencies.

**ADR-025 — Migrations Decoupled From the Runtime Image**
Decision: `prisma migrate deploy` runs as a separate step (CI, or manually against production) using the `prisma` devDependency — never inside the deployed container's start command.
Reason: measured directly that including the `prisma` CLI in the runtime image (needed for an embedded `migrate deploy && start` `CMD`) added ~360MB, almost entirely Prisma Studio's UI toolchain pulled in as an unavoidable transitive dependency of the CLI package in v7 — dead weight in a headless API container. Decoupling also means a failed migration can't crash-loop the running production container, since migration and container-start are no longer the same operation.
Trade-off: migrations are no longer automatic on every deploy — a human or CI step must run them explicitly before a schema-changing release; documented as a remaining risk (L above) rather than solved with additional deploy-pipeline infrastructure, per this phase's "no premature infrastructure" constraint.

**ADR-026 — Two-Job CI: Test Suite + Independent Docker Build/Runtime Smoke Test**
Decision: `.github/workflows/ci.yml` runs the full test suite (unit/e2e/db/throttle against a GitHub Actions Postgres service container) and, as a separate job, builds the production Docker image and actually runs it — migrate, boot, health-check, serve a real request, shut down cleanly — rather than only checking that `docker build` exits `0`.
Reason: `docker build` succeeding proves the image compiles; it proves nothing about whether the image actually works. The Docker job answers the question CI is actually meant to answer for a containerized deployment: "does this artifact, as built, function end-to-end against a real database?"
Trade-off: a second, slower job (image build + container orchestration) on every PR/push, instead of just extending the existing test job — accepted as worth the extra CI minutes for what it verifies, and kept independent so a Docker-specific failure doesn't block the (faster, more frequently useful) test job's results.

**ADR-027 — Railway Health Check Targets Liveness, Not Readiness**
Decision: `railway.json`'s `deploy.healthcheckPath` is `/api/v1/health` (liveness), not `/api/v1/health/ready` (readiness).
Reason: directly continues Phase 6's liveness/readiness split — an orchestrator's restart/deploy-success gate should never fail for a reason restarting the process wouldn't fix. A transient Postgres blip failing readiness is exactly that kind of reason; pointing Railway's health check at it would risk unnecessary restarts of an otherwise-healthy process.
Trade-off: Railway's health check no longer confirms database connectivity on its own — acceptable, since `/health/ready` still exists and is exercised by this project's own Docker `HEALTHCHECK` and CI smoke test, just not by Railway's deploy gate specifically.

## Skill Compliance

The installed `nestjs-best-practices` skill's guidance continued to be followed throughout — no controller/service/repository boundary was touched this phase (deployment-only, per the brief), `devops-use-config-module` remains satisfied (the one new runtime behavior, binding `0.0.0.0`, is deliberately *not* environment-driven, since it's correct in every real deployment target rather than a genuine per-environment tunable), and no new abstraction, wrapper, or DI layer was introduced — the phase's own "functional/procedural style, avoid unnecessary abstractions" preference was followed by keeping the Dockerfile, CI workflow, and `railway.json` as plain, explicit configuration rather than building any tooling/scripting layer around them. No architectural rule from the skill was violated or knowingly deviated from this phase.

## M. Phase 8 Preparation

Phase 7 was this project's deployment-readiness phase — the repository now builds, tests, and runs the same way locally, in CI, and (per the documented Railway guide) in production. Nothing in Phase 7's own brief scopes a Phase 8; per its explicit instruction, none was implemented. If a Phase 8 were to follow, the natural next steps outside this phase's scope would be: the React frontend (explicitly out of scope for every backend phase so far, including this one); observability beyond structured logs (metrics/tracing, if a real need for it emerges); and revisiting the documented "Remaining Risks" above (L) if this project's actual scale ever changes — none of which are needed for the application as currently specified. The backend itself — auth, Events, RSVP, rate limiting, health checks, structured logging, a consistent error contract, and now a verified production Docker image with CI/CD — is feature-complete, hardened, and deployable as specified.
