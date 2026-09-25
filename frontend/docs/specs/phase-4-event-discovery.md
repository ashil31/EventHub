# Frontend Phase 4 — Event Discovery, Search, Filtering & Pagination

## A. Skill Inspection

Inspected [`vercel-labs/agent-skills/skills/react-best-practices`](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices) (`SKILL.md` + `AGENTS.md`'s 70-rule index) before writing any code. Rules actually applied:

- **5.1 Calculate derived state during rendering** — `EventSearchInput` resets its local `draft` when the `value` prop changes by comparing against a `committedValue` state and calling `setState` conditionally during render, not in a `useEffect`. This is the documented pattern for "adjusting state when a prop changes without an Effect," and it's what made ESLint's `react-hooks/set-state-in-effect` rule pass — the first draft of this component used an effect for the sync and was rejected by the linter for exactly this reason.
- **1.x (waterfalls)** — not applicable to this phase: there is exactly one query (`useEvents`) per page render, no sequential dependent fetches to parallelize.
- **2.1/2.4 (bundle size / code splitting)** — `EventsPage` is added to the router's existing `lazy()` table (Phase 1 §8's established pattern), so it's its own chunk (confirmed in the build output: `events-page-*.js`, 7.89 kB gzipped 2.76 kB), not bundled into the main chunk.
- **4.x (client data fetching / dedup)** — not directly applicable; TanStack Query already owns request deduplication and caching (Phase 2), which this phase only configures further (`placeholderData`), not reimplements.
- **5.3 (no memoizing simple primitives), 5.15 (useRef for transient values)** — deliberately _not_ applied: no `useMemo`/`useCallback`/`React.memo` was added anywhere in this phase. Filtering/formatting here is cheap (a handful of string/array operations over ≤12 items), so memoizing it would be the "unnecessary ceremony" §37/§24 explicitly warns against. Audited for this explicitly at the end (§K below).
- **6.2 (`content-visibility` for long lists)** — not applicable: pages are capped at 12 items by `EVENTS_PAGE_SIZE`, never a long unbounded list.
- **6.9 (explicit conditional rendering)** — `EventsPage`'s state machine uses a ternary chain (`isPending ? … : isError ? … : … .length === 0 ? … : …`), not `&&`, so a falsy data value could never accidentally render as literal text.
- Not applicable and why: most of the guide (RSC/server-side rules §3, Next.js-specific rules in §2/§6) targets a Next.js/RSC app; this is a Vite SPA with no server components, so those sections were read but don't apply here — noted explicitly rather than silently skipped.

## B. Files Created

| Path                                                                           | Purpose                                                                                                                     |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `src/features/events/lib/event-search-params.ts`                               | Parse/serialize/validate the page's URL-owned discovery state; maps it to the existing Phase 2 `EventListFilters` contract. |
| `src/features/events/lib/format-event-date.ts`                                 | `Intl.DateTimeFormat`-based start/end date-range formatting, with graceful fallback for malformed dates.                    |
| `src/features/events/hooks/use-event-filters.ts`                               | Thin `useSearchParams` wrapper exposing typed `filters` + `setSearch`/`setPage`/`setTimeframe`.                             |
| `src/features/events/components/event-search-input.tsx`                        | Debounced (400ms) search box; local "draft" state vs. committed URL state.                                                  |
| `src/features/events/components/event-timeframe-toggle.tsx`                    | "Upcoming" / "All events" toggle (backed by `from`).                                                                        |
| `src/features/events/components/event-card.tsx`                                | Presentational card for one `Event`; only renders fields the API returns.                                                   |
| `src/features/events/components/event-list.tsx`                                | Responsive grid of `EventCard`s.                                                                                            |
| `src/features/events/components/event-list-skeleton.tsx`                       | Loading skeleton shaped like the card grid, single `role="status"` region.                                                  |
| `src/features/events/components/event-list-error.tsx`                          | Generic error state + `refetch`-backed retry button.                                                                        |
| `src/features/events/components/event-list-empty.tsx`                          | Two empty-state variants (no events at all vs. no search results).                                                          |
| `src/features/events/components/event-pagination.tsx`                          | Previous/Next pagination using the backend's own `page`/`totalPages`.                                                       |
| `src/pages/events-page.tsx`                                                    | `/events` page: orchestrates URL state + `useEvents` + layout only.                                                         |
| 8 new `*.test.ts(x)` files (one per module above, plus `events-page.test.tsx`) | See §J.                                                                                                                     |

## C. Files Modified

| Path                                     | Why                                                                                                                                                                                                                                                                               |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/features/events/queries/options.ts` | Added `placeholderData: keepPreviousData` to `eventsQueries.list` (§11) — the one "smallest compatible change" this phase needed from Phase 2's existing query layer, so pagination doesn't flash a skeleton between pages. Nothing else about `useEvents`/the query key changed. |
| `src/app/router/router.tsx`              | Added the public `/events` route, lazy-loaded like every other page.                                                                                                                                                                                                              |
| `src/pages/home-page.tsx`                | Added one "Browse events" button linking to `/events` (§22 — minimal shell change only, no redesign).                                                                                                                                                                             |
| `src/test/test-utils.tsx`                | Added `renderWithProviders` (additive — `renderWithQueryClient` is untouched and all its existing call sites still work) for pages that need both a `QueryClientProvider` and a `Router` context.                                                                                 |
| `src/test/mock-fetch.ts`                 | Added `mockFetchJsonSequence` for tests needing more than one distinct response in order (pagination, error-then-retry) — `mockFetchJson`'s single fixed response wasn't enough for those.                                                                                        |

## D. Event Discovery Architecture

```text
URL (?search=&page=&timeframe=)
        ↓  useSearchParams (React Router)
useEventFilters()  →  EventDiscoveryFilters { search, page, timeframe }
        ↓  toEventListFilters()
EventListFilters { search?, page, limit, from? }
        ↓
useEvents(filters)          [Phase 2, unchanged signature]
        ↓
eventsQueries.list(filters) [Phase 2 queryOptions, + placeholderData this phase]
        ↓
eventKeys.list(filters)     [Phase 2 — filters are already part of the key]
        ↓
eventsApi.listEvents(filters) → apiClient.get('/events?...')
        ↓
NestJS GET /events (ListEventsDto: page, limit, search, from, to)
```

`EventsPage` never calls `fetch`, never constructs a query key, and never talks to the API client directly — the only new code between the URL and the existing Phase 2 data layer is `event-search-params.ts`'s pure mapping function.

## E. State Ownership

- **Server state** (the actual events, pagination metadata): TanStack Query's cache, via the unchanged Phase 2 `useEvents` hook. `EventsPage` never copies `query.data` into a `useState`.
- **URL state** (search term, page, timeframe): React Router's `useSearchParams`, parsed/serialized by `event-search-params.ts`. This is the only state that determines _which_ query key is active.
- **Local UI state**: exactly one place — `EventSearchInput`'s `draft`/`committedValue`, which exists purely to decouple "what's in the text box right now" from "what's actually been committed to the URL/query," per the debounce requirement (§8). Nothing else in this phase has local UI state.
- **Form state**: not applicable — no forms in this phase.

## F. Search

- The search box is fully controlled by `filters.search` (from the URL) but keeps a local `draft` for instant typing feedback.
- Typing debounces for 400ms before calling `setSearch`, which both updates the URL (`?search=...`) and — because `setSearch` also sets `page: 1` — resets pagination to page 1 in the same URL write. There is no separate "did the search change materially" check; every committed search change resets the page, matching §7's example exactly (`/events?page=4` + search "react" → `/events?search=react&page=1`, not `page=4`).
- `setSearch` passes `{ replace: true }` to `setSearchParams` so each debounced commit updates history in place rather than adding a new entry per keystroke pause — only page/timeframe _clicks_ create a fresh history entry (so the back button meaningfully steps through pages a user actually navigated).
- Debounce implementation is a single `useEffect` with a `setTimeout`/`clearTimeout` pair — the one deliberate, documented exception to "no `useEffect` for state sync" in this phase, because a timer is a genuine external side effect, not server-state mirroring.

## G. Pagination

- Model: the backend's own `page`/`limit`/`total`/`totalPages` (`PaginationMeta`), used directly — no client-side pagination math invented.
- Query-key behavior: `eventKeys.list(filters)` (Phase 2, unchanged) already includes the full normalized filter set, so `/events?page=1` and `/events?page=2` are distinct cache entries; verified by `events-page.test.tsx`'s pagination test, which asserts two separate `fetch` calls with different `page` values and two independently-rendered result sets.
- Loading transition: `placeholderData: keepPreviousData` (added to `eventsQueries.list` this phase) means changing the page keeps rendering the _previous_ page's cards (with a subtle `opacity-60` applied via `query.isFetching`) instead of unmounting into a skeleton — the skeleton only ever appears on the very first load (`query.isPending`), never on a page/filter change once data exists.

## H. Loading/Error/Empty States

- **Loading**: `EventListSkeleton` — six pulsing card-shaped placeholders in the same grid the real cards use, wrapped in one `role="status" aria-label="Loading events"`; the placeholders themselves are `aria-hidden` so screen readers hear one loading announcement, not six.
- **Error**: `EventListError` — generic "Couldn't load events" message (no raw `ApiError.message` surfaced, since the realistic failure on a public GET is network/server, not something user input caused) with a "Try again" button wired to `query.refetch()`, nothing hand-rolled.
- **Empty**: `EventListEmpty` — branches on whether `filters.search` is set. A successful response with zero results is never treated as an error (checked _after_ `query.isError`, using `query.data.data.length === 0`); the search variant offers "Clear search," which calls `setSearch('')` (same filter-setter path as normal typing, not a separate hidden reset).

## I. Accessibility

- `EventSearchInput` has a real (visually-hidden) `<label>` associated via `htmlFor`/`id`, not just a placeholder.
- `EventTimeframeToggle` uses `role="group"` + `aria-label` with `aria-pressed` on each button (a real toggle-group pattern, not two plain buttons with no state exposed).
- Pagination buttons have explicit `aria-label`s ("Go to previous page"/"Go to next page") rather than relying on "Previous"/"Next" text alone being sufficiently unambiguous out of context; the page-count text is `aria-live="polite"` so a page change is announced.
- No `<div onClick>` anywhere — `EventCard` is a plain `<article>` with no interaction (there's genuinely nothing to click yet, since `/events/:id` doesn't exist), and every actual control (search input, toggle buttons, pagination buttons, retry/clear-search buttons) is a real `<button>`/`<input>`.
- Error and empty states use `role="alert"` / semantic headings respectively so assistive tech gets the state change without relying on visual layout.

## J. Testing

47 new tests across 8 files:

- `event-search-params.test.ts` (18 tests) — parse defaults, valid/invalid `search`/`page`/`timeframe` (including `page=abc`, `page=-10`, `page=0`, `page=1.5`), serialize omits defaults, round-trip, `toEventListFilters` mapping (including the `from` timestamp for `timeframe=all`).
- `format-event-date.test.ts` (4 tests) — same-day range, multi-day range, invalid start, invalid end.
- `use-event-filters.test.tsx` (5 tests) — default/parsed filters from a `MemoryRouter`-provided URL, `setSearch`/`setTimeframe` resetting page to 1, `setPage` preserving other filters.
- `event-search-input.test.tsx` (3 tests) — renders current value, debounces (fake timers, asserts zero calls mid-typing then exactly one call after 400ms with the final value), follows an externally-changed `value` prop.
- `event-card.test.tsx` (5 tests) — renders title/location/description/attendee count, "N spots left" vs. "Full" vs. singular "1 spot left", omits the description paragraph when `null`.
- `event-pagination.test.tsx` (5 tests) — renders nothing for 1 page, disables Previous/Next at the boundaries, calls `onPageChange` with the correct adjacent page, renders the "Page X of Y" text.
- `event-list-empty.test.tsx` (2 tests) — no-search vs. search-specific message + working "Clear search" callback.
- `events-page.test.tsx` (5 tests, integration) — loading skeleton → rendered events; the exact URL/query string sent to `fetch` reflects `search`/`page`/`timeframe`; error state + retry (via `mockFetchJsonSequence`, a 500 then a 200) actually recovers; zero-result empty state; a pagination click issues a second distinct request and updates the rendered page.

Results: `npm run lint` — 0 errors. `npm run typecheck` — 0 errors. `npm test` — **131/131 passing** (84 pre-existing + 47 new; 26 test files, up from 18). `npm run build` — succeeds, `events-page` renders as its own lazy chunk (7.89 kB / 2.76 kB gzip).

Manually verified end to end against the real local backend (not just mocks): registered a throwaway account via the API, created three real events, confirmed the grid rendered all three with correct dates/locations/spots/attendee counts, confirmed the search box filtered to one card and updated the URL to `?search=Event+2` after the debounce, confirmed the "Upcoming"/"All events" toggle changed the URL and the (correctly empty, since local dev DB genuinely has no events by default) result set — then deleted all three test events via the API afterward, leaving the local database exactly as it was before this verification.

## K. React Best-Practices Audit

```text
[PASS] Server state remains in TanStack Query — EventsPage never copies query.data into useState
[PASS] URL owns discovery state — search/page/timeframe all parsed from useSearchParams, never duplicated into local state
[PASS] No unnecessary useEffect — the only two effects in this phase (EventSearchInput's debounce timer, and its render-time-adjustment sibling that needed zero effects after the lint fix) are both genuine external-system syncs, not server-state mirroring
[PASS] No duplicate API client — everything goes through the existing apiClient/eventsApi
[PASS] No N+1 event queries — EventCard takes a full Event prop, never queries by id itself
[PASS] Query keys include filters — eventKeys.list(filters) (Phase 2, unchanged) already normalizes and includes page/limit/search/from
[PASS] Accessible controls — labeled search input, aria-pressed toggle group, aria-labeled pagination buttons, role="alert"/role="status" states
[PASS] No unnecessary memoization — zero useMemo/useCallback/React.memo added anywhere in this phase
[PASS] No unstable list keys — EventList keys by event.id; the fixed-length skeleton array is the one place an index key is used, which is safe since it never reorders or changes length
[PASS] Explicit conditional rendering — EventsPage's state branches are a ternary chain, not &&, so no risk of rendering a falsy value literally
```

## L. Scope Verification

```text
[PASS] Event discovery implemented
[PASS] Event listing implemented
[PASS] Search implemented (backend's `search` param — matches title/description/location)
[PASS] Pagination implemented (backend's page/limit/total/totalPages contract)
[PASS] Loading/error/empty states implemented

[NOT IMPLEMENTED]
Event detail
RSVP UI
Create event
Edit event
Delete event
Attendee management
```

## M. Phase 5 Preparation

Phase 5 should build:

- Event Detail page (`/events/:id`), using the existing `useEvent(eventId)` hook (Phase 2, already exists, untouched by this phase)
- Once the detail route exists, `EventCard` can be revisited to link to it (deliberately not done in this phase — see §12)
- Attendee information where appropriate, via the existing `rsvp`/`attendee` query hooks (Phase 2)
