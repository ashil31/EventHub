import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { setAuthToken } from '../../../lib/api/auth-token';
import { mockFetchJson, mockFetchInvalidJson } from '../../../test/mock-fetch';
import { createTestQueryClient } from '../../../test/test-utils';
import { RequireAuth } from './require-auth';

function renderProtectedRoute(
  queryClient: ReturnType<typeof createTestQueryClient>,
) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route element={<RequireAuth />}>
            <Route path="/dashboard" element={<div>Protected content</div>} />
          </Route>
          <Route path="/login" element={<div>Login page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('RequireAuth', () => {
  it('redirects to /login when there is no stored token', () => {
    const queryClient = createTestQueryClient();

    renderProtectedRoute(queryClient);

    expect(screen.getByText('Login page')).toBeInTheDocument();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  it('shows a loading state — neither the page nor a redirect — while a stored token is being checked', () => {
    setAuthToken('some-token');
    // A response that never resolves during this test — simulates the
    // in-flight window before GET /auth/me settles.
    mockFetchJson(200, {
      id: 'u1',
      name: 'Ashil Patel',
      email: 'ashil@example.com',
    });
    const queryClient = createTestQueryClient();

    renderProtectedRoute(queryClient);

    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.queryByText('Login page')).not.toBeInTheDocument();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  it('renders the protected page once a valid token is confirmed', async () => {
    setAuthToken('some-token');
    mockFetchJson(200, {
      id: 'u1',
      name: 'Ashil Patel',
      email: 'ashil@example.com',
    });
    const queryClient = createTestQueryClient();

    renderProtectedRoute(queryClient);

    await waitFor(() =>
      expect(screen.getByText('Protected content')).toBeInTheDocument(),
    );
  });

  it('redirects to /login when the stored token turns out to be invalid (401-shaped failure)', async () => {
    setAuthToken('a-stale-token');
    mockFetchInvalidJson(401);
    const queryClient = createTestQueryClient();

    renderProtectedRoute(queryClient);

    await waitFor(() =>
      expect(screen.getByText('Login page')).toBeInTheDocument(),
    );
  });
});
