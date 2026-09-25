# Phase 3 — Authentication & Authorization Foundation

Status: **Complete.** Scope restricted to auth — no Event CRUD, RSVP, or ownership enforcement (Phase 4+).

## 1. What was implemented

1. `users/` module: `UsersRepository` (the only place the `users` table is queried), safe response DTOs.
2. `auth/` module: registration, login, JWT issuance, `JwtStrategy`, `JwtAuthGuard`, `@CurrentUser()`, DTOs.
3. Argon2id password hashing with an explicit, documented OWASP-based configuration.
4. `GET /api/v1/auth/me`, protected by JWT.
5. Duplicate-email → `409`, invalid credentials → generic `401` (no user enumeration).
6. Swagger/OpenAPI at `/api/docs`, with a bearer-token security scheme wired into `/auth/me`.
7. 24 unit tests, 19 new e2e tests (real HTTP + real Postgres) covering registration, login, protected-route access (missing/malformed/tampered/expired tokens), and the full register→login→me lifecycle.

## 2. Current folder structure

```
src/
├── users/
│   ├── dto/
│   │   ├── user-summary.dto.ts
│   │   └── user-response.dto.ts
│   ├── users.repository.ts
│   └── users.module.ts
├── auth/
│   ├── dto/
│   │   ├── register.dto.ts
│   │   ├── login.dto.ts
│   │   └── login-response.dto.ts
│   ├── guards/
│   │   └── jwt-auth.guard.ts
│   ├── strategies/
│   │   ├── jwt.strategy.ts
│   │   └── jwt.strategy.spec.ts
│   ├── decorators/
│   │   └── current-user.decorator.ts
│   ├── types/
│   │   ├── authenticated-user.type.ts
│   │   └── jwt-payload.type.ts
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── auth.service.spec.ts
│   └── auth.module.ts
├── database/ (Phase 2)
├── config/ (Phase 1)
├── common/ (Phase 1/2)
├── health/ (Phase 1/2)
├── app.module.ts
└── main.ts

test/
├── auth.e2e-spec.ts
├── health.e2e-spec.ts
└── database/ (Phase 2)
```

## 3. Authentication architecture

```
Client
  ↓
POST /api/v1/auth/register  →  AuthController → RegisterDto validation → AuthService
                                                                             ↓
                                                            normalize email, Argon2 hash
                                                                             ↓
                                                          UsersRepository.create → Prisma
                                                                             ↓
                                                          safe UserResponseDto (no hash)

POST /api/v1/auth/login     →  AuthController → LoginDto validation → AuthService
                                                                             ↓
                                                     UsersRepository.findByEmail → Prisma
                                                                             ↓
                                                    argon2.verify → JwtService.sign({sub})
                                                                             ↓
                                                    { accessToken, tokenType, expiresIn, user }

GET /api/v1/auth/me         →  JwtAuthGuard → JwtStrategy.validate(payload)
                                                    ↓
                                    UsersRepository.findById(payload.sub) → Prisma
                                                    ↓
                                    request.user = AuthenticatedUser → @CurrentUser()
```

Controllers stay thin (routing + delegation only); `AuthService` holds all business logic; `UsersRepository` is the only database boundary. No controller or service touches Prisma directly, and none of the query logic is duplicated across the two entry points (registration and login both go through the same repository's `normalizeEmail`).

## 4. Registration flow

1. `RegisterDto` validates `name` (non-empty, ≤100 chars), `email` (valid format), `password` (8–128 chars); `@Transform` trims `name` and trims+lowercases `email` before validation runs.
2. `AuthService.register` hashes the password with Argon2id, then calls `UsersRepository.create` (which normalizes the email again, defensively — the repository is the single source of truth for that invariant regardless of caller).
3. If Postgres reports the unique-email constraint violation (`P2002`), it's caught and converted to `ConflictException('Email already registered')` — never a raw Prisma error.
4. Returns `UserResponseDto` (`id`, `name`, `email`, `createdAt`) — `passwordHash` is never read off the created row into the response in the first place, so there's no serialization step that could leak it by omission.

**Decision (ADR-012): registration does not return a token.** See the ADR section below.

## 5. Login flow

1. `LoginDto` validates shape; email is trimmed/lowercased the same way as registration.
2. `AuthService.login` looks up the user by (normalized) email. If not found, throws the generic `UnauthorizedException('Invalid email or password.')` — no distinction from a wrong-password failure.
3. If found, `argon2.verify(user.passwordHash, dto.password)` — on failure, the identical exception, identical message, is thrown. Both branches produce the same status code and body; an attacker cannot distinguish "no such account" from "wrong password" from the response alone.
4. On success, signs `{ sub: user.id }` via `JwtService`, returns `{ accessToken, tokenType: 'Bearer', expiresIn, user: UserResponseDto }`.

## 6. JWT architecture

- **Payload:** `{ sub: userId }` only — the exact shape specified. No email, no roles, no anything that could go stale between issuance and use.
- **Signing:** `JwtModule.registerAsync`, secret and expiry pulled from `ConfigService` (`jwt.secret` / `jwt.expiresIn`, the Phase 1 config contract — `getOrThrow` used here since these are load-bearing and env validation already guarantees they exist).
- **Verification:** `JwtStrategy` (passport-jwt), bearer-token extraction, signature + expiry check, then a database lookup (see §8).
- **No refresh tokens** — explicitly out of scope for this phase (and already an accepted trade-off from Phase 0's ADR-004).

## 7. Password hashing

Argon2id via the `argon2` package, with an explicit configuration rather than accepting whatever the library's default happens to be:

```ts
{ type: argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }
```

This is OWASP's Password Storage Cheat Sheet minimum recommendation for Argon2id (≈19 MiB memory, 2 iterations, 1 degree of parallelism) — deliberately not maximized. A normal web request/response cycle has a latency budget; maximizing memory/time cost would make every login noticeably slower for marginal additional security at this project's threat model, which is explicitly what Phase 3 warned against ("do not blindly maximize"). Verified in tests: the stored hash is never equal to the plaintext password, always begins with `$argon2id$`, and `argon2.verify` round-trips correctly.

## 8. JWT strategy

`JwtStrategy.validate(payload)` calls `UsersRepository.findById(payload.sub)` and returns `{ id, name, email }`, throwing `UnauthorizedException` if the user no longer exists.

**Chosen: Option B — load the current user on every request, not just validate JWT identity (Option A).** This directly follows the installed `nestjs-best-practices` skill's own `security-auth-jwt` example, which validates the user still exists on every request. The reasoning, specific to this project: there is no refresh-token or session-revocation mechanism (ADR-004) — if the strategy trusted the JWT payload alone, deleting a user's account would have **zero effect** on their existing token until it naturally expired. The database check is what actually closes that gap: a JWT for a deleted account stops authenticating immediately. It also means `/auth/me` gets the current name/email for free, with no second query in the controller. The cost — one extra indexed lookup per authenticated request — is negligible at this project's scale and is the trade-off explicitly called out as acceptable in the code's own comments.

## 9. JWT guard

`JwtAuthGuard extends AuthGuard('jwt')`, applied per-route with `@UseGuards(JwtAuthGuard)` on `/auth/me`. Overrides `handleRequest` so that **every** failure path (missing token, malformed token, invalid signature, expired token) collapses to the same generic `UnauthorizedException()` — passport-jwt's specific internal error (`TokenExpiredError`, `JsonWebTokenError`, etc.) never reaches the response body. Verified directly in e2e tests: no token, a garbage string, a tampered valid-looking token, and a token signed with `expiresIn: '-10s'` (immediately expired) all produce an identical `401` shape.

**Decision (ADR-013): no global guard yet.** See the ADR section below.

## 10. Current user decorator

`@CurrentUser()` is a `createParamDecorator` that reads `request.user` (populated by `JwtAuthGuard` → `JwtStrategy`) and returns it typed as `AuthenticatedUser` — no `any`, no manual casting in every controller that needs it. `AuthController.me` is a one-liner: `me(@CurrentUser() user: AuthenticatedUser) { return user; }`.

## 11. Authorization foundation

`AuthenticatedUser` (`{ id, name, email }`) is deliberately minimal — just what's needed for identity and, later, ownership checks. The future Events module will do:

```ts
@Patch(':id')
@UseGuards(JwtAuthGuard)
update(@CurrentUser() currentUser: AuthenticatedUser, @Param('id') id: string, ...) {
  const event = await this.eventsService.findById(id);
  if (event.createdBy !== currentUser.id) throw new ForbiddenException();
  ...
}
```

— without importing anything from `auth/strategies` or `auth/guards`, without knowing what a JWT is, and without an extra database call (the id is already on hand). No ownership guard exists yet, per this phase's explicit restriction; this is the shape it will plug into.

## 12. API endpoints

| Method | Path | Auth | Success | Failure |
|---|---|---|---|---|
| POST | `/api/v1/auth/register` | Public | `201` + `UserResponseDto` | `400` validation, `409` duplicate email |
| POST | `/api/v1/auth/login` | Public | `200` + `LoginResponseDto` | `400` validation, `401` invalid credentials |
| GET | `/api/v1/auth/me` | Bearer JWT | `200` + `{ id, name, email }` | `401` |

## 13. Security considerations

- **Password storage:** Argon2id only, never logged, never returned (checked explicitly in both unit and e2e tests — `expect(result).not.toHaveProperty('passwordHash')` and `expect(result).not.toHaveProperty('password')`).
- **JWT:** signed with `JWT_SECRET` from the validated Phase 1 config contract; never logged (see below); returned only in the login response body, nowhere else.
- **Secrets:** `JWT_SECRET` never hardcoded, never committed (`.env` is gitignored, unchanged from Phase 1), never appears in any log line.
- **User enumeration:** identical exception, identical message, identical status code for "no such account" and "wrong password." Verified in both `auth.service.spec.ts` and `auth.e2e-spec.ts`.
- **Error handling:** the JWT guard's `handleRequest` override guarantees passport-jwt's internal error details never reach a response; the global exception filter (Phase 1/2) already guarantees no stack traces or Prisma internals reach a response, and now the Prisma-error mapping added in Phase 2 (`P2002` → `409`) is what `AuthService.register` relies on for the duplicate-email path.
- **Timing:** not specifically equalized (e.g. a lookup miss returns slightly faster than a lookup + failed Argon2 verify). Not addressed in this phase, consistent with the instruction not to build a complex anti-timing system; the response content itself reveals nothing, which is the primary enumeration vector this phase targeted.
- **Logging:** reviewed explicitly (§ below) — passwords, hashes, JWTs, and the `Authorization` header are all confirmed absent from every log line, including in the e2e run's captured pino output.
- **Brute force / rate limiting:** not implemented (out of scope, per Phase 3's own restriction). `POST /api/v1/auth/login` and `POST /api/v1/auth/register` are flagged here as the endpoints that need it — a future phase should apply `@nestjs/throttler` (already scoped in Phase 0's security model) with stricter limits specifically on these two routes.
- **CORS:** unchanged from Phase 1 — no modification was needed or made.

## 14. Swagger

`DocumentBuilder` in `main.ts` registers a `bearer`/`JWT` security scheme named `access-token`; `SwaggerModule.setup('api/docs', ...)` mounts the UI at a fixed path independent of API versioning. `AuthController.me` carries `@ApiBearerAuth('access-token')`, which makes Swagger UI's "Authorize" button accept a token and attach it to `/auth/me` test requests. Verified directly by fetching `/api/docs-json` and inspecting the generated OpenAPI document: all three auth paths present, the `access-token` bearer scheme registered under `components.securitySchemes`, `/auth/me`'s `security` array referencing it, and accurate per-endpoint response codes (`register`: 201/400/409, `login`: 200/400/401). DTOs carry only the `@ApiProperty()` decorators needed to document the field — no extra Swagger metadata beyond that.

## 15. Tests

**Unit (`src/auth/`, no database):**
- `auth.service.spec.ts` — password is hashed (never plaintext, Argon2-verifiable), passwordHash never in the response, `P2002` → `ConflictException`, unrelated DB errors rethrown unchanged, JWT signed with the correct `sub`, both login-failure paths produce the identical generic message and the same exception type.
- `jwt.strategy.spec.ts` — returns the minimal safe shape when the subject exists, rejects with `401` when it doesn't (covers the ADR-011 mechanism directly).

**E2E (`test/auth.e2e-spec.ts`, real Postgres):** registration (success, email normalization, Argon2 hash verified directly against the stored row, duplicate → `409`, missing name/invalid email/missing password/short password → `400`), login (success with JWT `sub` verified via `jwtService.decode`, email normalization, wrong password → `401`, unknown email → `401`, invalid input → `400`), protected route (no token / malformed token / tampered token / expired token all → `401`; valid token → `200` with no `passwordHash`), and a dedicated full-lifecycle test (register → login → me → unauthenticated me → `401`). Every test user is tagged under a dedicated email domain and deleted in `afterAll` — verified directly (zero rows remain in Postgres after a full suite run).

## 16. Dependencies

- **`@nestjs/jwt`** — JWT signing/verification integrated with Nest's DI (`ConfigService`-driven secret/expiry).
- **`@nestjs/passport` + `passport` + `passport-jwt`** (+ `@types/passport-jwt`) — the standard NestJS strategy/guard pattern for bearer-token auth; not a heavier auth framework, just the JWT strategy.
- **`@nestjs/swagger`** — OpenAPI generation from existing decorators/DTOs; no separate documentation to hand-maintain.
- **`argon2`** — already added in Phase 2 for the seed script; now used for real in the auth flow.

No OAuth library, no session library, no Redis — none were needed or requested.

**Version note (verified empirically, not assumed):** `npm install`'s resolved `latest` versions of `@nestjs/jwt` (12.x) and `@nestjs/passport` (12.x) are **ESM-only** (`"type": "module"`, no CommonJS build) — the same class of problem Phase 1 hit with NestJS 12 itself. Confirmed by reproducing the failure (`Jest encountered... SyntaxError: Cannot use import statement outside a module`) before fixing it. Pinned both to their latest **11.x** releases (`@nestjs/jwt@^11.0.2`, `@nestjs/passport@^11.0.5`), which are CommonJS and peer-compatible with the project's pinned `@nestjs/common@^11`. `@nestjs/swagger@^11.4.7` was checked and pinned to the matching 11.x line from the start.

## 17. NestJS concepts learned

- **Module** — `AuthModule` imports `UsersModule` (for `UsersRepository`), `PassportModule`, and an async-configured `JwtModule`; declares `AuthController` and provides `AuthService` + `JwtStrategy`. It composes everything auth-related into one unit the rest of the app just imports.
- **Provider** — `AuthService` is `@Injectable()`; Nest's DI container constructs it with `UsersRepository`, `JwtService`, and `ConfigService` already resolved, based purely on constructor parameter types. Express equivalent: manually `require`-ing and wiring each of those into whatever function handles the route — Nest does that wiring for you and makes swapping any of them for a test double trivial.
- **Guard** — `JwtAuthGuard` runs before the route handler and decides whether the request proceeds; it delegates the actual verification to the registered Passport strategy and only handles the pass/fail decision (`handleRequest`). Express equivalent: a piece of middleware that checks `req.headers.authorization` and either calls `next()` or sends a 401 — except a Nest guard is scoped per-route/per-controller declaratively (`@UseGuards(...)`) rather than wired into the middleware chain globally.
- **Strategy** — `JwtStrategy` is a Passport concept Nest wraps: given a request, it knows how to extract a credential (the bearer token), verify it, and produce a `validate()` result that becomes `request.user`. It's the actual authentication logic; the guard is just the on/off switch that invokes it.
- **Decorator** — `@CurrentUser()` is a custom parameter decorator (`createParamDecorator`) that pulls a specific piece of data (`request.user`) out of the execution context and hands it to the controller method as a typed argument, the same mechanical category as Nest's built-in `@Body()`/`@Param()`.
- **Dependency Injection** — every class above lists its dependencies as constructor parameters with types; Nest resolves the whole graph (`AuthService` needs `UsersRepository`, which needs `PrismaService`, which needs `ConfigService`, all the way down) automatically at module-compile time, and the same graph resolution is what lets `Test.createTestingModule` swap in mocks for unit tests without touching the class under test.
- **DTO** — `RegisterDto`/`LoginDto` are plain classes with `class-validator` decorators; the global `ValidationPipe` (Phase 1) instantiates and validates the incoming JSON body against them automatically, rejecting anything invalid with a `400` before the controller method ever runs. `@Transform` normalizes (`trim`/`lowercase`) before validation checks run.
- **Express comparison, overall:** where Express hands you a single `(req, res, next)` per route and expects you to assemble validation, auth, and business logic by hand (or via ad-hoc middleware chains), Nest decomposes the same request lifecycle into named, independently testable, DI-managed stages — Middleware → Guard → Pipe → Controller → Provider — each with a single job, wired together declaratively instead of imperatively.

## 18. Validation

```
npm run build            →  pass
npm run lint              →  pass (0 problems)
npm run format:check      →  pass
npm test                  →  pass (24 tests, 5 suites — no database required)
npm run test:e2e          →  pass (21 tests, 2 suites — against real Postgres)
```

Manual verification performed end to end against the running app (not just tests):
- `npx prisma generate` — succeeds, no schema changes this phase.
- App startup with real config — succeeds (`Nest application successfully started`, Prisma connected).
- `POST /auth/register` → `201`, safe user shape.
- Immediate duplicate `POST /auth/register` with the same email → `409`.
- `POST /auth/login` → `200`, real `accessToken`/`tokenType`/`expiresIn`/`user`.
- `GET /auth/me` with the token → `200`, `{ id, name, email }`.
- `GET /auth/me` with no token → `401`, standard error shape.
- `GET /api/docs-json` fetched and inspected directly: all three auth paths present, `access-token` bearer scheme registered, `/auth/me` requires it, response codes match what's documented above.
- Manual test data cleaned up afterward.

## 19. Skill compliance

Followed: constructor injection throughout (no property injection anywhere in `auth/` or `users/`), guards for access control instead of manual `if` checks in controllers, DTOs + global `ValidationPipe` for all input, services throwing `HttpException` subclasses directly (`ConflictException`, `UnauthorizedException`) rather than returning error objects for controllers to interpret, the database boundary (`UsersRepository`) kept as the only place `PrismaClient` is queried, and — directly — the `security-auth-jwt` rule's own pattern of validating the user still exists on every authenticated request (§8/ADR-011).

Intentional deviations: the `@nestjs/jwt`/`@nestjs/passport` ESM-vs-CommonJS version pin (§16, same root cause as Phase 1's NestJS 12 deviation, not a new pattern); and no global `APP_GUARD` yet (ADR-013) — a per-route guard is simpler and equally correct with exactly one protected route, and a global-guard-plus-`@Public()`-decorator pattern (the skill's own example) will be worth introducing once Events adds several protected routes in Phase 4.

## Architecture Decisions (ADR-011 – ADR-013)

**ADR-011 — Load the full user on every authenticated request**
Decision: `JwtStrategy.validate()` queries `UsersRepository.findById(payload.sub)` and returns `{ id, name, email }`, rather than trusting the JWT payload's claims alone.
Reason: this app has no refresh-token or revocation mechanism (ADR-004) — a payload-only strategy would mean a deleted user's token keeps authenticating until natural expiry. The database check closes that gap and matches the installed skill's own JWT example.
Trade-off: one extra indexed database lookup per authenticated request. Negligible at this project's scale; the alternative (payload-only, Option A) would be faster but strictly less correct given the lack of any other revocation path.

**ADR-012 — Registration does not auto-login**
Decision: `POST /auth/register` returns the created user; it does not issue a JWT.
Reason: keeps "an account exists" and "a session exists" as two separate, independently reasoned-about concerns — simpler to test, simpler to extend later (e.g. an email-verification gate would slot in between register and first login without restructuring the response contract), and matches ordinary REST semantics (a `POST /users`-shaped endpoint returns the created resource, not an unrelated credential).
Trade-off: one extra client-side request (register, then login) to reach an authenticated state — a standard, well-understood pattern, not a meaningful UX cost.

**ADR-013 — Per-route guard, not a global one, for now**
Decision: `JwtAuthGuard` is applied with `@UseGuards(JwtAuthGuard)` directly on `/auth/me`, rather than registered globally via `APP_GUARD` with a `@Public()` opt-out decorator (the pattern the installed skill's `security-use-guards` rule demonstrates).
Reason: with exactly one protected route in the entire application, a global guard plus an opt-out decorator on every other route is more machinery than the current surface area justifies.
Trade-off: this will need to change in Phase 4, once Events adds several protected routes (create/update/delete) alongside public ones (list/get) — at that point the global-guard-plus-`@Public()` pattern becomes the better trade-off, and is already the documented target (Phase 0 §Architecture: "enforced once, globally, at the guard layer").

## 20. Known limitations

- No refresh tokens or session revocation (ADR-004, reaffirmed here) — a still-valid user's token cannot be invalidated before it expires.
- No rate limiting on `/auth/login`/`/auth/register` yet — explicitly flagged for a future phase (§13).
- No timing-attack mitigation beyond identical response content for both login-failure branches.
- No email verification, password reset, or account-deletion flow — not requested for this phase.
- `npm run test:e2e` requires a running local Postgres, same as Phase 2.

## 21. Phase 4 preparation

Phase 4 introduces:

- An `events/` module: `EventsController`, `EventsService`, `EventsRepository` (following the same boundary pattern `UsersRepository` established).
- Event DTOs (`CreateEventDto`, `UpdateEventDto`) with the validation rules scoped in Phase 0 (`startsAt < endsAt`, positive capacity at the DTO level as a second layer on top of the Phase 2 database `CHECK` constraint).
- Full Event CRUD: create (authenticated), list (public), get (public), update/delete (authenticated + ownership).
- Event ownership authorization, built directly on this phase's `@CurrentUser()` foundation — `event.createdBy === currentUser.id`, checked in `EventsService`, not in a generic guard (per Phase 0's architecture: ownership needs the resource loaded first).
- Pagination and filtering for the event list endpoint.
- Event API tests (unit + e2e), plus Swagger documentation for the new endpoints.

Not starting Phase 4 until instructed.
