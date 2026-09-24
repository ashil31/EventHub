# Phase 1 — Production NestJS Foundation

Status: **Complete.** Scope was restricted to the application foundation only — no auth, users, events, RSVP, Prisma, or database work (that's Phase 2+).

## What was implemented

1. NestJS project scaffold (package.json, tsconfig, nest-cli.json).
2. Environment configuration via `@nestjs/config`, with a typed `configuration.ts` namespace factory.
3. Fail-fast environment validation (`class-validator` + `class-transformer`) for `NODE_ENV`, `PORT`, `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, optional `FRONTEND_URL`.
4. Global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`).
5. Global exception filter producing a single, predictable, safe error response shape.
6. Security middleware: Helmet, environment-aware CORS, JSON body size limit.
7. API versioning (`/api/v1` via global prefix + URI versioning, default version `1`).
8. Structured logging via `nestjs-pino`, with secret/header redaction and automatic per-request correlation IDs.
9. Graceful shutdown hooks (`app.enableShutdownHooks()`).
10. `health/` module — `GET /api/v1/health`, no downstream calls.
11. Testing foundation: Jest (unit) + Jest+Supertest (E2E), isolated from any developer `.env`.
12. Developer tooling: ESLint (flat config, typed rules), Prettier, npm scripts.
13. `.env.example`, `.gitignore`, README.

## Folder Structure (current)

```
eventhub-api/
├── src/
│   ├── common/
│   │   ├── filters/
│   │   │   └── all-exceptions.filter.ts
│   │   └── types/
│   │       └── error-response.type.ts
│   ├── config/
│   │   ├── configuration.ts
│   │   ├── env.validation.ts
│   │   └── env.validation.spec.ts
│   ├── health/
│   │   ├── health.controller.ts
│   │   ├── health.service.ts
│   │   ├── health.service.spec.ts
│   │   └── health.module.ts
│   ├── app.module.ts
│   └── main.ts
├── test/
│   ├── health.e2e-spec.ts
│   ├── jest-e2e.json
│   └── setup-env.ts
├── docs/specs/
│   ├── phase.md
│   ├── phase-0-architecture.md
│   └── phase-1-foundation.md
├── .env.example
├── .gitignore
├── .prettierrc
├── eslint.config.mjs
├── package.json
├── tsconfig.json
├── tsconfig.build.json
└── README.md
```

No `common/interceptors/` or `common/decorators/` were created — nothing needs them yet (pino-http handles HTTP request logging; there's no `@CurrentUser()` until auth exists in a later phase), and creating them empty would violate the "don't fill in structure with nothing in it" instruction. `auth/`, `users/`, `events/`, `database/` were not created for the same reason.

## Important architectural decisions

### 1. Downgraded from the CLI-scaffolded NestJS 12 to NestJS 11

Running `nest new` in this environment resolved the actual current latest major, **NestJS 12** (`@nestjs/core@12.1.0`), which defaults to **ESM** (`"type": "module"`, `.js`-suffixed imports, `nodenext` module resolution), **Vitest**, and **oxlint** — none of which match this project's explicit stack (Jest, Supertest) or the installed `nestjs-best-practices` skill's examples (all CommonJS-style: `import * as request from 'supertest'`, no `.js` extensions).

I converted the scaffold to CommonJS + Jest + ESLint to match the explicit requirements. That held for the app code, but broke when running the actual test suite: **`@nestjs/core`, `@nestjs/common`, and `@nestjs/testing` in the 12.x line ship `"type": "module"` with no CommonJS build at all** — `require('@nestjs/testing')` fails with `SyntaxError: Unexpected token 'export'` under Jest's CJS transform. This isn't a config mistake; the framework itself is ESM-only in that major.

Rather than take on Jest's experimental ESM mode (extra Node flags, `moduleNameMapper` for `.js` extensions, more fragile behavior with `ts-jest` + decorator metadata — exactly the kind of complexity Phase 1's instructions say to avoid), **I downgraded the whole `@nestjs/*` dependency set to the 11.x line** (`@nestjs/core@^11.2.6`, current and fully maintained, not deprecated), which still ships CommonJS. This resolves the conflict at its root and keeps the toolchain exactly as specified (Jest, Supertest, standard NestJS conventions matching the installed skill). Documented here as the deliberate trade-off Phase 0's instructions anticipated: framework tooling defaults vs. explicit project requirements — the explicit requirement won.

### 2. TypeScript 6, not 5

`@nestjs/schematics` (the CLI's scaffolding engine) hard-requires `typescript >=6.0.0` as a peer dependency in this environment, so TypeScript 6 was kept (not a choice made for its own sake — `ts-jest` and `typescript-eslint` both support it fine, verified against their published peer ranges). This did require two small TS 6 migration fixes: `moduleResolution` renamed from `node` to `node10`, and an explicit `rootDir` on `tsconfig.build.json` (TS 6 no longer infers it when `test/`/`*.spec.ts` are excluded).

### 3. Env validation via `class-validator`/`class-transformer`, not Joi

Both packages are already required for the global `ValidationPipe` (Phase 1 §9), so reusing them for env validation (the pattern NestJS's own docs recommend) avoids adding a dependency (Joi) that would exist solely for this one purpose — direct application of the "Dependency Discipline" instruction.

### 4. Structured logging via `nestjs-pino`, not the built-in `Logger`

The built-in Nest `Logger` prints human-readable text, not structured JSON, and has no built-in request-correlation mechanism. `nestjs-pino` + `pino-http` gives:
- JSON logs in production, pretty-printed logs in development (`pino-pretty`, dev-only dependency).
- Automatic per-request correlation IDs (`req.id`), which the exception filter reads and returns as `requestId` in every error response — this is the "connect HTTP request → logs → errors" mechanism Phase 1 §14 asked for, with no custom middleware needed.
- Built-in `redact` paths so `Authorization`/`Cookie` headers and password fields never reach the logs (Phase 1 §13).

This is one dependency (plus `pino`/`pino-http` as its peers), well-justified against "Dependency Discipline," and avoids building a bespoke logging/correlation layer.

### 5. CORS defaults to deny-all in production, not wildcard

If `FRONTEND_URL` isn't set: development gets a small allowlist of common local frontend ports (`5173`, `3000`) for convenience; production gets an **empty origin list** rather than `origin: "*"`, per the explicit instruction not to default production CORS to a wildcard. This will start rejecting real frontend requests until `FRONTEND_URL` is configured — that's intentional; failing closed is the safer default.

### 6. Request body limit: 100kb

Event/RSVP JSON payloads are small (a handful of string/date/int fields). 100kb is generous for that shape while bounding abuse; applied via `express.json({ limit })`/`urlencoded({ limit })` on the `NestExpressApplication` rather than a third-party body-limit package.

### 7. Docker deferred to Phase 2

A Phase-1-only Dockerfile (app, no DB) would need near-immediate revision once Prisma and a real start-up sequence (migrations, DB connectivity) exist in Phase 2, and would encourage testing a shape of the container that never matches what actually ships. Deferring avoids writing something that's rewritten within one phase, per "no premature abstraction."

## Dependencies added

**Runtime:**
- `@nestjs/config` — typed, validated environment configuration (framework-standard, required by the assignment's config contract).
- `class-validator` / `class-transformer` — DTO + env validation (required for the global `ValidationPipe`; reused for env validation, see decision #3).
- `helmet` — standard HTTP security headers.
- `nestjs-pino` / `pino` / `pino-http` — structured logging + request correlation (see decision #4).

**Dev:**
- `jest` / `ts-jest` / `@types/jest` — required test runner (explicit project requirement).
- `supertest` / `@types/supertest` — required E2E HTTP testing (explicit project requirement).
- `eslint` / `typescript-eslint` / `@eslint/js` / `eslint-config-prettier` / `eslint-plugin-prettier` / `globals` — linting, flat config, typed rules, Prettier integration.
- `prettier` — formatting.
- `pino-pretty` — human-readable logs in local dev only.
- `ts-loader`, `ts-node`, `tsconfig-paths`, `source-map-support` — Nest CLI / debug-script standard tooling.

No Redis, message broker, ORM, or auth library was added — those are explicitly out of scope until later phases.

## NestJS concepts introduced

- **Module** (`@Module`) — a class that groups related controllers/providers and declares what it imports/exports. `AppModule` composes `ConfigModule`, `LoggerModule`, `HealthModule`. Express equivalent: closest analogy is a router + its own local `app.use()` wiring, but Nest modules also drive dependency injection scope, which Express has no equivalent of.
- **Controller** (`@Controller`) — declares routes; in `HealthController`, purely routing (calls the service, returns its result). Express equivalent: a route handler function, except Nest derives the route from decorators instead of `router.get('/health', fn)`.
- **Provider / Service** (`@Injectable`) — a class Nest's DI container can construct and inject. `HealthService` holds the actual logic. Express equivalent: a plain module-level function/object you `require()` — Nest's version is instantiated and wired by the framework instead of by hand.
- **Dependency Injection** — constructor parameters are automatically resolved from the DI container (e.g., `ConfigService` into `HealthService`). Express equivalent: manually importing/threading dependencies through function calls; DI removes that wiring and makes swapping implementations (e.g., a mock `ConfigService` in tests) trivial.
- **`ConfigModule`/`ConfigService`** — the typed, validated env-access layer (decisions #3 and #8 in Phase 0/1). Express equivalent: reading `process.env` directly, scattered across files with no validation.
- **`ValidationPipe`** — a **Pipe**: runs before a route handler, transforms/validates the incoming request against a DTO's `class-validator` decorators, rejecting invalid requests with `400` before any business logic runs. Express equivalent: manual `if` checks or a body-validation middleware (e.g., `express-validator`) at the top of each route.
- **Exception Filter** (`@Catch`) — intercepts everything thrown anywhere in the request pipeline and turns it into a response; `AllExceptionsFilter` is registered globally via `APP_FILTER` so every controller/service gets consistent error handling for free. Express equivalent: a final `app.use((err, req, res, next) => ...)` error-handling middleware — conceptually similar, but Nest's version is DI-aware (it can inject the logger) and typed.
- **Middleware** — Helmet and the JSON/urlencoded body parsers are applied the same way as in Express (`app.use(...)`), since Nest's `NestExpressApplication` is built on top of Express here. No custom Nest-style middleware class was needed in Phase 1.
- **Versioning** (`app.enableVersioning`) — a framework feature with no direct Express equivalent; it rewrites route matching so `@Controller('health')` resolves to `/api/v1/health` without repeating `v1` in every path.

## Environment Variables

From [`.env.example`](../../.env.example) (no real secrets — placeholders only):

```
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/eventhub
JWT_SECRET=replace-this-in-development-with-a-long-random-value
JWT_EXPIRES_IN=15m
FRONTEND_URL=http://localhost:5173
```

## API

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/health` | `{ status: 'ok', info: { name, environment, uptime } }`. No DB check. |

Any other path returns the standard error shape, e.g. `GET /api/v1/nonexistent` → `404` with `statusCode`, `message`, `error`, `timestamp`, `path`, `requestId`.

## Testing

- `src/config/env.validation.spec.ts` — unit tests for the fail-fast env validation: accepts a valid environment; rejects invalid `NODE_ENV`, non-numeric `PORT`, missing/malformed `DATABASE_URL`, too-short `JWT_SECRET`, and a production `JWT_SECRET` left as the `.env.example` placeholder.
- `src/health/health.service.spec.ts` — unit tests for `HealthService`: correct shape/status, and an explicit assertion that the response never contains `DATABASE_URL`/`JWT_SECRET`/a connection string.
- `test/health.e2e-spec.ts` — boots the real `AppModule` with the same global pipes as `main.ts`, hits `GET /api/v1/health` over HTTP (Supertest) and asserts the `200` payload; also hits an unknown route and asserts the standard `404` error shape (`statusCode`, `path`, `timestamp`, `requestId`).
- `test/setup-env.ts` — fixed, self-contained env vars injected via Jest `setupFiles` so E2E tests never depend on a developer's local `.env`.

## Validation — commands run and results

```
npm run build          →  pass (no output = success)
npm run lint            →  pass (0 problems)
npm run format:check    →  pass ("All matched files use Prettier code style!")
npm test                →  pass (2 suites, 9 tests)
npm run test:e2e        →  pass (1 suite, 2 tests)
```

Manual verification: `GET /api/v1/health` and the `404` fallback were verified end-to-end through the E2E suite (real HTTP requests via Supertest against a fully bootstrapped app, with the same global prefix/versioning/pipes as production), including inspecting the live pino output — request IDs incrementing per request, the exception filter logging the `404` as a `warn`-level structured log, no headers or secrets in the log lines.

Directly launching the compiled app with `node dist/main.js` on this machine is currently blocked by an unrelated local tool: **VS Code's "Console Ninja" extension** (`wallabyjs.console-ninja`) runs a background helper process that auto-hooks any Node process it detects as NestJS, and — outside of an attached VS Code debug session — that hook causes the process to exit immediately after printing its banner, before Nest's bootstrap can run. This reproduces even with a fully cleared environment (`env -i`) and is specific to processes that require `@nestjs/*` packages; a plain unrelated Node script (`node -e ...`) runs normally. It is a pre-existing artifact of this developer machine's editor tooling, not a defect in this codebase — confirmed by the E2E suite exercising the identical bootstrap path successfully. Documented here rather than silently worked around.

## NestJS skill compliance

Followed: feature-module organization (`health/` as a self-contained module), constructor injection throughout, `ConfigModule`-based configuration (no scattered `process.env`), global `ValidationPipe` with the recommended settings, a single global exception filter, structured logging with redaction, Jest + Supertest for testing.

Intentional deviations, both already documented above: (1) NestJS 11 instead of the CLI's default-scaffolded 12, because 12 is ESM-only and incompatible with the required Jest/CommonJS toolchain; (2) `nestjs-pino` for logging instead of the bare built-in `Logger`, to get structured JSON output and request correlation the skill's `devops-use-logging` rule calls for, which the built-in logger doesn't provide out of the box.

## Files changed

New: `package.json`, `tsconfig.json`, `tsconfig.build.json`, `nest-cli.json`, `eslint.config.mjs`, `.prettierrc`, `.gitignore`, `.env.example`, `README.md`, `src/main.ts`, `src/app.module.ts`, `src/config/configuration.ts`, `src/config/env.validation.ts`, `src/config/env.validation.spec.ts`, `src/common/types/error-response.type.ts`, `src/common/filters/all-exceptions.filter.ts`, `src/health/health.controller.ts`, `src/health/health.service.ts`, `src/health/health.service.spec.ts`, `src/health/health.module.ts`, `test/jest-e2e.json`, `test/setup-env.ts`, `test/health.e2e-spec.ts`, `docs/specs/phase.md`, `docs/specs/phase-0-architecture.md`, `docs/specs/phase-1-foundation.md`.

Removed (scaffold artifacts not part of the target structure): `src/app.controller.ts`, `src/app.service.ts`, `src/app.controller.spec.ts`, `test/app.e2e-spec.ts`, `vitest.config.ts`, `vitest.config.e2e.ts`, `.oxlintrc.json`.

## Known limitations

- No database, auth, events, or RSVP functionality — by design, deferred to Phase 2+.
- `/api/v1/health` has no readiness/dependency check (no DB to check yet).
- No Swagger UI yet (Phase 1 explicitly excluded it; the versioned route structure is already in place for it).
- No Dockerfile yet (see decision #7 above).
- Directly running `node dist/main.js` on this particular developer machine is affected by an unrelated local VS Code extension (see Validation section) — does not affect CI, Docker, or any other environment without that extension installed.

## Phase 2 preparation

Phase 2 introduces:

- PostgreSQL running locally (Docker Compose, added at that point — not before, per Phase 1's explicit restriction).
- Prisma: `schema.prisma` for `User`, `Event`, `EventAttendee` per the Phase 0 database design, including the `@@unique([eventId, userId])` constraint and the indexes listed there.
- Initial migration via `prisma migrate dev`.
- `database/` module — a global `PrismaService` wrapping `PrismaClient`, wired into `AppModule`.
- Repository classes for the entities that exist by then, following the skill's repository-pattern guidance (Phase 0 §NestJS Skill Assessment) — adapted to Prisma's API rather than TypeORM's.
- A real readiness check on `/api/v1/health` (or a separate `/health/ready`) once there's a database to check.

Not starting Phase 2 until instructed.
