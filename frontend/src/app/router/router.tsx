/* eslint-disable react-refresh/only-export-components -- route config,
   not a component module; the lazy-loaded consts below are never rendered
   directly by anything outside this router table. */
import { lazy } from 'react';
import { createBrowserRouter } from 'react-router';
import { RootLayout } from '../../components/layout/root-layout';
import { RedirectIfAuthenticated } from '../../features/auth/components/redirect-if-authenticated';
import { RequireAuth } from '../../features/auth/components/require-auth';

// Route-level code splitting (Phase 1 § 8, and the react-best-practices
// skill's `bundle-dynamic-imports`): every page is its own chunk, loaded
// only when its route is visited. The layout and the two auth boundaries
// stay static imports since they're on every/most routes anyway.
const HomePage = lazy(() =>
  import('../../pages/home-page').then((m) => ({ default: m.HomePage })),
);
const LoginPage = lazy(() =>
  import('../../pages/login-page').then((m) => ({ default: m.LoginPage })),
);
const RegisterPage = lazy(() =>
  import('../../pages/register-page').then((m) => ({
    default: m.RegisterPage,
  })),
);
const DashboardPage = lazy(() =>
  import('../../pages/dashboard-page').then((m) => ({
    default: m.DashboardPage,
  })),
);
const EventsPage = lazy(() =>
  import('../../pages/events-page').then((m) => ({ default: m.EventsPage })),
);
const EventDetailPage = lazy(() =>
  import('../../pages/event-detail-page').then((m) => ({
    default: m.EventDetailPage,
  })),
);
const CreateEventPage = lazy(() =>
  import('../../pages/create-event-page').then((m) => ({
    default: m.CreateEventPage,
  })),
);
const EditEventPage = lazy(() =>
  import('../../pages/edit-event-page').then((m) => ({
    default: m.EditEventPage,
  })),
);
const NotFoundPage = lazy(() =>
  import('../../pages/not-found-page').then((m) => ({
    default: m.NotFoundPage,
  })),
);

/**
 * The single centralized route table (§ 8/§ 32). Public routes (`/`,
 * `/login`, `/register`) sit directly under `RootLayout`; `/login` and
 * `/register` are additionally wrapped in `RedirectIfAuthenticated` so an
 * already-signed-in visitor doesn't see them (§ 25). `/dashboard` is
 * wrapped in `RequireAuth` (§ 22) — the one protected route this phase
 * introduces, purely to prove the boundary works; real protected pages
 * (event management) arrive in a later phase. `/events` (Phase 4) sits
 * alongside the other public routes — browsing events requires no
 * session, matching the backend's own `GET /events` (no guard). Same for
 * `/events/:eventId` (Phase 5) — `GET /events/:id` has no guard either.
 * `/events/new` and `/events/:eventId/edit` (Phase 7) sit under the same
 * `RequireAuth` boundary as `/dashboard` — creating/editing requires a
 * session, matching the backend's own guards on `POST`/`PATCH /events`.
 * React Router ranks the static `events/new` segment above the dynamic
 * `events/:eventId`, so the two never collide regardless of declaration
 * order.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'events', element: <EventsPage /> },
      { path: 'events/:eventId', element: <EventDetailPage /> },
      {
        element: <RedirectIfAuthenticated />,
        children: [
          { path: 'login', element: <LoginPage /> },
          { path: 'register', element: <RegisterPage /> },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          { path: 'dashboard', element: <DashboardPage /> },
          { path: 'events/new', element: <CreateEventPage /> },
          { path: 'events/:eventId/edit', element: <EditEventPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
