import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { setAuthToken } from '../../../lib/api/auth-token';
import { mockFetchJson } from '../../../test/mock-fetch';
import { createTestQueryClient } from '../../../test/test-utils';
import { RedirectIfAuthenticated } from './redirect-if-authenticated';

function renderPublicOnlyRoute(
  queryClient: ReturnType<typeof createTestQueryClient>,
  initialEntry: { pathname: string; state?: unknown } = { pathname: '/login' },
) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route element={<RedirectIfAuthenticated />}>
            <Route path="/login" element={<div>Login form</div>} />
          </Route>
          <Route path="/dashboard" element={<div>Dashboard</div>} />
          <Route path="/events/e1" element={<div>Event detail page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('RedirectIfAuthenticated', () => {
  it('renders the public page (login form) when there is no stored token', () => {
    const queryClient = createTestQueryClient();

    renderPublicOnlyRoute(queryClient);

    expect(screen.getByText('Login form')).toBeInTheDocument();
  });

  it('renders nothing while a stored token is still being checked (no form flash)', () => {
    setAuthToken('some-token');
    mockFetchJson(200, {
      id: 'u1',
      name: 'Ashil Patel',
      email: 'ashil@example.com',
    });
    const queryClient = createTestQueryClient();

    const { container } = renderPublicOnlyRoute(queryClient);

    expect(container).toBeEmptyDOMElement();
  });

  it('redirects to /dashboard once an already-authenticated visitor is confirmed', async () => {
    setAuthToken('some-token');
    mockFetchJson(200, {
      id: 'u1',
      name: 'Ashil Patel',
      email: 'ashil@example.com',
    });
    const queryClient = createTestQueryClient();

    renderPublicOnlyRoute(queryClient);

    await waitFor(() =>
      expect(screen.getByText('Dashboard')).toBeInTheDocument(),
    );
    expect(screen.queryByText('Login form')).not.toBeInTheDocument();
  });

  it('redirects to the preserved "from" destination instead of always /dashboard (regression — see component doc)', async () => {
    setAuthToken('some-token');
    mockFetchJson(200, {
      id: 'u1',
      name: 'Ashil Patel',
      email: 'ashil@example.com',
    });
    const queryClient = createTestQueryClient();

    renderPublicOnlyRoute(queryClient, {
      pathname: '/login',
      state: { from: { pathname: '/events/e1' } },
    });

    await waitFor(() =>
      expect(screen.getByText('Event detail page')).toBeInTheDocument(),
    );
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
  });
});
