/* eslint-disable react-refresh/only-export-components -- route config,
   not a component module; the lazy-loaded consts below are never rendered
   directly by anything outside this router table. */
import { lazy } from 'react';
import { createBrowserRouter } from 'react-router';
import { RootLayout } from '../../components/layout/root-layout';

// Route-level code splitting (Phase 1 § 8, and the react-best-practices
// skill's `bundle-dynamic-imports`): every page is its own chunk, loaded
// only when its route is visited. The layout stays a static import since
// it's on every route anyway.
const HomePage = lazy(() =>
  import('../../pages/home-page').then((m) => ({ default: m.HomePage })),
);
const NotFoundPage = lazy(() =>
  import('../../pages/not-found-page').then((m) => ({
    default: m.NotFoundPage,
  })),
);

/**
 * The single centralized route table (§ 8: "do not scatter route
 * definitions across components"). Only `/` and the catch-all exist yet —
 * feature routes (events, auth, RSVP, dashboard) are added in the phases
 * that implement them, nested under this same layout.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
