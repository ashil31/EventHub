# Phase 3 — Authentication & Session Architecture

Status: **Complete.** Full auth flow end-to-end (register, login, current user, persistence, protected routes, logout), verified both with automated tests and manually in a real browser against the real local backend. No event functionality — that's a later phase.

## A. Authentication Architecture

```text
LoginForm / RegisterForm  (features/auth/components)
  → React Hook Form (field state, submit handling)
      → Zod (loginSchema / registerSchema — mirror the backend DTOs field-for-field)
          → useLogin() / useRegister()  (features/auth/queries/hooks.ts, TanStack Mutation)
              → authApi.login / authApi.register  (features/auth/api/auth-api.ts — unchanged since Phase 2)
                  → apiClient  (lib/api/api-client.ts — unchanged since Phase 1/2)
                      → auth-token.ts (attaches Authorization: Bearer <token> automatically)
                          → NestJS (POST /api/v1/auth/login | /register)
```

Every layer here already existed from Phase 1/2 except the top two (forms + this phase's two mutation-side-effect additions to `useLogin`/`useRegister`, actually finished in Phase 2) and the components. Phase 3 added the UI and the session-management pieces around it — no new HTTP-layer code was needed.

## B. Current User Architecture

```text
useAuth()  (features/auth/queries/hooks.ts — new this phase)
  → useCurrentUser()  (existed since Phase 2)
      → authQueries.me()  (queryOptions, staleTime 5 min)
          → authApi.getCurrentUser()
              → GET /api/v1/auth/me
```

`useAuth()` is the one addition here — it turns `useCurrentUser()`'s raw query state into the three states every auth-aware component actually needs (`user`, `isAuthenticated`, `isLoading`), and gets the "disabled query reports `pending` forever" distinction right (§ C).

## C. Route Protection

Two boundary components, both composed directly into the router table (`app/router/router.tsx`), never checked ad hoc inside a page:

- **`RequireAuth`** (`features/auth/components/require-auth.tsx`) — wraps `/dashboard`. Checks `isLoading` _before_ `isAuthenticated`: a token from a previous session may still be valid but not yet confirmed, so an immediate "not authenticated" read would incorrectly bounce every hard refresh to `/login` before `GET /auth/me` has even responded. Order: loading → spinner; not authenticated → `<Navigate to="/login" state={{ from: location }} replace />`; authenticated → `<Outlet />`.
- **`RedirectIfAuthenticated`** (`features/auth/components/redirect-if-authenticated.tsx`) — wraps `/login` and `/register`. Same `isLoading`-first ordering, so an already-authenticated visitor doesn't see the login form flash before being redirected to `/dashboard`.

`useAuth()`'s `isLoading` semantics are what make both of these correct without any extra bookkeeping in the boundary components themselves — see § B and § L problem #1.

## D. Credential Storage

- **Where**: `localStorage`, behind exactly one module — `lib/api/auth-token.ts` (created in Phase 2, unchanged this phase; the Phase 3 brief's suggested `features/auth/lib/auth-storage.ts` location was deliberately not duplicated — see § L problem #2 for why).
- **Why**: the backend has no cookie-based session and no `/auth/refresh` endpoint (re-confirmed this phase directly from `auth.controller.ts` and `auth.service.ts` — `LoginResponseDto` returns only `accessToken` + `expiresIn` in the JSON body). Memory-only storage would silently log the user out on every page reload with no way to recover, which is materially worse UX for a token with a real, if short, lifetime (`JWT_EXPIRES_IN`).
- **Security tradeoff, stated plainly**: `localStorage` is **not** secure against XSS — any script that runs in this page's origin can read the token. This is accepted, not hidden, and mitigated by: React's default JSX escaping (no `dangerouslySetInnerHTML` anywhere in this codebase — grepped, confirmed), the backend's `helmet()` CSP, and the token's own short lifetime bounding the exposure window. The backend's current contract (no cookie support) rules out the httpOnly-cookie alternative without a coordinated backend change, which § 7 of the brief explicitly says not to make just to get a different frontend answer.
- **How attached to requests**: `apiClient`'s `request()` function (`lib/api/api-client.ts`, unchanged since Phase 2) calls `getAuthToken()` on every call and sets `Authorization: Bearer <token>` only when one exists. No feature code, form, or hook ever constructs this header itself — confirmed by this phase's grep sweep (§ 50): zero matches for a hand-built `Authorization` header outside `api-client.ts`.

## E. 401 Handling

Two layers, both landing in the same place:

1. **The `auth.me` query itself 401s** (an expired/invalid stored token, checked at boot or on window-focus refetch) — TanStack Query's own error state does the work: `isSuccess` becomes `false`, `useAuth()` reports `isAuthenticated: false`, `RequireAuth` redirects. No special-casing needed.
2. **Some _other_ request 401s** (a future protected mutation, made with a token that expired mid-session) — `features/auth/lib/install-auth-error-handling.ts` (new this phase) subscribes once to the `QueryClient`'s query cache and mutation cache (via `getQueryCache().subscribe()`/`getMutationCache().subscribe()` — not a `useEffect`, this runs once at module load, exactly like the `QueryClient` singleton itself) and, on any settled error with `status === 401`, calls `clearAuthToken()` and evicts the `auth.me` cache entry. Wired up once, in `app-providers.tsx`, at module scope.

Neither path retries automatically — the `QueryClient`'s global retry policy (Phase 1) already skips every 4xx, so a 401 settles immediately and this reaction only ever runs against an already-final error. No refresh-token logic exists, because the backend doesn't have one (§ 31's instruction followed literally).

## F. Logout

`useLogout()` (`features/auth/queries/hooks.ts`) is a plain callback, not a `useMutation` — there is no `/auth/logout` endpoint to call (stateless JWT auth), and § 26 explicitly says not to invent one. On call: `clearAuthToken()`, then evicts the `auth.me` cache entry (see § L problem #1 for exactly how — this is where the phase's one real bug was). No other query is cleared: `queryClient.clear()` was deliberately not used, because nothing else cached in this contract is actually per-user — event/attendee data (once those features exist) is identical regardless of who's asking, so wiping it would only cause pointless refetches of data that was never wrong.

## G. Files Created

```text
src/features/auth/
├── components/
│   ├── login-form.tsx (+ .test.tsx)
│   ├── register-form.tsx (+ .test.tsx)
│   ├── require-auth.tsx (+ .test.tsx)
│   └── redirect-if-authenticated.tsx (+ .test.tsx)
├── lib/
│   ├── error-messages.ts (+ .test.ts)
│   ├── get-redirect-path.ts (+ .test.ts)
│   └── install-auth-error-handling.ts (+ .test.tsx)
└── schemas/
    ├── login-schema.ts (+ .test.ts)
    └── register-schema.ts (+ .test.ts)

src/pages/
├── login-page.tsx
├── register-page.tsx
└── dashboard-page.tsx

src/components/ui/
├── input.tsx
├── label.tsx
├── field.tsx    (label + input + error, one accessible unit)
├── card.tsx
└── spinner.tsx
```

## H. Files Modified

- **`src/features/auth/queries/hooks.ts`** — added `useAuth()`; rewrote `useLogout()`'s cache eviction after finding the reactivity bug (§ L #1).
- **`src/lib/api/api-client.ts`** — unchanged in behavior; no edit was needed (it already read from `auth-token.ts` since Phase 2).
- **`src/app/providers/app-providers.tsx`** — calls `installAuthErrorHandling(queryClient)` once at module scope; mounts `sonner`'s `<Toaster>`... actually `<Toaster>` itself lives in `app.tsx` (below), not here — `app-providers.tsx` only wires the 401 handler.
- **`src/app/app.tsx`** — added `<Toaster theme="light" position="bottom-right" closeButton />`.
- **`src/app/router/router.tsx`** — added `/login`, `/register` (under `RedirectIfAuthenticated`) and `/dashboard` (under `RequireAuth`).
- **`src/components/layout/root-layout.tsx`** — auth-aware header nav (Sign in/Sign up vs. user name + Sign out), reading `useAuth()`; toasts "Signed out" on logout.
- **`src/pages/home-page.tsx`** — copy updated to reflect that auth now exists.
- **`src/components/ui/label.tsx`** — one `eslint-disable` line for `jsx-a11y/label-has-associated-control` (a generic-primitive false positive — the association is real, enforced by every actual caller via `Field`, just not statically visible in this file).

## I. Dependencies

**Added:** `sonner` — the toast library, added mid-phase at explicit user request for Vercel-style transient action feedback (login/register/logout outcomes), replacing an initial inline-banner design. Nothing else added; no toast-adjacent state management needed since `sonner`'s own module-level store is the entire mechanism.

## J. Testing

Actual results, this run:

```text
npm run typecheck    → passes, 0 errors
npm run lint          → passes, 0 problems
npm run format:check  → passes
npm test               → 18 test files, 84 tests, all passing
npm run build           → succeeds (270 modules; login/register/dashboard/home
                           each their own chunk; a shared `schemas` chunk for
                           RHF+Zod+resolver, loaded only when a form route is visited)
```

Breakdown against § 44's checklist:

- **Schema tests** (`login-schema.test.ts`, `register-schema.test.ts`) — invalid email, missing/empty fields, password length boundaries matched exactly to the backend's `@MinLength`/`@MaxLength` decorators, trim/lowercase normalization matching the backend's `@Transform`.
- **API tests** — unchanged from Phase 2 (`auth-api.test.ts` already covered register/login/getCurrentUser against mocked `fetch`); not re-duplicated here.
- **Hook tests** (`queries/hooks.test.tsx`) — `useCurrentUser`'s enabled/disabled split (from Phase 2, kept), `useLogin`'s token+cache side effects, `useRegister`'s _lack_ of any, `useLogout`'s token/cache clearing **plus a dedicated regression test proving an already-mounted `useCurrentUser` observer updates immediately on logout** (this is the test that would have caught § L problem #1 before it ever reached a browser), and three `useAuth()` tests covering all three states (unauthenticated/loading/authenticated).
- **Security tests** (§ 46, all in `features/auth/lib/`):
  - `get-redirect-path.test.ts` — the open-redirect surface: rejects an absolute external URL and a scheme-relative `//evil.com`, accepts only same-app pathnames, falls back safely on missing/malformed state.
  - `install-auth-error-handling.test.tsx` — a 401 from an _unrelated_ query clears the token and updates an already-mounted `auth.me` observer (the same class of bug as above, exercised at the global-handler level); a 401 from a mutation does the same; a 404 does **not** clear the token (proves the handler is specific to 401, not "any error").
  - Every one of these tests asserts the app "doesn't repeatedly retry authentication failures" implicitly, by asserting the error settles once and the fetch mock's call count where relevant (`install-auth-error-handling.test.tsx`'s first test asserts the mocked `/auth/me` fetch was never called at all, since the 5-minute `staleTime` correctly avoided it).
- **Route tests** (`require-auth.test.tsx`, `redirect-if-authenticated.test.tsx`) — all four scenarios from § 44: unauthenticated → protected route → redirected to login; authenticated → protected route → page renders; authenticated → `/login` → redirected to `/dashboard`; plus the loading-state case (neither the page nor a redirect renders while the check is in flight) and an explicit "stale/invalid token still redirects" case.
- **Form tests** (`login-form.test.tsx`, `register-form.test.tsx`) — inline validation, a deliberately-deferred-promise test that catches the actual `disabled`+"Signing in…" pending state (not just the eventual settled state), the redirect-to-originally-requested-page behavior (§ 23, exercised end-to-end through a real two-route `MemoryRouter`, not just unit-testing `getRedirectPath` in isolation), toast assertions via a mocked `sonner` module, and focus-management on error (`setFocus('email')`/`setFocus('name')`).

Total added this phase: 51 new tests (84 − 33 carried over from Phase 2, one of which — `useLogout`'s — grew a second test case).

## K. React Best-Practices Compliance

- **`rerender-move-effect-to-event`** — every mutation's side effect (toast, navigate, token storage) fires from `onSuccess`/`onError` mutation callbacks or a form's submit handler, never a `useEffect` reacting to mutation state.
- **`rerender-derived-state-no-effect`** — `useAuth()`'s three booleans are computed inline from `useCurrentUser()`'s query state on every render; nothing is copied into `useState` and synced via an effect.
- **`advanced-init-once`** — `installAuthErrorHandling(queryClient)` runs exactly once, at module scope in `app-providers.tsx`, the same pattern already used for the `QueryClient` and router singletons.
- **`bundle-dynamic-imports`** — `login-page`/`register-page`/`dashboard-page` are each `React.lazy` in the router, confirmed in the build output as separate chunks; React Hook Form + Zod + the resolver glue only load once a form route is actually visited (the `schemas-*.js` chunk).
- **§ 47's explicit warning** (`useEffect → fetch /auth/me → setUser()`) — never written; `useCurrentUser()`/`useAuth()` are the only path to current-user data anywhere in the codebase (grepped: zero other places read or duplicate it).
- **§ 48** (no `AuthProvider`/`SessionProvider`) — none exist. `useAuth()` is a plain hook composing `useCurrentUser()`; every component that needs auth state calls it directly through React Context's existing `QueryClientProvider`, not a bespoke provider.

## L. Problems Found

1. **A real bug, found manually, not by a test at first: the header nav didn't update on sign-out.** After clicking "Sign out," the URL correctly moved to `/login`, but `RootLayout`'s nav kept showing the signed-in user's name and a "Sign out" button — indefinitely, across further navigation. Root cause: `useLogout()`'s original implementation called only `queryClient.removeQueries({ queryKey: authKeys.me() })`. `removeQueries` deletes a `Query` object from the cache's internal lookup map, but a component with an **already-mounted, active observer** on that exact query (`RootLayout`'s `useAuth()` → `useCurrentUser()`, mounted for the entire session) holds a direct reference to that `Query` object — removing it from the cache's map never tells the observer anything changed, so it kept rendering the last-known "success, signed-in user" result forever. Confirmed by reading TanStack Query's own source (`query-core/src/queryObserver.ts`/`query.ts`) rather than guessing. **Fix:** call `.reset()` directly on the cache entry (`queryClient.getQueryCache().find({ queryKey: authKeys.me() })?.reset()`) _before_ `removeQueries` — `.reset()` explicitly transitions the query back to its initial state and synchronously notifies every existing observer, which is what actually flips `isSuccess` to `false` immediately. (`queryClient.resetQueries()` was considered and rejected — it also triggers a refetch of the still-"active" query afterward, and at the moment it runs the observer's captured `enabled` is still the stale pre-logout `true`, so it would fire one guaranteed, wasted 401 request; calling the cache entry's own `.reset()` directly avoids that.) The same fix was applied to `installAuthErrorHandling`'s global 401 handler, which had the identical flaw. A dedicated regression test (§ J) now proves an already-mounted observer updates immediately in both cases — this class of bug will not silently reappear.
2. **The brief's suggested `features/auth/lib/auth-storage.ts` location for token storage was not created** — `lib/api/auth-token.ts` (Phase 2) already is that single, dedicated abstraction, and duplicating it under `features/auth/` would violate its own stated goal (§ 6: "one clear owner for credential storage") by creating two. Documented here rather than silently deviating.
3. **`eslint-plugin-jsx-a11y`'s `label-has-associated-control` rule flagged the generic `Label` primitive** even though every real caller (`Field`) does pass `htmlFor` — the rule can't see through the prop spread statically. A single, explained `eslint-disable` line was added rather than restructuring a correct component to satisfy a static-analysis blind spot.
4. **Sonner's `<Toaster>` needed `theme="light"` explicitly**, not `theme="system"` — the initial implementation followed the app's own dark/light mode, but per explicit design direction the toast surface itself should stay a fixed neutral white card (matching a specific reference image) regardless of the page's theme; `richColors` (red/green tinted toasts) was also explicitly removed for the same reason.
5. **`@testing-library/jest-dom`'s `toHaveBeenCalled` assertion style** — an early draft of the 204-response API-client test tried to assert `response.json).not.toHaveBeenCalled` on a plain (non-mock) function, which can't work; simplified to asserting the observable outcome (`result` is `undefined`) instead of an internal call count that was never meaningful in the first place. (Carried over from Phase 2's test file, fixed while extending it this phase.)

## M. NestJS ↔ React Authentication Contract

Confirmed directly from the backend source this phase (not re-guessed):

- **Mechanism**: stateless bearer JWT. `POST /auth/login` returns `{ accessToken, tokenType: 'Bearer', expiresIn, user }`; every protected route is guarded per-route with `@UseGuards(JwtAuthGuard)` (no global guard + `@Public()` opt-out pattern — confirmed by reading `auth.controller.ts`/`events.controller.ts`/`rsvp.controller.ts` directly).
- **No cookies, no refresh token**: `auth.service.ts`'s `login()` only signs and returns a JWT; there is no `Set-Cookie`, no `/auth/refresh` route anywhere in the codebase.
- **`GET /auth/me`'s real response** (re-confirmed, first found in Phase 2): the handler returns the `AuthenticatedUser` request property directly — `{ id, name, email }`, no `createdAt` — despite its own Swagger annotation naming `UserSummaryDto` (the same shape, just worth noting the annotation and the code independently agree once you check both).
- **Error messages are already safe to show directly**: `auth.service.ts` throws `UnauthorizedException('Invalid email or password.')` for _both_ a nonexistent email and a wrong password (deliberately identical, so the frontend can never accidentally leak which one it was even if it wanted to), and `ConflictException('Email already registered')` for a duplicate signup — both are exactly what `getAuthErrorMessage()` shows the user unmodified.
- **CORS**: `backend/src/main.ts`'s `buildCorsOptions()` allows `http://localhost:5173` by default in development (confirmed working end-to-end against the real local backend, including the login/register/dashboard/refresh/logout flow, in a real browser this phase — not just against mocks).

## N. Phase 4 Preparation

Authentication is complete, tested, and manually verified end-to-end (register → login → protected dashboard → hard refresh preserves the session → logout → protected route correctly redirects → log back in → protected route works again — every step of § 49's checklist walked through in a real browser against the real backend). The frontend is ready for event functionality: `useEvents`/`useEvent`/`useCreateEvent`/`useUpdateEvent`/`useDeleteEvent` (Phase 2) already exist and are already authenticated automatically via the same `apiClient` this phase's forms use — an event page built next phase needs zero new auth plumbing, just UI. The design-system primitives added this phase (`Card`, `Input`, `Label`, `Field`, `Spinner`) are already the right shape for event forms/lists to reuse directly. `RequireAuth` is ready to wrap future protected pages (event creation/editing) the same way it wraps `/dashboard` today.
