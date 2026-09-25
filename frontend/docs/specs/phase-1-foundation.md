# Phase 1 — React Production Foundation

Status: **Complete.** Infrastructure only, per the phase boundary — no auth, events, RSVP, or business UI.

## A. Files Created

```text
frontend/
├── .env.example              VITE_API_URL, documented, no secrets
├── .nvmrc                     "22" — matches backend/.nvmrc
├── .prettierrc.json / .prettierignore
├── eslint.config.js           flat config: typescript-eslint, react-hooks,
│                               react-refresh, jsx-a11y, @tanstack/eslint-plugin-query
├── index.html                 <title>EventHub</title>
├── package.json / package-lock.json
├── tsconfig.json / tsconfig.app.json / tsconfig.node.json   strict: true
├── vite.config.ts             react + tailwind plugins, vitest config
├── public/favicon.svg
└── src/
    ├── app/
    │   ├── app.tsx             ErrorBoundary → AppProviders → Suspense → RouterProvider
    │   ├── app.test.tsx        smoke test: home route renders
    │   ├── providers/app-providers.tsx   QueryClientProvider composition
    │   └── router/router.tsx   centralized route table, lazy-loaded pages
    ├── components/
    │   ├── layout/root-layout.tsx        minimal shell (header + <Outlet/>)
    │   ├── layout/error-boundary.tsx     root rendering-error boundary
    │   └── ui/button.tsx                 the one UI primitive this phase needs
    ├── config/env.ts           typed env access, fails fast on missing var
    ├── lib/
    │   ├── api/api-client.ts   generic fetch wrapper (get/post/patch/delete)
    │   ├── api/api-error.ts    ApiError, normalizes the backend's real error shape
    │   ├── query/query-client.ts   the one QueryClient, EventHub-reasoned defaults
    │   └── utils/cn.ts         class-name join helper
    ├── pages/
    │   ├── home-page.tsx       placeholder + manual API-connectivity check
    │   ├── not-found-page.tsx
    │   └── not-found-page.test.tsx
    ├── styles/globals.css      Tailwind v4 entry, design tokens, base styles
    ├── test/setup.ts           jest-dom matchers
    ├── test/test-utils.tsx     fresh-QueryClient-per-test render helper
    ├── main.tsx
    └── vite-env.d.ts           typed ImportMetaEnv (VITE_API_URL: string)
```

## B. Files Modified

- Root `README.md` — "Frontend: not started" → reflects the planned stack (no code yet at that point).
- `frontend/README.md` — will be updated again at the end of this phase to point at this doc.

## C. Dependencies

**Added** (all current stable majors resolved live by npm, not hand-picked/guessed): `react`/`react-dom` 19.2, `react-router` 8.4, `@tanstack/react-query` 5.103, `zod` 4.6, `react-hook-form` 7.88, `@hookform/resolvers` 5.9, `tailwindcss` 4.3 + `@tailwindcss/vite`, `vite` 8.3, `typescript` ~6.0, `eslint` 9.39 (pinned to the 9.x line — `eslint-plugin-jsx-a11y`'s peer range caps at `eslint@9`, so `eslint@10` was rejected during install and downgraded deliberately, not accidentally) + `@eslint/js`, `typescript-eslint` 8.70, `eslint-plugin-react-hooks` 7.1, `eslint-plugin-react-refresh` 0.5, `eslint-plugin-jsx-a11y` 6.10, `@tanstack/eslint-plugin-query` 5.103, `eslint-config-prettier` 10.1, `prettier` 3.9, `vitest` 5.0, `@testing-library/react` 16.3, `@testing-library/jest-dom` 7.0, `@testing-library/user-event` 14.6, `jsdom` 30.1, `@vitest/ui` 5.0.
**Removed:** `oxlint` (create-vite's new default linter) — swapped for the ESLint stack Phase 1 § 27 requires.
**Not added:** Axios (native `fetch` covers everything the client needs).

## D. Architecture

```text
Browser
  → React Router (createBrowserRouter, lazy-loaded page chunks)
      → RootLayout (header + <Outlet/>)
          → Pages (HomePage, NotFoundPage — placeholders)
  → AppProviders (QueryClientProvider — the one QueryClient)
  → ErrorBoundary (outermost — catches rendering errors from anything below)
```

No feature layer exists yet — `src/features/` is intentionally absent (§ 24: "do not create empty feature folders just for appearance").

## E. State Ownership

| State                                          | Owner                             | Notes                                                                                                                |
| ---------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Route (`/`, `*`)                               | React Router                      | Centralized in `router.tsx`, not scattered                                                                           |
| Server state (future: events, auth, attendees) | TanStack Query                    | `QueryClient` exists; no feature queries yet                                                                         |
| Health-check result on the home page           | TanStack Query                    | `useQuery({ enabled: false })`, fired by a click handler — proves the pattern without becoming a feature             |
| Rendering errors                               | `ErrorBoundary` local class state | Not TanStack Query's concern — it never sees a thrown render error                                                   |
| Everything else                                | Nothing yet                       | Forms (React Hook Form), auth token, and feature server state are introduced when the features that need them arrive |

## F. TanStack Query Configuration

`src/lib/query/query-client.ts` — one `QueryClient`, module-scope, imported wherever needed (never constructed in a component):

- **`staleTime: 60_000`** — EventHub isn't live-ticking data; a page revisited within a minute shouldn't refetch. No `refetchInterval` anywhere (no polling).
- **`retry`**: a custom function — one retry, but zero retries whenever the thrown error is an `ApiError` with a status in the 4xx range (`isRetryableError` inspects `error.isNetworkError || error.status >= 500`). A 401/404/409 won't resolve itself by asking again; a network blip or 5xx might.
- **`refetchOnWindowFocus: true`** (the default, kept deliberately) — cheap, and exactly when a stale count (e.g. attendees, once that feature exists) is likely to have changed while the tab was away.
- **Mutations: `retry: false`** — an automatic retry of a `POST` after a timeout is surprising UX even where the backend's constraints make the retry itself safe (e.g. RSVP's unique constraint just 409s). Manual retry is a deliberate user action.

The client carries zero EventHub-specific knowledge (no event/auth logic) — that's left for the feature phases (§ 11).

## G. API Client

`src/lib/api/api-client.ts` responsibilities, and nothing else:

- Base URL from `env.apiUrl` + the fixed `/api/v1` prefix (the backend's global prefix + default URI version — confirmed in `backend/src/main.ts`).
- JSON body serialization, `Content-Type` only when a body is present.
- Attaches `Authorization: Bearer <token>` **only if** a token has been set via the exported `setAuthToken()` — a plain module-level slot, not wired to anything yet (no login exists in this phase; this is the one extension point Phase 0 § G designed, so the auth phase doesn't have to retrofit header plumbing later).
- `204 No Content` responses (delete/cancel-RSVP, once those exist) resolve to `undefined` rather than calling `.json()` on an empty body.
- Non-2xx → throws `ApiError` built from the actual response body; a `fetch` throw (offline, DNS failure) → `ApiError.networkError()`, `status: 0`.
- Exposes `apiClient.get/post/patch/delete` — thin, typed wrappers around one internal `request<T>()`.

No `getEvents`/`login`/`createEvent` here — those are feature API modules, not built this phase.

## H. React Best-Practices Skill Compliance

Read: `SKILL.md`, the category index, and every rule file actually applicable to a client-only Vite SPA (the `server-*` category and RSC-hydration rules were read but don't apply — no server components in this stack).

| Rule                               | Applied as                                                                                                                                                                                                       |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bundle-dynamic-imports`           | Both pages (`HomePage`, `NotFoundPage`) are `React.lazy` in `router.tsx`; confirmed in the build output — `home-page-*.js` and `not-found-page-*.js` are separate chunks from the main bundle                    |
| `bundle-barrel-imports`            | Every import in the codebase is a direct, named import — no wildcard/barrel imports exist to violate this                                                                                                        |
| `advanced-init-once`               | `QueryClient` (`query-client.ts`) and the router (`router.tsx`) are each constructed exactly once, at module scope                                                                                               |
| `rerender-move-effect-to-event`    | The home page's API check fires from `onClick`, not an effect on mount                                                                                                                                           |
| `rerender-derived-state-no-effect` | No query data is copied into local state anywhere in this phase (there isn't any feature query data yet, but the pattern — e.g. `health.isFetching`/`health.data` read directly in JSX — is already established) |
| `js-early-exit`                    | `readRequiredEnvVar`/`main.tsx`'s root-element check both throw/return early rather than nesting                                                                                                                 |

Not applicable and consciously skipped: `server-*` (no RSC/SSR), `rendering-hydration-*` (no server-rendered HTML to hydrate), most `js-*` micro-optimizations (no hot loops exist yet in a foundation phase).

## I. Testing

Actual results, this run:

```text
npm run typecheck    → passes, 0 errors
npm run lint          → passes, 0 problems
npm run format:check  → passes, all files match Prettier style
npm test              → 2 test files, 2 tests, all passing
npm run build          → succeeds; tsc -b then vite build; output:
                          index.html 0.45 kB, CSS 11.38 kB (gzip 3.21 kB),
                          not-found-page chunk 0.47 kB, home-page chunk 9.87 kB,
                          main chunk 340.21 kB (gzip 106.57 kB)
npm run dev + curl     → HTTP 200, <title>EventHub</title> served
npm run preview + curl → HTTP 200 (production build serves correctly)
```

Tests written: an `App` smoke test (home route renders the "EventHub" heading — found via `getByRole('heading', ...)` after an early version using `findByText` failed with "multiple elements found," since both the header link and the `<h1>` say "EventHub" — a real, fixed test bug, not a hypothetical one) and a `NotFoundPage` test (renders, link back to `/` has the right `href`). `test-utils.tsx`'s `createTestQueryClient()`/`renderWithQueryClient()` exist and are ready (retries disabled, fresh client per call) but have no caller yet — no query hooks exist in this phase to test.

## J. NestJS ↔ React Integration

Nothing feature-level talks to the backend yet. The one exercised path is the home page's manual health check: `Button onClick` → `apiClient.get<HealthResponse>('/health')` → `fetch('{VITE_API_URL}/api/v1/health')` → the backend's public, unauthenticated `GET /api/v1/health` (`backend/src/health` — liveness only, no DB check) → renders "Connected" or the normalized `ApiError.message`. This proves `env.ts`, `api-client.ts`, `api-error.ts`, and the `QueryClient` all work together end-to-end before any feature code depends on them.

## K. Problems Found

1. **`create-vite`'s current template defaults to `oxlint`, not ESLint** — replaced per § 27's explicit requirement, with the full flat-config ESLint stack instead.
2. **`ErrorBoundary`'s `state` field needed an explicit `override` modifier** — `noImplicitOverride` (added deliberately for strictness, § 4) caught `class ErrorBoundary extends Component` shadowing the base class's `state` property without marking it; fixed by adding `override`.
3. **`eslint-plugin-react-hooks@7`'s `configs['recommended-latest']` is legacy-eslintrc-shaped** (`plugins: ["react-hooks"]` as a string array), not flat-config-shaped, despite living under a config object — ESLint 9 refused to load it. The actual flat-compatible config lives one level deeper, at `configs.flat['recommended-latest']`; found by inspecting the installed package's exports directly rather than guessing from older docs.
4. **`import.meta.env.VITE_API_URL` typed as `any`** — Vite's default `ImportMetaEnv` has no declared keys, so any property access resolves to `any`, which `@typescript-eslint/no-unsafe-argument` correctly flagged. Fixed with `src/vite-env.d.ts` augmenting `ImportMetaEnv`/`ImportMeta` with the one real key, `VITE_API_URL: string`.
5. **Google Fonts `@import` after `@import 'tailwindcss'` produced a CSS warning at build time** ("`@import` rules must precede all rules") — Tailwind's own `@import` expands into non-import CSS during the build, which then sits before a later `@import` in the compiled output. Fixed by ordering the font import first in the source file.
6. **`App` smoke test's `findByText('EventHub')` failed with "multiple elements found"** — both the header nav link and the page `<h1>` render "EventHub" text, which is correct UI, not a bug. Fixed the test to target the `<h1>` specifically via `getByRole('heading', { name: 'EventHub' })` rather than loosening the UI to avoid the duplicate text.

## L. Phase 2 Preparation

The repository is ready for the typed API/query layer: `apiClient`/`ApiError`/`queryClient` all exist, validated, and tested end-to-end against a real backend endpoint. Phase 2 adds, without touching this phase's infrastructure: domain types matching the actual backend DTOs, feature API modules (`auth-api.ts`, `events-api.ts`, `rsvp-api.ts`) built on top of `apiClient`, query-key factories and query-options objects per feature, and the custom hooks (`useEvents`, `useEvent`, `useCurrentUser`, `useRsvp`, etc.) that compose them — still with no polished UI, per Phase 2's own boundary.
