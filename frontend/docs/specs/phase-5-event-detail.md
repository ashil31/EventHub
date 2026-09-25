# Frontend Phase 5 — Event Detail & Event Information

## A. Skill Audit

Re-inspected [`vercel-labs/agent-skills/skills/react-best-practices`](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices) (same skill audited in Phase 4). Relevant rules and how they landed:

- **5.1 Calculate derived state during render** — reused as-is from Phase 4; no new component in this phase needed to sync local state from a prop, so no new effects of any kind were added anywhere in this phase (confirmed by the grep sweep in §I — the only `useEffect` in `src/features/events/` is still Phase 4's search debounce).
- **1.x (waterfalls)** — not applicable: one query (`useEvent`), no dependent fetches.
- **2.1/2.4 (code splitting)** — `EventDetailPage` was added to the router's `lazy()` table exactly like every other page; the build output confirms its own chunk (`event-detail-page-*.js`, 4.07 kB gzipped 1.26 kB).
- **6.9 (explicit conditional rendering)** — the page's state machine is a ternary chain (`isPending ? … : isError ? … : … isMissingEvent ? … : … : …`), never `&&`.
- **5.3/5.15 (no unnecessary memoization)** — no `useMemo`/`useCallback`/`React.memo` added; `isMissingEvent` is a plain module-level function, not a hook, so there's nothing to memoize in the first place.
- Architectural decision this phase's own instructions asked to make explicit (§22/§24 of the brief) — **no hover/focus prefetching and no reuse of list data as `initialData`** for the detail query. Documented in full in §G below; the short version is that both are real, available optimizations the brief explicitly said not to add automatically, and neither earns its complexity on a fast local/same-region API for an app this size.
- Not applicable and why: same as Phase 4 — the RSC/server-rendering sections of the guide don't apply to this Vite SPA.

## B. Files Created

| Path                                                        | Purpose                                                                                                                                                                                                               |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/pages/event-detail-page.tsx`                           | `/events/:eventId` route: reads the route param, calls `useEvent`, renders the right state.                                                                                                                           |
| `src/features/events/components/event-detail-header.tsx`    | Title (the page's `<h1>`) + spots-left/full badge.                                                                                                                                                                    |
| `src/features/events/components/event-detail-meta.tsx`      | The `<dl>` of When/Location/Attendees/Hosted by.                                                                                                                                                                      |
| `src/features/events/components/event-detail-skeleton.tsx`  | Loading skeleton shaped like the real layout.                                                                                                                                                                         |
| `src/features/events/components/event-detail-error.tsx`     | Network/server-failure state + refetch-backed retry.                                                                                                                                                                  |
| `src/features/events/components/event-detail-not-found.tsx` | Genuine-404 state + a deterministic `/events` recovery link.                                                                                                                                                          |
| 5 new `*.test.ts(x)` files                                  | One per component above (except the skeleton, which is purely decorative markup — no assertable behavior beyond what its consumer's tests already exercise), plus `event-detail-page.test.tsx` (integration). See §J. |

No new API module, query key, query options, or hook — `useEvent(eventId)` (Phase 2) was already complete and untouched.

## C. Files Modified

| Path                                                 | Reason                                                                                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `src/app/router/router.tsx`                          | Added the public `/events/:eventId` route, lazy-loaded like every other page.                                             |
| `src/features/events/components/event-card.tsx`      | §21's hard requirement: the card's title is now a `Link` to `/events/:eventId`, stretched across the whole card (see §H). |
| `src/features/events/components/event-card.test.tsx` | Updated for the above — every render now needs a `Router` context; added a test asserting the link's `href`.              |

## D. Routing

```text
/events/:eventId
        ↓ useParams<{ eventId: string }>()
eventId: string | undefined
        ↓ eventId ?? ''
useEvent(eventId)
```

`useParams` types the value as possibly `undefined` even though a matched `:eventId` segment always has _some_ string at runtime — the `?? ''` fallback exists purely to satisfy that type, not to handle a real case; `eventsQueries.detail`'s existing `enabled: Boolean(eventId)` (Phase 2, unchanged) means an empty string simply never fires a request. The route parameter is never trusted beyond that: it goes straight into `useEvent`, and it's the backend's response (404 vs. 400 vs. 200) — not any frontend validation — that determines whether it was a real event id. `/events/123`, `/events/nonexistent`, and a syntactically-invalid path all render without crashing (verified manually — §J).

## E. Data Flow

```text
React Router (/events/:eventId)
        ↓ eventId
EventDetailPage
        ↓
useEvent(eventId)                    [Phase 2, unchanged]
        ↓
eventsQueries.detail(eventId)        [Phase 2, unchanged — enabled: Boolean(eventId)]
        ↓
eventKeys.detail(eventId)            [Phase 2, unchanged — the one canonical key]
        ↓
eventsApi.getEvent(eventId)          [Phase 2, unchanged]
        ↓
apiClient.get(`/events/${eventId}`)  [Phase 1, unchanged]
        ↓
NestJS GET /events/:id  (ParseUUIDPipe → EventsService.findById)
```

Nothing in this phase touches the query layer at all — `EventDetailPage` is the only new code between the route and Phase 2's existing detail query.

## F. Loading/Error/404

- **Initial loading** (`query.isPending`): `EventDetailSkeleton`, a layout-shaped placeholder, never a blank page.
- **Background refetch** (`query.isFetching && !query.isPending`, e.g. after `Retry` re-runs on already-rendered data — not actually reachable in this phase's UI since there's no manual refetch trigger while data is present, but the state machine already distinguishes it correctly): the real content stays mounted; there is no code path that would swap it back to the skeleton once `query.data` exists, since the branch order is `isPending → isError → success`, not re-checked per fetch.
- **404** (`query.isError && error.status === 404`): `EventDetailNotFound` — "Event not found," explains it may have been removed, and a `/events` link.
- **Malformed id / 400** (`query.isError && error.status === 400`): also `EventDetailNotFound` (§ below explains why this is deliberate, not an oversight).
- **Everything else** (`query.isError`, network or 5xx): `EventDetailError` — generic message, `Retry` wired to `query.refetch()`.

**Why 400 maps to not-found, not to the generic error state:** `GET /events/:id` uses `ParseUUIDPipe` on the route param (confirmed in `backend/src/events/events.controller.ts`), so the _only_ way this endpoint ever returns 400 is a syntactically-invalid id (e.g. `/events/123`) — there's no other validation on this route. A 400 here and a 404 for a well-formed-but-nonexistent id mean the exact same thing to a visitor ("this isn't a real event"), and showing the raw backend message for the 400 case (`"Validation failed (uuid is expected)"`, a class-validator string) would violate §17's "don't expose internal/validation details" rule. Treating both as one state is the more correct behavior, not a shortcut — verified manually against both a well-formed nonexistent UUID (real 404) and `/events/123` (real 400), both rendering identically.

## G. Cache Strategy

- **Query key**: `eventKeys.detail(eventId)` (Phase 2, unchanged) — the one canonical key, used by `useEvent`, and already used by `useCreateEvent`/`useUpdateEvent`/`useDeleteEvent`'s cache writes from Phase 2. This phase adds no new key anywhere.
- **Cache reuse**: automatic and free — navigating to an event whose detail was already fetched (e.g. hitting Back then forward, or two cards linking to the same event) reuses the existing cache entry via TanStack Query's normal behavior; nothing extra was written to make this work.
- **Prefetching**: **not implemented.** Considered hover/focus prefetch on `EventCard` (`queryClient.prefetchQuery(eventsQueries.detail(event.id))` on `onMouseEnter`/`onFocus`) — technically straightforward given the shared query-key factory, but it would couple a Phase 4 component to Phase 5's query key for a benefit that's hard to notice on a fast local/same-region API, and the brief was explicit ("do not implement it automatically... only add if... do not prefetch every event in the list"). No clear, demonstrated need → not added.
- **List data as `initialData`**: **not implemented.** The list's `data[]` items are field-for-field identical to the detail response today (both are exactly `EventResponseDto`), so this is technically _possible_ — but per §24, "if the current architecture already supports an appropriate detail-query strategy, reuse it; the detail endpoint remains authoritative" and "document the decision" rather than "add it if technically possible." Implementing it correctly would mean scanning every cached `eventKeys.list(...)` variant (there can be many, one per distinct search/page/timeframe combination) for a matching id on every detail-page mount — real added complexity, and still only ever a placeholder ahead of the authoritative detail fetch that happens regardless. Skipped; the detail endpoint is the sole source of truth exactly as the architecture diagram specifies.

## H. Event Card → Detail Link

`EventCard`'s title (`<h3>`) now wraps a `Link` to `/events/${event.id}`, stretched across the entire card via the standard "stretched link" CSS pattern (`after:absolute after:inset-0` on the anchor, `relative` on the containing `<article>`). This makes the whole card clickable while keeping the link's accessible name exactly the event title — not the whole card's text — and there is exactly one interactive element in the card, so there's no nested-interactive-element concern to reason about (§21/§26).

## I. Accessibility

- Exactly one `<h1>` per page state: the real title on success, "Event not found" on 404/400, "Unable to load this event" on other errors — never more than one, never zero.
- `EventDetailMeta` is a real `<dl>` (§26), not a row of styled `<div>`s.
- The skeleton is one `role="status" aria-label="Loading event"` region with `aria-hidden` decorative bars — one announcement, not several.
- `EventDetailError` uses `role="alert"`; its retry button has a plain accessible name ("Retry").
- Both navigation actions ("← Back to events" at the top of every state, "Browse events" in the not-found state) are real `<Link>`s to deterministic paths, not `navigate(-1)` or a `<div onClick>` — a visitor could have arrived at a detail page directly (a bookmark, a shared link), so there's no guaranteed "back" to return to.
- The back-arrow glyph (`←`) is wrapped in `aria-hidden="true"`, with "Back to events" as the actual accessible text, so screen readers don't announce "leftwards arrow" as part of the link name.
- Verified no horizontal overflow / no fixed desktop widths at a 375px viewport (§27) — screenshot-verified manually (§J); title wraps, the metadata grid collapses to one column, the description reflows normally.

## J. Testing

15 new tests across 5 new test files, plus 1 more added to the existing `event-card.test.tsx` (146 total, up from 131; 31 test files, up from 26):

- `event-detail-header.test.tsx` (3) — renders the title as an `<h1>`, spots-left vs. "Full."
- `event-detail-meta.test.tsx` (3) — location/attendees/host render, date formatting reuses the shared formatter, renders as a real `<dl>`.
- `event-detail-error.test.tsx` (1) — alert role + retry callback fires.
- `event-detail-not-found.test.tsx` (1) — heading + a `/events` link.
- `event-detail-page.test.tsx` (6, integration) — loading skeleton → rendered event; the exact request URL contains the route's event id; a real 404 renders the not-found UI; a 400 (malformed id) _also_ renders the not-found UI; a 500 renders the error state and recovers via retry; the "Back to events" link is present in every state.
- `event-card.test.tsx` (+1 new, existing 5 updated to render under a `MemoryRouter`) — the title links to `/events/:id`.

Results: `npm run lint` — 0 errors. `npm run typecheck` — 0 errors. `npm test` — **146/146 passing**. `npm run build` — succeeds; `event-detail-page` is its own lazy chunk (4.07 kB / 1.26 kB gzip).

Manually verified end to end against the real local backend: registered a throwaway account, created one real event with a two-paragraph description (to verify `whitespace-pre-line` preserves the blank line), clicked its card from `/events`, confirmed the detail page rendered every field correctly with zero console errors. Separately verified a well-formed-but-nonexistent UUID (`/events/00000000-…`) renders the not-found UI via a real 404, and a malformed id (`/events/123`) renders the _same_ not-found UI via a real 400 — not a raw validation error. Verified the mobile layout at a 375px viewport (no overflow, title wraps, metadata grid collapses to one column). Deleted the test event afterward; local DB left exactly as found.

## K. React Best-Practices Audit

```text
[PASS] No unnecessary useEffect — zero new effects added anywhere this phase
[PASS] Server state remains in TanStack Query — EventDetailPage renders straight from query.data, no useState copy
[PASS] No duplicated API logic — useEvent/eventsApi/eventKeys all reused unchanged from Phase 2
[PASS] No N+1 queries — the detail page issues exactly one request; EventCard still takes a full Event prop, doesn't query per-card
[PASS] Query keys are centralized — eventKeys.detail(id), the one existing factory, used nowhere else ad hoc
[PASS] Components have clear responsibilities — header/meta/skeleton/error/not-found are each one focused concern; the page only orchestrates
[PASS] No unnecessary memoization — zero useMemo/useCallback/React.memo added
[PASS] No unnecessary global state — no Redux/Zustand/new context; page state is entirely the route param + the query
[PASS] Accessible navigation — real Links, deterministic targets, aria-hidden decorative glyph
[PASS] Accessible loading/error states — single role="status"/role="alert" regions, one heading per state
[PASS] Responsive UI — single-column mobile, two-column metadata grid on larger screens, verified at 375px
[PASS] No unsafe HTML rendering — description rendered as plain text via whitespace-pre-line, no dangerouslySetInnerHTML anywhere
```

## L. Scope Verification

```text
[PASS] Event detail route
[PASS] Event detail page
[PASS] Event information
[PASS] Loading state
[PASS] Error state
[PASS] Not-found state
[PASS] Responsive layout
[PASS] Accessibility
[PASS] Tests

[NOT IMPLEMENTED]
RSVP
Cancel RSVP
Create event
Edit event
Delete event
Attendee management
Notifications
```

No RSVP-shaped placeholder area was added either, per the brief's explicit preference ("prefer leaving that area out until Phase 6") — the page ends after the description.

## M. Phase 6 Preparation

Phase 6:
RSVP / Join Event experience — using the existing Phase 2 `rsvp` feature (`api/rsvp-api.ts`, `queries/{keys,options,hooks}.ts`, already built and already deliberately _not_ invalidating `eventKeys.lists()` on RSVP), wired into the event detail page this phase built.
