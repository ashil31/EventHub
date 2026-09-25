# Phase 6 — API Hardening & Production Readiness

Status: **Complete.** Hardening only — no new business features, per the phase's own explicit constraint.

## A. Implementation Summary

Phase 6 began with a full read-through audit of every area the brief listed (bootstrap, config, exception handling, logging, validation, auth, authorization, the database layer, both business modules, health, Swagger, tests, tooling) before changing anything. The audit found the foundation from Phases 1–5 already solid in almost every dimension — CORS, Helmet, validation, JWT security, Argon2 configuration, authorization, logging redaction, and the RSVP concurrency mechanism all needed confirmation, not rework. Three genuine gaps were found and fixed:

1. **No rate limiting anywhere** — added `@nestjs/throttler`, with per-user tracking on authenticated routes and a stricter, separately-configurable limit on `/auth/register`/`/auth/login`.
2. **Health check conflated liveness and readiness** — split into `GET /health` (no dependency checks) and `GET /health/ready` (checks Postgres).
3. **Error responses had no stable machine-readable identifier** — added a `code` field, derived from HTTP status.

Everything else in this document is verification and documentation of what was already correct, not new code.

## B. Files Created

- `src/common/guards/app-throttler.guard.ts` — per-user (else per-IP) throttle tracking.
- `src/common/utils/error-code.util.ts` — HTTP-status → stable `code` string mapping.
- `test/jest-throttle.json`, `test/setup-env-throttle.ts`, `test/throttle/rate-limit.spec.ts` — isolated rate-limit enforcement test, deliberately separate from the main e2e suites.
- `docs/specs/phase-6-hardening.md` — this file.

## C. Files Modified

- `src/app.module.ts` — registered `ThrottlerModule.forRootAsync` (env-driven default limit) and `AppThrottlerGuard` as a global `APP_GUARD`.
- `src/auth/auth.controller.ts` — `@Throttle()` override (stricter limit) on `register`/`login`; added `429` to their documented Swagger responses.
- `src/health/health.service.ts`, `src/health/health.controller.ts` — split `check()` into `liveness()` (no DB) and `readiness()` (DB check, unchanged logic from Phase 2/5 otherwise).
- `src/health/health.service.spec.ts`, `test/health.e2e-spec.ts` — updated for the new liveness/readiness API; added a readiness-specific test.
- `src/common/types/error-response.type.ts`, `src/common/filters/all-exceptions.filter.ts`, `src/common/filters/all-exceptions.filter.spec.ts` — added the `code` field; added a clean, generic message for `429` (the default `ThrottlerException` message otherwise embeds the exception class name).
- `src/config/env.validation.ts`, `src/config/configuration.ts`, `.env.example` — added `THROTTLE_TTL`/`THROTTLE_LIMIT`/`AUTH_THROTTLE_TTL`/`AUTH_THROTTLE_LIMIT`, all optional with defaults so existing `.env` files keep working unchanged.
- `test/setup-env.ts` — added deliberately generous throttle values so the main e2e suites (especially the RSVP concurrency tests) are never mistaken for abuse.
- `test/auth.e2e-spec.ts`, `test/rsvp.e2e-spec.ts` — closed two small coverage gaps flagged by the phase's own testing checklist (an explicit unknown-field-on-register test; an attendee-list excessive-limit test).
- `README.md` — new Health, Rate Limiting, Security, and API Errors sections; updated API table, error-shape example, dev commands, and known limitations.

## D. Dependencies

**Added:** `@nestjs/throttler@^6.7.1` — the standard NestJS rate-limiting solution, explicitly named as the preferred choice in the phase brief. Verified compatible with the pinned `@nestjs/common@^11` and confirmed CommonJS (not another ESM-only surprise, following the pattern of every prior phase's dependency additions in this project).

**Removed:** none.

**Updated:** none beyond the new addition and its transitive lockfile changes.

No Redis, no additional infrastructure — the brief was explicit that rate limiting must not require it, and `@nestjs/throttler`'s default in-memory storage is correct for this project's single-instance scale.

## E. Security Improvements

Concretely new in this phase:

- **Rate limiting** on the two most abuse-prone endpoints (credential stuffing on login, registration spam) — see F below.
- **A cleaner `429` error message** — `ThrottlerException`'s default text (`"ThrottlerException: Too Many Requests"`) embeds the internal exception class name; the filter now gives it the same curated-message treatment every other known error type already got.
- **Readiness no longer gates liveness** — before this phase, the single `/health` endpoint failing (e.g. a brief Postgres blip) would look identical to the process itself being dead to an orchestrator, which could trigger an unnecessary restart instead of just routing traffic elsewhere until Postgres recovers.

Everything else audited and **confirmed already correct**, not changed:

- JWT: secret from `ConfigService` (never hardcoded), short-lived tokens, minimal payload (`sub` only), identical generic `401` for every failure mode.
- Argon2id password hashing, OWASP-minimum configuration, `passwordHash` never returned or logged.
- Global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`) rejecting unknown fields outright.
- Ownership/identity always server-derived (`createdBy`, RSVP's user) — never accepted from a client-supplied field, because those fields don't exist on any DTO in the first place.
- CORS: environment-driven, denies all origins in production if `FRONTEND_URL` is unset (never a wildcard).
- Helmet: verified live — `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options` all present on real responses.
- Logging redaction: `Authorization`/`Cookie` headers, `Set-Cookie` response header, `password`/`passwordHash` body fields — confirmed absent from live structured log output during this phase's manual verification.
- User enumeration: identical `401` message for "no such account" and "wrong password."

## F. Rate Limiting

**Library:** `@nestjs/throttler`, in-memory storage (no Redis).

**General API default:** `THROTTLE_LIMIT` requests per `THROTTLE_TTL` seconds (100/60s by default) — applied globally via `APP_GUARD`, tracked **per authenticated user** where `request.user` is populated, falling back to per-IP for unauthenticated requests. Per-user tracking is a deliberate choice, not the library default: it's what the installed `nestjs-best-practices` skill's own rate-limiting rule recommends ("use user ID if authenticated, IP otherwise"), and it avoids the real production failure mode of IP-based limits — users behind a shared NAT/VPN sharing one bucket.

**Auth-specific limit:** `AUTH_THROTTLE_LIMIT`/`AUTH_THROTTLE_TTL` (5/60s by default), applied via `@Throttle({ default: { limit, ttl } })` on `POST /auth/register` and `POST /auth/login` specifically — always IP-tracked, since there's no authenticated identity yet at that point. These are the classic credential-stuffing and registration-spam targets, hence a stricter, separate limit.

**Why these values:** 5 attempts/minute for login matches the exact figure the installed skill's own JWT rate-limiting example uses, and is a widely-used industry default for login throttling — permissive enough that a real user who mistypes their password a couple of times is never blocked, strict enough to meaningfully slow a credential-stuffing script. 100 requests/minute as a general default is generous for normal browsing/API use while still bounding gross scraping/abuse.

**Configuration, not hardcoding:** all four values are environment-driven (`.env.example`). One necessary, narrowly-scoped exception: `@Throttle()`'s override arguments are decorator arguments, evaluated when the module is *loaded* — before Nest's DI container (and therefore `ConfigService`) exists — so they can't be read through `ConfigService` the way every other config value in this app is. `AuthController` reads `AUTH_THROTTLE_LIMIT`/`AUTH_THROTTLE_TTL` from `process.env` directly at module-load time instead, documented inline as a deliberate, framework-imposed exception to "only `configuration.ts` touches `process.env`" (Phase 1) — still fully configurable via the same environment variable, just not through the DI-based service.

**Testing without breaking the concurrency tests:** this was the trickiest part of the phase. The RSVP concurrency suite (Phase 5) fires up to 50 genuinely concurrent HTTP requests from a single test process — legitimate load that must never be mistaken for abuse, or the mandatory concurrency assertions (`test/rsvp.e2e-spec.ts`) would start failing with `429`s instead of the expected `201`/`409` mix. Rather than special-case the application code around a test environment (which would mean the throttling code path isn't the same one production runs), `test/setup-env.ts` sets deliberately generous limits (`100000` requests) — the throttler is genuinely active during the main e2e suites, just configured not to trip under realistic test volume. Real enforcement is proven separately, in complete isolation, by `test/throttle/rate-limit.spec.ts` (`npm run test:throttle`), which sets its own tiny limits (`3`) via a dedicated Jest config/setup file and confirms a 4th rapid request actually gets `429` with the correct headers (`X-RateLimit-*`, `Retry-After`) and the standard safe error shape.

**Not a correctness mechanism.** Reaffirmed explicitly per the brief: rate limiting does nothing to protect RSVP capacity or duplicate-RSVP guarantees — the transaction/row-lock/unique-constraint from Phase 5 remains the entire mechanism for that, completely independent of request volume or throttling configuration.

## G. Error Handling

Final contract (unchanged in overall shape from Phase 1/2, extended with `code`):

```json
{
  "statusCode": 400,
  "code": "BAD_REQUEST",
  "message": "Validation failed",
  "error": "Bad Request",
  "timestamp": "2026-09-24T12:00:00.000Z",
  "path": "/api/v1/example",
  "requestId": "..."
}
```

`code` is derived purely from the HTTP status (`errorCodeForStatus`, `src/common/utils/error-code.util.ts`) — a small, fixed, stable set (`BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `UNPROCESSABLE_ENTITY`, `TOO_MANY_REQUESTS`, `INTERNAL_SERVER_ERROR`, `SERVICE_UNAVAILABLE`, falling back to `ERROR` for anything else). Deliberately **not** a large per-business-error taxonomy (`EVENT_FULL`, `DUPLICATE_RSVP`, `EMAIL_TAKEN`, ...) — that would be a second classification system every new error-throwing line of code would need to stay in sync with, for a project this size not worth the ongoing cost; `message` already carries that level of detail for anything a status-derived code can't distinguish (e.g. both "event full" and "duplicate RSVP" are `409`/`CONFLICT`, distinguished by `message`).

Known Prisma errors (`P2002` → `409`, `P2025` → `404`) are translated to fixed, safe messages — never the raw Prisma error text, which can include table/column names. `429` gets the same curated treatment (E above). Anything unrecognized becomes a generic `500`/`"Internal server error"` — the real exception is still logged server-side with the same `requestId`, so it remains traceable without ever reaching the client.

## H. Health/Readiness

- **Liveness** (`GET /api/v1/health`) — "is the process alive?" No dependency checks whatsoever. An orchestrator restarts the process on liveness failure, so liveness must never fail for a reason restarting wouldn't fix.
- **Readiness** (`GET /api/v1/health/ready`) — "can this instance serve requests right now?" Pings Postgres (`SELECT 1`). An orchestrator stops routing traffic to an instance that fails readiness, without killing it — the correct response to a transient database blip is "wait and retry," not "restart the app," which is exactly what conflating the two checks (Phase 1–5's single `/health`) would have caused.

Both endpoints stay cheap: liveness is pure in-memory (name/environment/uptime), readiness's single `SELECT 1` is the least expensive query that still proves the connection pool can reach Postgres.

## I. Database Review

**Indexes:** re-reviewed against every query pattern introduced through Phase 5 — `events.createdBy`, `events.startsAt`, `event_attendees.userId`, plus the unique indexes on `users.email` and `event_attendees(eventId, userId)`. All remain sufficient; Phase 6 introduced no new query patterns (it's hardening, not new features), so **no new indexes or migrations were needed**. Search (`contains` across three text columns) still does a sequential scan — an accepted, previously-documented trade-off (Phase 4 ADR-017), not a regression.

**Query improvements:** none needed — explicit field selection, `_count` relation-counting (no N+1), and real database-level pagination were all already in place from Phases 4–5 and were re-confirmed correct during this phase's audit, not changed.

**Prisma error handling:** unchanged and reconfirmed — `P2002`/`P2025` mapped generically in the global filter (Phase 2), with the friendlier duplicate-email/duplicate-RSVP-specific messages still handled in their respective services (Phase 3/5).

**Migration changes:** none. No schema changes this phase.

## J. RSVP Correctness

The Phase 5 mechanism is **unchanged** — this phase deliberately touched none of `RsvpService`, `RsvpRepository`, or the transaction/lock code in `EventsRepository.findByIdForUpdate`. `attendees <= capacity` under concurrency continues to hold for the same reason it did after Phase 5: every RSVP is decided inside a single PostgreSQL transaction that locks the event row (`SELECT ... FOR UPDATE`) before counting attendees and inserting, so no two concurrent transactions for the same event can ever both observe "capacity not yet reached" and both insert — the second one blocks on the lock until the first commits, then re-reads genuinely current state. `UNIQUE(eventId, userId)` remains the database-level backstop against duplicates regardless of application logic.

This was **re-verified, not just asserted**, as the explicit regression check the phase brief required: the full `test/rsvp.e2e-spec.ts` suite (including all five concurrency scenarios — capacity=1/20 users, capacity=10/50 users, same-user duplicate race, cross-user duplicate race, capacity-update race) was re-run after every hardening change in this phase, specifically checking that the newly-added rate limiter doesn't interfere (see F above for how that's avoided by construction, not just by lucky test timing).

## K. Testing

```
Unit tests (npm test, no database):                59 tests, 7 suites
E2E tests (npm run test:e2e, real Postgres):        79 tests, 4 suites
  - health.e2e-spec.ts   (liveness/readiness split, standard error shape)
  - auth.e2e-spec.ts     (+ new: unknown-field-on-register rejection)
  - events.e2e-spec.ts   (unchanged from Phase 4)
  - rsvp.e2e-spec.ts     (+ new: attendee-list excessive-limit rejection;
                           all 5 concurrency scenarios re-verified)
Database tests (npm run test:db, real Postgres):    13 tests, 2 suites (unchanged from Phase 2)
Rate-limit tests (npm run test:throttle, real Postgres, isolated tiny limits):
                                                     3 tests, 1 suite (new)
```

**Security tests:** `all-exceptions.filter.spec.ts` asserts no internal detail (stack traces, DB connection info, Prisma internals, the raw `ThrottlerException` text) ever reaches a response body, across every known error path; `health.service.spec.ts` asserts `DATABASE_URL`/`JWT_SECRET` never appear in a liveness response; every auth/events/rsvp e2e suite has explicit `passwordHash`-absence assertions on every response type that includes user data.

**Rate-limit enforcement:** proven directly — 3 configured attempts succeed (business-logic status, e.g. `401` for bad credentials), the 4th gets `429` with correct `X-RateLimit-*`/`Retry-After` headers and the standard safe error shape (verified both in the automated `test:throttle` suite and manually, live, against a running instance with `AUTH_THROTTLE_LIMIT=3`).

**Concurrency (regression):** all five RSVP concurrency scenarios from Phase 5 re-run and re-verified with zero result changes.

## L. Build/Lint Results

```
npm run build            →  pass
npm run lint               →  pass (0 problems, no eslint-disable added beyond
                                the pre-existing, documented Jest-mock-assertion
                                exceptions from earlier phases)
npm run format:check       →  pass
npm test                   →  pass — 59/59
npm run test:e2e           →  pass — 79/79
npm run test:db            →  pass — 13/13
npm run test:throttle      →  pass — 3/3
npx prisma validate        →  "The schema at prisma/schema.prisma is valid"
```

No `@ts-ignore`, `@ts-expect-error`, or new `eslint-disable` was added this phase. No compiler or lint configuration was weakened.

Manual verification against a running instance: `GET /health` (200, no DB touched), `GET /health/ready` (200, `database: "up"`), `/api/docs-json` inspected directly (health paths present, `429` documented on register/login), live rate-limit headers observed exactly as designed with a tightened `AUTH_THROTTLE_LIMIT=3`, Helmet headers confirmed present on a live response.

## M. NestJS Concepts Learned

- **`APP_GUARD` with a custom guard subclass** — `AppThrottlerGuard extends ThrottlerGuard`, registered via the `APP_GUARD` DI token (the same mechanism `AllExceptionsFilter` already used as `APP_FILTER` since Phase 1) applies it to every route in the app without any controller needing `@UseGuards()` for it. Overriding just `getTracker()` customizes *how* requests are grouped for rate-limiting (per-user vs per-IP) while reusing every other piece of the library's behavior unchanged — a good example of extending a framework class for one specific, narrow reason rather than reimplementing it. Express equivalent: a piece of middleware wrapping a rate-limiting library (e.g. `express-rate-limit`) with a custom `keyGenerator` function — conceptually the same idea, but Nest's guard is DI-aware and declaratively scoped (global here, but could be controller- or route-scoped identically elsewhere) rather than manually wired into a middleware chain.
- **`@Throttle()` as a decorator-level override** — demonstrates a real constraint of decorator-based configuration in Nest: decorators execute at class-definition/module-load time, *before* the DI container exists, so a decorator argument cannot pull a value from an injected `ConfigService` the way a constructor or a `forRootAsync` factory can. This phase's `AuthController` throttle override is a concrete, documented example of where that boundary actually falls and how to work within it (reading `process.env` directly, narrowly, with the reasoning written down) rather than fighting the framework.
- **Liveness vs. readiness as two different guard contracts** — not a NestJS-specific concept, but implementing it *in* Nest is a good illustration of "the framework doesn't decide your architecture for you": two near-identical-looking `GET` handlers, but one must be allowed to succeed even when the other legitimately fails, because they answer different orchestration questions (`restart me?` vs `route traffic to me?`).

## N. Skill Compliance

The installed `nestjs-best-practices` skill's `security-rate-limiting` rule was directly followed — endpoint-specific stricter limits for authentication routes, and per-user (not just per-IP) tracking for authenticated routes, both explicitly recommended there and both implemented exactly that way. `error-use-exception-filters` and `error-throw-http-exceptions` (already followed since Phase 1/2/3) remain satisfied — the `code` field addition extended the existing single global filter rather than introducing a second error-handling pattern. `devops-use-config-module` is satisfied for every new configuration value except the one documented, framework-imposed decorator exception (F above). No architectural rule was violated to fit any Phase 6 change in; nothing required deviating from the skill this phase.

## O. Remaining Risks

- **In-memory rate-limit storage** means limits reset on every process restart and aren't shared across instances — correct for this project's current single-instance scope, would need a shared store (still not necessarily Redis — Postgres itself could serve this at low volume) if horizontally scaled.
- **No account lockout** beyond the request-rate throttle — a sufficiently patient, distributed attacker (many IPs, well under the per-IP threshold on each) could still attempt credential stuffing slowly. Full account-lockout policy was explicitly out of scope for this phase and this assignment.
- **Search remains an unindexed sequential scan** (Phase 4's accepted trade-off) — still fine at this project's expected scale, still the thing to revisit first if the dataset or query volume grows substantially.
- **No refresh-token/session-revocation mechanism** (Phase 3's ADR-004, unchanged) — a still-valid JWT cannot be invalidated before its natural expiry.

None of these are regressions introduced by this phase — they're pre-existing, previously-documented, and still accurately described.

## Architecture Decisions (ADR-021 – ADR-023)

**ADR-021 — API Rate Limiting**
Decision: `@nestjs/throttler`, global default via `APP_GUARD` with per-user (else per-IP) tracking, a stricter separately-configured override on `/auth/register`/`/auth/login`, all limits environment-driven.
Reason: protects against credential stuffing, registration spam, and gross API abuse, without requiring any new infrastructure (in-memory storage is correct at this project's single-instance scale) and without affecting the correctness guarantees Phase 5 already established for RSVP.
Trade-off: in-memory storage doesn't share state across multiple instances (Remaining Risks above); the auth-specific override values must be read from `process.env` directly rather than through `ConfigService`, a narrow exception forced by how Nest evaluates decorator arguments, documented inline.

**ADR-022 — Error Response `code` Field, Status-Derived**
Decision: add a `code` field to the existing error-response contract, computed purely from HTTP status via a small fixed mapping — not a bespoke per-business-error enum.
Reason: gives API consumers a stable, machine-readable value to branch on without string-matching `message`, at effectively zero ongoing maintenance cost (a fixed ~9-entry table, not something every new thrown exception needs to remember to extend).
Trade-off: coarser-grained than a full business-error taxonomy would be — two different business conflicts (event full vs. duplicate RSVP) share the same `CONFLICT` code and are only distinguished by `message`. Accepted as the right trade-off for this project's size; a larger API might eventually want per-error codes, at the cost of maintaining them.

**ADR-023 — Liveness vs. Readiness Health Checks**
Decision: split the single Phase 1–5 `/health` endpoint into `/health` (liveness, no dependency checks) and `/health/ready` (readiness, checks Postgres).
Reason: conflating the two meant a transient, self-recovering database blip looked identical — to an orchestrator — to the process itself being dead, which could trigger an unnecessary restart instead of the orchestrator simply routing traffic elsewhere until Postgres recovers. This is standard Kubernetes/container-orchestration practice, directly applicable to a target deployment platform like Railway.
Trade-off: one more endpoint to document and keep correct; negligible against the correctness benefit for a networked service with an external dependency.

## P. Phase 7 Preparation

This phase was explicitly the last one the assignment's brief defines — there is no Phase 7 scoped in this project's instructions. The repository is now ready for whatever comes next to actually be a *deployment* concern rather than a feature or hardening one: a production Dockerfile (deliberately deferred since Phase 1), CI/CD, and platform-specific configuration (Railway, or otherwise) are the natural next steps, none of which were in scope for this phase per its own explicit restrictions. The application itself — auth, Events, RSVP, rate limiting, health checks, structured logging, and a consistent error contract — is feature-complete and hardened as specified.
