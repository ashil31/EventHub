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
 * (event management) arrive in a later phase.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <HomePage /> },
      {
        element: <RedirectIfAuthenticated />,
        children: [
          { path: 'login', element: <LoginPage /> },
          { path: 'register', element: <RegisterPage /> },
        ],
      },
      {
        element: <RequireAuth />,
        children: [{ path: 'dashboard', element: <DashboardPage /> }],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
