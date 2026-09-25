# Frontend Phase 7 — Event Creation & Ownership-Based Event Management

## A. Skill Inspection

Re-inspected [`vercel-labs/agent-skills/skills/react-best-practices`](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices) (the same skill audited every prior phase), applied specifically to forms this time:

- **No `useEffect` per form field (§19 of the brief)** — the classic anti-pattern (`useEffect(() => setTitle(event.title), [event])` repeated per field) never gets written here because `EditEventPage` doesn't mount `EventForm` at all until the event has actually loaded; by the time it exists, `useForm({ defaultValues: parseEventToFormValues(event) })` already has the complete, real initial state in one shot. No effect, no reset dance, nothing to synchronize.
- **The one deliberate `useEffect` in this phase** lives in the new `Dialog` primitive (`components/ui/dialog.tsx`), synchronizing a boolean `open` prop with the native `<dialog>` element's own imperative `showModal()`/`close()` — a legitimate "sync with a non-React widget" effect, the same category as Phase 4's search-debounce timer, not server-state mirroring.
- **No unnecessary memoization** — no `useMemo`/`useCallback`/`React.memo` added anywhere in this phase.
- **React Hook Form owns form state, not `useState` per field** — confirmed via grep: zero `useState` calls for individual field values anywhere in `EventForm`; the only `useState` in this whole phase is `DeleteEventDialog`'s `open` boolean, genuinely local UI state.

## B. Backend Contract

Confirmed by reading `backend/src/events/{events.controller,events.service}.ts` and the DTOs directly — not guessed:

```text
POST /api/v1/events   (auth required)
  Body: { title, description?, location, startsAt, endsAt, capacity }
    title/location: required, ≤200 chars. description: optional, ≤2000.
    startsAt/endsAt: ISO-8601 UTC, startsAt < endsAt, startsAt not in the past
    (60s grace period). capacity: positive integer.
  201 → EventResponseDto (the full Event shape)
  400 → validation failure (class-validator message(s))
  401 → missing/invalid token

PATCH /api/v1/events/:id   (auth required, creator only)
  Body: any subset of the above (UpdateEventDto = CreateEventDto's PartialType)
    Only re-validates "not in the past" if startsAt is actually part of the
    request body. Only locks/re-checks capacity-vs-attendeeCount if capacity
    is part of the request body.
  200 → EventResponseDto
  400 → validation failure
  401 → missing/invalid token
  403 → "Only the event creator can perform this action" (not the creator)
  404 → "Event not found"
  409 → "Capacity cannot be reduced below the current attendee count (N)."

DELETE /api/v1/events/:id   (auth required, creator only)
  204 → no body
  401/403/404 → same as PATCH
```

`Event.createdBy` on the response side is a `UserSummary` (`{id, name, email}`), confirmed against the actual frontend type (`types/event.ts`, itself verified against `event-response.dto.ts` in Phase 2) — the ownership comparison this phase does (`user.id === event.createdBy.id`) compares two real, confirmed-compatible UUIDs, not a guess about what `createdBy` contains.

## C. Files Created

| Path                                                      | Purpose                                                                                                                           |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/ui/textarea-field.tsx`                    | `<textarea>` counterpart to the existing `Field` (for description).                                                               |
| `src/components/ui/dialog.tsx`                            | Thin wrapper around the native `<dialog>` element — the confirmation-dialog primitive.                                            |
| `src/features/events/schemas/event-schema.ts`             | `createEventSchema`/`editEventSchema` — see §K for why they differ.                                                               |
| `src/features/events/lib/event-datetime.ts`               | The `datetime-local` ↔ ISO-8601 UTC boundary (§K).                                                                                |
| `src/features/events/lib/event-form-transform.ts`         | `parseEventToFormValues`/`mapEventFormToCreateRequest`/`mapEventFormToUpdateRequest` — pure, deterministic, no React/API calls.   |
| `src/features/events/lib/error-messages.ts`               | `getEventErrorMessage(ApiError)` — mirrors the auth/rsvp domains' established pass-through pattern.                               |
| `src/features/events/lib/is-missing-event.ts`             | Extracted from `event-detail-page.tsx`'s own inline function once `EditEventPage` needed the identical 404-or-malformed-id logic. |
| `src/features/events/components/event-form.tsx`           | The one reusable form, both modes.                                                                                                |
| `src/features/events/components/event-detail-actions.tsx` | Owner-only Edit/Delete controls on the event detail page.                                                                         |
| `src/features/events/components/delete-event-dialog.tsx`  | The delete button + confirmation dialog + mutation wiring.                                                                        |
| `src/features/events/components/event-edit-forbidden.tsx` | Proactive "not the owner" state on the edit page.                                                                                 |
| `src/pages/create-event-page.tsx`                         | `/events/new`.                                                                                                                    |
| `src/pages/edit-event-page.tsx`                           | `/events/:eventId/edit`.                                                                                                          |
| 9 new `*.test.ts(x)` files                                | One per module above, plus the two page-level integration suites. See §M.                                                         |

No new API module, query key, or mutation hook — `useCreateEvent`/`useUpdateEvent`/`useDeleteEvent` (Phase 2) were already complete and correct, and are reused entirely unchanged.

## D. Files Modified

| Path                              | Reason                                                                                                                  |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `src/app/router/router.tsx`       | Added `/events/new` and `/events/:eventId/edit`, both under the existing `RequireAuth` boundary alongside `/dashboard`. |
| `src/pages/events-page.tsx`       | Added a "Create event" button in the header.                                                                            |
| `src/pages/event-detail-page.tsx` | Renders `<EventDetailActions>`; switched to the extracted `isMissingEvent` from `lib/`.                                 |
| `src/styles/globals.css`          | Two small `<dialog>`-specific rules (§K's sibling fix — see the real bug in §I).                                        |
| `src/test/setup.ts`               | jsdom doesn't implement `HTMLDialogElement.showModal()`/`close()` — a global shim, not a per-test workaround (see §I).  |

## E. Form Architecture

```text
EventForm (mode: 'create' | 'edit')
  ↓ React Hook Form (useForm, register, handleSubmit, formState)
  ↓ Zod (createEventSchema or editEventSchema, by mode)
  ↓ onSubmit(values, dirtyFields) — handed back to the page, not called internally
CreateEventPage / EditEventPage
  ↓ mapEventFormToCreateRequest / mapEventFormToUpdateRequest (pure transform)
  ↓ useCreateEvent() / useUpdateEvent(eventId)   [Phase 2, unchanged]
  ↓ eventsApi.createEvent / updateEvent
  ↓ apiClient.post / patch
  ↓ NestJS
```

`EventForm` owns fields/validation/form-state/submission UI only (§39 of the brief); it has no route params, no API calls, no navigation. The page owns the mutation, the transform, and what happens once the mutation resolves — a clean, deliberate split, not an accident of where the code happened to land.

## F. Create Flow

1. `/events/new` (behind `RequireAuth`) renders `<EventForm mode="create">` with no `defaultValues`.
2. On submit, `CreateEventPage` calls `mapEventFormToCreateRequest(values)` then `useCreateEvent().mutate(...)`.
3. On success: `useCreateEvent`'s own `onSuccess` (Phase 2, unchanged) seeds `eventKeys.detail(event.id)` with the authoritative response via `setQueryData` and invalidates `eventKeys.lists()`. The page then navigates to `/events/${event.id}` (`replace: true`, so Back doesn't return to an empty create form) and toasts "Event created."
4. On failure: the mutation's error is mapped through `getEventErrorMessage` and shown as a form-level banner (`role="alert"`) above the fields — the user's already-typed input is untouched, exactly as §24 requires (React Hook Form's own `register` never clears on a failed submit).

## G. Edit Flow

1. `/events/:eventId/edit` (behind `RequireAuth`) reads the route param, calls `useEvent(eventId)` — the exact same Phase 2 hook the detail page uses, no second event-fetching mechanism.
2. While loading: a centered `Spinner` (matching `RequireAuth`'s own loading block). On a 404/malformed-id: the reused `EventDetailNotFound`. On a network/5xx failure: the reused `EventDetailError`, with `Retry` wired to `query.refetch()`.
3. Once loaded, a **proactive UI-only ownership check** (`user.id === event.createdBy.id`) runs before the form is ever rendered — a non-owner sees `EventEditForbidden` instead, never a form they could never successfully submit.
4. Owners get `<EventForm mode="edit" defaultValues={parseEventToFormValues(event)}>`. The "Save changes" button stays disabled until React Hook Form's own `isDirty` is true — there's nothing to save in an untouched form.
5. On submit, `EditEventPage` calls `mapEventFormToUpdateRequest(values, dirtyFields)` — **only the fields the user actually changed** become part of the PATCH body (verified directly in a test: editing just `capacity` sends `{"capacity":75}` and nothing else). `useUpdateEvent(eventId)` (Phase 2, unchanged) handles the request and its own cache sync.
6. Success → toast "Event updated" → navigate to `/events/${event.id}` (`replace: true`). Failure (including a 403 from a race — ownership changed between load and submit) → the same form-level banner pattern as create, via `getEventErrorMessage`.

## H. Delete Flow

`EventDetailActions` (owner-only, same ownership check as above) renders `DeleteEventDialog`, which owns:

1. `open` state (`useState`, genuinely local/ephemeral — not server truth) — the "Delete event" button on the page opens it.
2. The confirmation itself is the native `<dialog>` element via the new `Dialog` primitive (§I explains why, and the real jsdom gap it surfaced), showing the event's title and "This action cannot be undone."
3. "Cancel" closes the dialog without any request ever being sent (verified in a test — the fetch mock is asserted `not.toHaveBeenCalled()`).
4. "Delete event" (inside the dialog) calls `useDeleteEvent()` (Phase 2, unchanged — removes the detail/attendee-list cache entries, invalidates lists). On success: toast "Event deleted," navigate to `/events` (`replace: true`) — the user is never left looking at `/events/<deleted-id>`. On failure: a toast with the mapped error message, and **the dialog stays open** so the user can see what happened and retry or cancel — no pretending the delete succeeded.

## I. A Real Bug Found — jsdom's Missing `<dialog>` Support, and a Real Visual Bug — the Dialog Wasn't Centered

Two genuine issues found and fixed while building/verifying this phase, not hypothetical:

1. **jsdom doesn't implement `HTMLDialogElement.showModal()`/`.close()`** (confirmed empirically — the very first `Dialog` test threw `dialog.showModal is not a function`). This isn't a jsdom version regression to work around locally; it's a documented, long-standing gap in jsdom's DOM implementation. Fixed with a small, global, one-time shim in `src/test/setup.ts` (not a per-test mock) that defines `showModal`/`close` in terms of the `open` attribute jsdom _does_ support (a plain reflected boolean attribute) — the standard, well-known approach for testing native `<dialog>` under jsdom.

2. **The dialog rendered pinned to the top-left corner of the viewport in a real browser**, not centered — caught by actually looking at a screenshot, not just the passing automated tests (which only assert visibility/content, not layout). Root cause: Tailwind's preflight zeroes out every element's default `margin`, including `<dialog>`'s own `margin: auto`, which is what a browser normally uses to center it. Fixed with one explicit `dialog { margin: auto; }` rule in `globals.css`. Re-verified with a second screenshot showing the dialog properly centered with a dimmed backdrop.

## J. Authorization

- **Frontend visibility** (§8/§31): `EventDetailActions` renders Edit/Delete only when `user.id === event.createdBy.id`; `EditEventPage` independently performs the same check before ever rendering the form. Both are pure UX — a shortcut to avoid showing controls that could never succeed, never treated as the actual gate.
- **Backend authorization remains authoritative** in every case: `EventsService.assertOwner` throws a 403 regardless of what the frontend showed or hid. This was specifically exercised, not just asserted in comments — `edit-event-page.test.tsx` has a dedicated test simulating exactly this race (page loaded as the owner, but the PATCH itself comes back 403), and the UI shows the backend's own safe message via the form banner rather than pretending the save succeeded.
- **403 handling** (§9/§26): never retried automatically, never a false success. The message shown is the backend's own ("Only the event creator can perform this action") — already safe and specific, passed through by `getEventErrorMessage` rather than reworded, matching the established precedent from the auth/rsvp domains.

## K. Date/Timezone Handling

```text
<input type="datetime-local">  (browser-local time, no timezone in the string)
        ↓  new Date(value)   — the browser parses a timezone-less string as local time
        ↓  .toISOString()    — converts to the correct UTC instant
API timestamp (ISO-8601 UTC)
```

and the inverse for populating the edit form:

```text
API timestamp (ISO-8601 UTC)
        ↓  new Date(iso)
        ↓  local getters (getFullYear/getMonth/getDate/getHours/getMinutes —
           deliberately NOT the getUTC* equivalents)
<input type="datetime-local"> value
```

Neither direction ever appends or strips a literal `"Z"` by string manipulation — both go through a real `Date` object, which is the only thing that correctly applies the browser's own timezone offset in both directions. Manually verified in a real browser (not just the timezone-agnostic round-trip unit test, which deliberately avoids asserting an exact string since that would depend on the test runner's own timezone): created an event with `Starts: 2026-09-26T16:28`, and the detail page rendered back exactly `16:28` — no shift, in either direction.

## L. Accessibility

- Every field in `EventForm` goes through `Field`/`TextareaField`, both of which wire `label`/`id`/`aria-invalid`/`aria-describedby` from a single generated id — the same accessibility pattern established in Phase 3, not reinvented.
- The delete confirmation uses the native `<dialog>` element via `showModal()`, which gives correct modal semantics for free: focus moves inside and is trapped there (confirmed live — "Cancel" received focus automatically when the dialog opened), Escape closes it (fires `cancel` then `close`, both wired to `onClose`), background content becomes inert to assistive tech. None of that is hand-rolled.
- "Cancel" in both `EventForm` and `DeleteEventDialog` is `type="button"`, never the default `type="submit"` — clicking it can never accidentally submit the form.
- Server-level errors use `role="alert"` (the form banner); field-level errors use the existing `Field`/`TextareaField` wiring (`role="alert"` + `aria-describedby`), never color alone.
- Verified keyboard-only: Tab reaches every field and both buttons in document order; the delete dialog is reachable and dismissible without a mouse.

## M. Testing

70 new tests (248 total, up from 178; 46 test files, up from 34):

- `event-schema.test.ts` (14) — valid submission, required/maxLength for title/location/description, capacity integer/positive, cross-field date order, create-mode rejects a past start, **edit-mode explicitly does not** (the key behavioral difference between the two schemas).
- `event-datetime.test.ts` (4) — invalid-date fallback, shape of a converted value, a valid ISO round-trip, and a timezone-agnostic round-trip check (compares to the minute, never asserts an exact string).
- `event-form-transform.test.ts` (8) — `parseEventToFormValues` (including a null description), `mapEventFormToCreateRequest` (trims fields, drops a blank description via `undefined`), `mapEventFormToUpdateRequest` (only dirty fields included, verified for several individual fields and the empty case).
- `error-messages.test.ts` (7, events) — network, 401, and pass-through for 400/403/404/409.
- `is-missing-event.test.ts` (4) — 404/400 true, 500/non-`ApiError` false.
- `dialog.test.tsx` (5) — closed by default, opens/closes with the `open` prop, `onClose` fires on both native `close` and `cancel` (Escape) events.
- `event-form.test.tsx` (10) — create-mode labels/button text, field-level validation blocks submission, a valid submission calls `onSubmit` with the right shape, the cross-field date-order error, Cancel doesn't submit, the pending label/disabled state, the server-error banner, edit-mode pre-fill, **Save changes disabled until a real edit**, and the key edge case — an edit that never touches `startsAt` succeeds even when that unmodified date has since passed (proving `editEventSchema`'s lack of a not-in-the-past check actually works as designed).
- `event-detail-actions.test.tsx` (3), `event-edit-forbidden.test.tsx` (1), `delete-event-dialog.test.tsx` (4) — signed-out/non-owner render nothing, owner sees both controls, Cancel sends no request, confirm deletes+toasts+navigates, failure toasts and **keeps the dialog open**.
- `create-event-page.test.tsx` (4), `edit-event-page.test.tsx` (6) — full page-level integration: render, real success navigation, a real 400 shown as a banner with input preserved, Cancel navigation; and for edit specifically — loading → populated form, 404, the proactive forbidden state, a real PATCH request body asserted to contain only the changed field, a 403 race from the backend, Cancel navigating to the detail page.

Results: `npm run lint` — 0 errors. `npm run typecheck` — 0 errors. `npm test` — **248/248 passing**. `npm run build` — succeeds; `create-event-page`/`edit-event-page`/`event-form-transform`/`is-missing-event` all render as their own lazy chunks.

Manually verified end to end against the real local backend and a real browser: created a throwaway account, clicked "Create event" while signed out (redirected through `/login`, landed back on `/events/new` — the exact mechanism Phase 6's bug fix made correct), filled and submitted the form, landed on the new event's detail page with the exact typed date/time preserved (`16:28 – 19:28`, no shift), edited just the capacity and confirmed only that field changed while everything else stayed identical, opened the delete confirmation (caught and fixed the off-center dialog bug via a screenshot, §I), confirmed deletion, and landed back on an empty `/events` list. Verified the create form's mobile layout at 375px (single column, no overflow). Zero unexpected console errors throughout.

## N. React Best-Practices Audit

```text
[PASS] React Hook Form owns form state — zero per-field useState anywhere in EventForm
[PASS] Zod owns client validation — createEventSchema/editEventSchema, resolved via zodResolver
[PASS] TanStack Query owns server state — useCreateEvent/useUpdateEvent/useDeleteEvent (Phase 2), unchanged
[PASS] No duplicated server state — EventForm never copies query.data into local state
[PASS] No unnecessary useEffect — the only one in this phase (Dialog's showModal/close sync) is a genuine non-React-widget sync
[PASS] No unnecessary global state — no Redux/Zustand/Context store; confirmed via repo-wide grep
[PASS] Mutations use existing API layer — Component → mutation hook → eventsApi → apiClient → NestJS, no raw fetch anywhere in this phase
[PASS] Query keys centralized — eventKeys (Phase 2, unchanged), no new ad hoc keys
[PASS] Targeted cache invalidation — create/update/delete's existing Phase 2 invalidation scope reused unchanged, no global invalidateQueries()
[PASS] No optimistic destructive operations — DeleteEventDialog navigates only after the server confirms
[PASS] Accessible forms — Field/TextareaField's established label/error wiring throughout
[PASS] Accessible delete confirmation — native <dialog>'s real modal semantics, not hand-rolled
[PASS] Responsive UI — verified at 375px, single-column collapse, no overflow
```

## O. Scope Verification

```text
[PASS] Create event
[PASS] Edit event
[PASS] Delete event
[PASS] React Hook Form
[PASS] Zod validation
[PASS] Owner-aware UI
[PASS] Backend authorization handling
[PASS] Cache synchronization
[PASS] Accessible forms
[PASS] Tests

[NOT IMPLEMENTED]
Admin dashboard
Attendee management
Notifications
Calendar
Payments
Waitlist
Analytics
Recurring events
Image uploads
```

Dirty-form navigation protection (§20 of the brief) was deliberately **not implemented**: React Router's `useBlocker` (the mechanism that would be needed) adds real complexity — a confirmation UI, interaction with the existing Cancel button, edge cases around programmatic navigation on success — for a 6-field form with no meaningful draft investment. The brief explicitly frames this as optional and asks for a documented reason when skipped rather than a forced implementation; this is that reason.

## P. Phase 8 Preparation

Phase 8 should focus on:
Application-wide UX polish, responsive/layout consistency, navigation, error boundaries, accessibility review, loading/empty/error consistency, and final frontend integration.
