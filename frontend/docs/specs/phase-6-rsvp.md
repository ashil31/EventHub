# Frontend Phase 6 — RSVP / Join Event Experience

## A. Skill Inspection

Re-inspected [`vercel-labs/agent-skills/skills/react-best-practices`](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices) (the same skill audited in Phases 4–5), with this phase's emphasis on mutations, state ownership, and error handling in mind.

- **No optimistic updates anywhere in this phase** — the skill's general performance-oriented bias (§5.13/§6.11, "keep the UI responsive during async work") does not override this phase's own explicit, stronger business rule (§4/§5 of the brief): RSVP is a concurrency-sensitive server decision, and optimistic UI here would mean occasionally showing "You're attending" for a request the server is about to reject. This is a deliberate deviation from the general performance-optimization instinct, justified by the specific domain, not an oversight.
- **5.1 Calculate derived state during render** — `useEventRsvpState` derives its discriminated union from two query results on every render; no `useState`/`useEffect` involved.
- **No unnecessary `useEffect`** — this phase adds zero new effects. The RSVP panel's entire pending/error/success behavior comes from `useMutation`'s own state, not manual effect-driven state tracking.
- **No unnecessary memoization** — no `useMemo`/`useCallback`/`React.memo` added; the panel's own render cost (a handful of conditional branches) doesn't warrant it.
- **6.9 Explicit conditional rendering** — `EventRsvpPanel` is a sequence of early returns per discriminated state (`checking`/`signed-out`/`unavailable`/`attending`/not-attending), not a nested ternary or `&&` chain.
- Not applicable and why: same as prior phases — the RSC/Next.js-specific sections don't apply to this Vite SPA.

## B. Backend Contract

Discovered by inspecting `backend/src/rsvp/` directly (not guessed):

```text
POST   /api/v1/events/:id/rsvp   (auth required)
  201 → RsvpResponseDto { message, eventId, userId, joinedAt, attendeeCount, capacity, availableSpots }
  400 → malformed :id (ParseUUIDPipe)
  401 → missing/invalid token
  404 → "Event not found"
  409 → "You have already RSVP'd to this event." | "Event is full." | "RSVP is closed because the event has already started."

DELETE /api/v1/events/:id/rsvp   (auth required)
  204 → no body
  400 → malformed :id
  401 → missing/invalid token
  404 → "Event not found" | "You are not attending this event."

GET    /api/v1/events/:id/attendees   (auth required — the whole RsvpController is behind one JwtAuthGuard)
  200 → PaginatedResponse<Attendee>
```

**Gap found, and closed (§C/§G below):** `EventResponseDto` has no per-viewer field, and `GET /auth/me` carries no RSVP data — there was no existing, non-wasteful way to answer "is the current user already attending this event." Confirmed by inspection before writing any frontend code; the user was asked and explicitly chose adding a small backend endpoint over the alternatives (paginating `/attendees` to search for a match, or inferring status only reactively from a 409). Added:

```text
GET    /api/v1/events/:id/rsvp   (auth required, same guard as the rest of the controller)
  200 → RsvpStatusResponseDto { attending: boolean, joinedAt: string | null }
  400 → malformed :id
  401 → missing/invalid token
  404 → "Event not found"
```

Full detail on the backend change — why, what, what was deliberately left untouched, and its own test coverage — is documented in `backend/docs/specs/phase-5-rsvp.md`'s Addendum, not duplicated here.

## C. Files Created

**Backend** (see `backend/docs/specs/phase-5-rsvp.md`'s Addendum for the full writeup):

| Path                                               | Purpose                                                        |
| -------------------------------------------------- | -------------------------------------------------------------- |
| `backend/src/rsvp/dto/rsvp-status-response.dto.ts` | `{ attending, joinedAt }` — the new endpoint's response shape. |

**Frontend:**

| Path                                                | Purpose                                                                                                      |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `src/features/rsvp/components/event-rsvp-panel.tsx` | The one RSVP UI component — status display, Join/Cancel actions, mutation feedback.                          |
| `src/features/rsvp/hooks/use-event-rsvp-state.ts`   | Combines `useAuth()` + `useRsvpStatus()` into the panel's discriminated render state.                        |
| `src/features/rsvp/lib/error-messages.ts`           | `getRsvpErrorMessage(ApiError)` — RSVP-specific error copy, mirroring the auth domain's established pattern. |
| 4 new `*.test.ts(x)` files                          | One per module above, plus `event-rsvp-panel.test.tsx` (the main behavioral suite). See §K.                  |

## D. Files Modified

| Path                                                         | Reason                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/types/attendee.ts`                                      | Added `RsvpStatus`, matching the new backend DTO.                                                                                                                                                                                                                                                                                                                                            |
| `src/features/rsvp/api/rsvp-api.ts`                          | Added `getRsvpStatus`.                                                                                                                                                                                                                                                                                                                                                                       |
| `src/features/rsvp/queries/keys.ts`                          | Added `rsvpKeys` (a new, separate namespace from `attendeeKeys` — see §H).                                                                                                                                                                                                                                                                                                                   |
| `src/features/rsvp/queries/options.ts`                       | Added `rsvpQueries.status`.                                                                                                                                                                                                                                                                                                                                                                  |
| `src/features/rsvp/queries/hooks.ts`                         | Added `useRsvpStatus` (same `enabled: hasToken` gate as `useCurrentUser`, §8/§9). Also fixed `useRsvp`/`useCancelRsvp` (Phase 2, reused not duplicated per §2) to additionally invalidate `rsvpKeys.status(eventId)` on success — the existing hooks predated this phase's status query, so without this fix a successful join/cancel wouldn't refresh the very state this phase's UI reads. |
| `src/pages/event-detail-page.tsx`                            | Renders `<EventRsvpPanel eventId={query.data.id} />` after the description.                                                                                                                                                                                                                                                                                                                  |
| `src/features/events/components/event-card.tsx`, its test    | Not RSVP-scoped by itself, but touched in Phase 5, unrelated to this phase — not modified again here.                                                                                                                                                                                                                                                                                        |
| `src/features/auth/components/redirect-if-authenticated.tsx` | **A real bug, found in real-browser manual testing, not a hypothetical** — see §I's dedicated writeup.                                                                                                                                                                                                                                                                                       |
| `src/test/mock-fetch.ts`                                     | Added `mockFetchByUrl` — needed once a single test scenario spans two/three genuinely different endpoints (`/auth/me`, and `GET`/`POST`/`DELETE` all sharing one `/rsvp` URL).                                                                                                                                                                                                               |

## E. RSVP Data Flow

```text
EventDetailPage
     ↓ eventId (from the already-resolved event)
EventRsvpPanel
     ↓
useEventRsvpState(eventId)  →  useAuth() + useRsvpStatus(eventId)
     ↓                              ↓
  (renders the right UI)      rsvpQueries.status(eventId)
                                    ↓
                               rsvpApi.getRsvpStatus(eventId)
                                    ↓
                               apiClient.get(`/events/${id}/rsvp`)
                                    ↓
                               NestJS → RsvpRepository.findAttendee (single indexed lookup)

Join/Cancel button click
     ↓
useRsvp(eventId) / useCancelRsvp(eventId)   [Phase 2 mutations, reused]
     ↓
rsvpApi.rsvp / rsvpApi.cancelRsvp
     ↓
apiClient.post / apiClient.delete
     ↓
NestJS transaction (join) / plain delete (cancel)
     ↓
success → invalidate eventKeys.detail, attendeeKeys.listsForEvent, rsvpKeys.status
     ↓
UI re-renders from the freshly-refetched, server-confirmed state
```

## F. State Ownership

- **Event state**: TanStack Query (`useEvent`, Phase 5, unchanged) — the panel receives `eventId` only, never the event object itself.
- **RSVP status**: TanStack Query (`useRsvpStatus`, this phase) — never a `useState` mirroring it.
- **Mutation state** (pending/error for Join/Cancel): TanStack Query's own `useMutation` state (`rsvp.isPending`, `cancelRsvp.isPending`) — `EventRsvpPanel` reads these directly for button text/disabled state, never copies them into local state.
- **Authentication**: `useAuth()` (Phase 3, unchanged).
- **UI-only local state**: none. There is no `useState` anywhere in this phase's new code.
- **URL state**: not applicable to this phase — no new URL parameters.

## G. Concurrency Handling

The frontend never evaluates or enforces capacity. `EventRsvpPanel` renders "Join Event" whenever the current user's own status is "not attending," regardless of what `EventDetailMeta`'s (Phase 5) `attendeeCount`/`capacity` numbers say — those numbers are informational, sourced from the same `useEvent` cache that can be stale the instant another user's RSVP lands. Clicking Join always sends a real request; the backend's single row-locked transaction (`backend/src/rsvp/rsvp.service.ts`'s `join`, unchanged by this phase) is the only place a capacity decision is actually made. When that transaction rejects with 409, the panel treats it exactly like any other server response: show the message, resync the caches that were wrong (§H). There is no client-side lock, no "optimistic slot reservation," and no retry loop — a rejected join is a normal, expected, fully-handled outcome, not a failure state to work around.

## H. Cache Strategy

**On RSVP success**: invalidates `eventKeys.detail(eventId)` (attendeeCount/availableSpots changed), `attendeeKeys.listsForEvent(eventId)` (a new row exists), and `rsvpKeys.status(eventId)` (this user's own status changed) — all three already existed as the right invalidation scope from Phase 2's `useRsvp`/`useCancelRsvp`, except `rsvpKeys.status`, added this phase (§D). Deliberately does **not** invalidate `eventKeys.lists()` — unchanged reasoning from Phase 2: every open list view self-corrects within its normal staleTime/window-focus refetch, and invalidating every cached filtered/paginated list on every single RSVP anywhere in the app is exactly the over-invalidation the brief warns against for a cost nobody asked to avoid.

**On a 404 or 409 error** (this phase's own addition, in `EventRsvpPanel` itself, not the shared mutation hooks): also invalidates `rsvpKeys.status(eventId)` and `eventKeys.detail(eventId)`. Both of these errors mean the panel's cached view of reality was already wrong before the click — a 404 means the event vanished mid-visit (§46 of the brief), a 409 means someone else's concurrent action (a duplicate join, the event filling up, or — less likely but real — the event starting) changed the truth first. Resyncing here isn't optimistic UI; it's the opposite: letting the server's rejection trigger a real refetch of the exact same authoritative data the initial render came from, rather than leaving the user staring at numbers already proven wrong.

**Why a separate `rsvpKeys` namespace, not folded into `attendeeKeys`**: this user's own membership and "everyone's attendee list" are genuinely different resources with different invalidation triggers — a different user's RSVP changes the attendee list but never this user's own status, so conflating the two keys would either under-invalidate (miss updating one) or over-invalidate (refetch one when only the other changed).

## I. A Real Bug Found and Fixed — `RedirectIfAuthenticated`'s Redirect Race

While manually verifying the "Sign in to RSVP → login → land back on the event" flow in a real browser (not a mock), logging in consistently landed on `/dashboard` instead of the event page — even though `window.history.state` at the `/login` page correctly showed `{ usr: { from: { pathname: '/events/<id>' } } }`.

**Root cause**: `useLogin`'s hook-level `onSuccess` (Phase 3, `queries/hooks.ts`) sets the auth token and primes the `auth.me` cache _before_ `LoginForm`'s own call-level `onSuccess` gets to call `navigate(getRedirectPath(location.state))`. That cache write flips `useAuth().isAuthenticated` to `true`, which re-renders `RedirectIfAuthenticated` (the boundary wrapping `/login`) — and until this fix, that component always redirected to a hardcoded `/dashboard`. It won the race and fired first, discarding the real destination `LoginForm` was about to navigate to.

**Why Phase 3 never caught this**: `/dashboard` was simultaneously `getRedirectPath`'s only real destination (the sole protected route at the time) _and_ its own fallback default — so whichever code path "won" the race produced the identical visible result. The bug was only ever observable once a _different_ destination existed, which is exactly what this phase's `/login` → RSVP flow introduced.

**Fix**: `RedirectIfAuthenticated` now redirects to `getRedirectPath(location.state)` instead of a hardcoded path (`src/features/auth/components/redirect-if-authenticated.tsx`). Both possible redirect sources now compute the identical destination from the identical `location.state`, so it no longer matters which one actually fires.

**Verification**: reproduced the bug live in a real browser first (confirmed landing on `/dashboard`), applied the fix, re-verified live (confirmed landing back on the event page, "Join Event" rendered, zero console errors). Two regression tests added: `redirect-if-authenticated.test.tsx` (verifies the component redirects to a preserved `from` destination, not just `/dashboard`) and `login-form.test.tsx` (the real end-to-end reproduction — `LoginForm` wrapped in the actual `RedirectIfAuthenticated` boundary, submitting a real login and asserting it lands on the preserved destination, not `/dashboard`). The second test is the one that would have caught this before it ever reached a browser.

## J. Error Handling

All mapped through `getRsvpErrorMessage(ApiError)`, mirroring the auth domain's established "trust the backend's own safe message" precedent wherever the backend's text is already specific and non-technical:

| Status          | Message shown                                                                                                                                                                                                                                       | Source                                                                         |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Network failure | "Unable to reach EventHub. Check your internet connection and try again."                                                                                                                                                                           | Frontend-authored (no backend message exists for a request that never landed). |
| 401             | "Your session has expired. Please sign in again."                                                                                                                                                                                                   | Frontend-authored — the backend's raw 401 body isn't user-facing copy.         |
| 404             | Backend's own message, passed through (`"Event not found"` or `"You are not attending this event."` — two genuinely different situations a single hardcoded string would have conflated).                                                           | Pass-through.                                                                  |
| 409             | Backend's own message, passed through (`"You have already RSVP'd to this event."` / `"Event is full."` / `"RSVP is closed because the event has already started."` — all `code: 'CONFLICT'`, no further machine-readable distinction to branch on). | Pass-through.                                                                  |
| 5xx             | "Something went wrong on our end. Please try again."                                                                                                                                                                                                | Frontend-authored.                                                             |

**401 handling specifically (§28 of the brief)**: no explicit navigation-to-login is triggered from the panel itself. The existing global `installAuthErrorHandling` (Phase 3, unchanged) already reacts to _any_ 401 across the whole app — it clears the token and resets the `auth.me` cache, which flips `useEventRsvpState` to `'signed-out'` on the very next render. The panel then shows the same "Sign in to RSVP" call-to-action (with the event correctly preserved as the return destination, §I) it would show to any other unauthenticated visitor — no forced redirect away from the page the user was already looking at. This satisfies the brief's requirements (auth state updated via the existing mechanism, no retry loop, login path available with the destination preserved) without adding a second, RSVP-specific 401 handler.

## K. Accessibility

- Every actionable state renders a real `<button>` or `<Link>` — no `<div onClick>` anywhere in this phase.
- "Sign in to RSVP" is a real `Link` to `/login`, not a button that calls `navigate()` imperatively — deterministic navigation gets a real anchor (consistent with Phases 3/5's established convention).
- The "checking" state renders the existing `Spinner` primitive, which already carries `role="status" aria-label="Loading"` (Phase 1) — no new loading-announcement pattern invented.
- Buttons communicate pending state through their own visible text ("Joining…"/"Cancelling…") and `disabled`, not a separate hidden announcement — consistent with the rest of the app's mutation buttons (`LoginForm`'s "Signing in…", `RootLayout`'s sign-out).
- Error/success feedback goes through `sonner` toasts (Phase 3's existing primitive) — not a second, RSVP-specific notification system.

## L. Testing

Backend: 3 new unit tests + 5 new e2e tests for `GET /events/:id/rsvp` — see `backend/docs/specs/phase-5-rsvp.md`'s Addendum. Full backend suite re-run: 62/62 unit, 33/33 RSVP e2e (including every pre-existing concurrency test, unaffected).

Frontend: 32 new tests (178 total, up from 146 at the end of Phase 5; 34 test files, up from 31):

- `error-messages.test.ts` (8) — network, 401, both 404 reasons pass through, all three 409 reasons pass through, 5xx generic.
- `use-event-rsvp-state.test.tsx` (5) — signed-out, checking (auth pending), not-attending, attending, unavailable-with-working-retry.
- `event-rsvp-panel.test.tsx` (13) — signed-out sign-in-preserves-destination, checking, Join Event render + success flip + toast, duplicate-click prevention (asserts exactly one POST via the fetch mock, not just `isPending`), capacity-full/duplicate/401/network errors with resync verification, attending render + Cancel success flip + toast, stale-cancel error with resync, status-check-unavailable retry recovery.
- `event-detail-page.test.tsx` (+2) — the panel renders signed-out by default; renders "Join Event" when authenticated (full page integration, not just the panel in isolation).
- `rsvp/queries/hooks.test.tsx` (updated) — `useRsvpStatus` fetch-gating and data shape; `useRsvp`/`useCancelRsvp` now assert the additional `rsvpKeys.status` invalidation, still asserting the over-invalidation guard (no `eventKeys.lists()` call).
- `redirect-if-authenticated.test.tsx` (+1), `login-form.test.tsx` (+1) — the redirect-race regression (§I).

Results: `npm run lint` — 0 errors. `npm run typecheck` — 0 errors. `npm test` — **178/178 passing**. `npm run build` — succeeds; `event-detail-page`'s chunk grew from 4.07 kB to 7.79 kB gzip (the RSVP panel + its dependencies), still its own lazy chunk.

Manually verified end to end against the real local backend and a real browser: registered two throwaway accounts, created a capacity-1 event, walked through — signed out → "Sign in to RSVP" → login → **landed back on the event** (the bug fix, confirmed) → "Join Event" → pending → success (badge flips to "Full," attendee count updates, toast fires) → "Cancel RSVP" → success (reverts) → signed in as a second user against the now-full event → "Join Event" → server-rejected with the real 409 → toast shows "Event is full." exactly as the backend phrased it. Zero unexpected console errors throughout (the one logged 409 network entry is the browser's own resource-load log, not a React error). All test data deleted afterward.

## M. React Best-Practices Audit

```text
[PASS] No unnecessary useEffect — zero new effects added anywhere this phase
[PASS] Server state remains in TanStack Query — event, RSVP status, and mutation state are all query/mutation state, never useState
[PASS] RSVP state is not duplicated in local state — useEventRsvpState derives, never stores
[PASS] No unnecessary global state — no Redux/Zustand/Context store; confirmed via repo-wide grep
[PASS] Mutation state comes from TanStack Query — rsvp.isPending/cancelRsvp.isPending drive button text/disabled directly
[PASS] No optimistic capacity manipulation — confirmed via grep: zero setQueryData calls anywhere in features/rsvp
[PASS] No duplicate API clients — everything goes through the existing apiClient/rsvpApi
[PASS] No N+1 requests — one status query, one mutation per action; EventCard still takes a full Event prop
[PASS] Targeted query invalidation — exactly eventKeys.detail/attendeeKeys.listsForEvent/rsvpKeys.status, never a global invalidateQueries()
[PASS] No unnecessary memoization — zero useMemo/useCallback/React.memo added
[PASS] Accessible RSVP controls — real buttons/links throughout, Spinner's existing role="status", visible pending/disabled text
[PASS] Proper loading/error states — checking/unavailable-with-retry are distinct, real states, not conflated
[PASS] No unsafe HTML rendering — no dangerouslySetInnerHTML anywhere in this phase's code
```

## N. Scope Verification

```text
[PASS] RSVP/join
[PASS] Cancel RSVP
[PASS] Auth-aware RSVP
[PASS] Pending states
[PASS] Error handling
[PASS] Server-authoritative capacity
[PASS] Targeted cache synchronization
[PASS] Accessibility
[PASS] Tests

[NOT IMPLEMENTED]
Create event
Edit event
Delete event
Attendee management
Admin dashboard
Notifications
Waitlist
Payments
Calendar integration
WebSockets
```

## O. Phase 7 Preparation

Phase 7 should implement:
Event creation and ownership-based event management.
