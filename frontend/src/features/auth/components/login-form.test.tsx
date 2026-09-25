import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAuthToken } from '../../../lib/api/auth-token';
import { mockFetchInvalidJson, mockFetchJson } from '../../../test/mock-fetch';
import { createTestQueryClient } from '../../../test/test-utils';
import { LoginForm } from './login-form';
import { RedirectIfAuthenticated } from './redirect-if-authenticated';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// A successful login in one test sets a real token on the module-
// singleton in auth-token.ts, which would otherwise leak into whichever
// test runs next — most visibly for the RedirectIfAuthenticated-wrapped
// test below, which specifically needs to start from "no token."
beforeEach(() => {
  clearAuthToken();
});

function renderLoginForm(
  queryClient: ReturnType<typeof createTestQueryClient>,
  initialEntry: { pathname: string; state?: unknown } = { pathname: '/login' },
) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/login" element={<LoginForm />} />
          <Route path="/dashboard" element={<div>Dashboard page</div>} />
          <Route
            path="/dashboard/settings"
            element={<div>Settings page</div>}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/**
 * Wraps `LoginForm` in the real `RedirectIfAuthenticated` boundary, the
 * way the actual router table does (`router.tsx`) — unlike
 * `renderLoginForm` above. This is the only setup that can reproduce the
 * real-browser race a plain `LoginForm` render can't: `useLogin`'s
 * hook-level `onSuccess` flips `isAuthenticated` to `true` before
 * `LoginForm`'s own call-level `onSuccess` navigates, so
 * `RedirectIfAuthenticated` re-renders and may redirect on its own,
 * first.
 */
function renderLoginFormBehindGuard(
  queryClient: ReturnType<typeof createTestQueryClient>,
  initialEntry: { pathname: string; state?: unknown },
) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route element={<RedirectIfAuthenticated />}>
            <Route path="/login" element={<LoginForm />} />
          </Route>
          <Route path="/dashboard" element={<div>Dashboard page</div>} />
          <Route path="/events/e1" element={<div>Event detail page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LoginForm', () => {
  it('shows inline validation errors and does not submit when fields are empty', async () => {
    const user = userEvent.setup();
    const fetchSpy = mockFetchJson(200, {});
    renderLoginForm(createTestQueryClient());

    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Email is required')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('navigates to /dashboard and toasts success on valid login', async () => {
    const user = userEvent.setup();
    mockFetchJson(200, {
      accessToken: 'jwt-token',
      tokenType: 'Bearer',
      expiresIn: '15m',
      user: {
        id: 'u1',
        name: 'Ashil Patel',
        email: 'ashil@example.com',
        createdAt: '2026-09-25T00:00:00.000Z',
      },
    });
    renderLoginForm(createTestQueryClient());

    await user.type(screen.getByLabelText('Email'), 'ashil@example.com');
    await user.type(
      screen.getByLabelText('Password'),
      'a-reasonably-long-password',
    );
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() =>
      expect(screen.getByText('Dashboard page')).toBeInTheDocument(),
    );
    expect(toast.success).toHaveBeenCalledWith('Signed in');
  });

  it('redirects back to the originally-requested page after login (§ 23)', async () => {
    const user = userEvent.setup();
    mockFetchJson(200, {
      accessToken: 'jwt-token',
      tokenType: 'Bearer',
      expiresIn: '15m',
      user: {
        id: 'u1',
        name: 'Ashil Patel',
        email: 'ashil@example.com',
        createdAt: '2026-09-25T00:00:00.000Z',
      },
    });
    renderLoginForm(createTestQueryClient(), {
      pathname: '/login',
      state: { from: { pathname: '/dashboard/settings' } },
    });

    await user.type(screen.getByLabelText('Email'), 'ashil@example.com');
    await user.type(
      screen.getByLabelText('Password'),
      'a-reasonably-long-password',
    );
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() =>
      expect(screen.getByText('Settings page')).toBeInTheDocument(),
    );
  });

  it(
    'redirects back to the originally-requested page even when wrapped in ' +
      'RedirectIfAuthenticated (regression — a real-browser race let that ' +
      'guard redirect to /dashboard first, discarding the "from" destination)',
    async () => {
      const user = userEvent.setup();
      mockFetchJson(200, {
        accessToken: 'jwt-token',
        tokenType: 'Bearer',
        expiresIn: '15m',
        user: {
          id: 'u1',
          name: 'Ashil Patel',
          email: 'ashil@example.com',
          createdAt: '2026-09-25T00:00:00.000Z',
        },
      });
      renderLoginFormBehindGuard(createTestQueryClient(), {
        pathname: '/login',
        state: { from: { pathname: '/events/e1' } },
      });

      await user.type(screen.getByLabelText('Email'), 'ashil@example.com');
      await user.type(
        screen.getByLabelText('Password'),
        'a-reasonably-long-password',
      );
      await user.click(screen.getByRole('button', { name: 'Sign in' }));

      await waitFor(() =>
        expect(screen.getByText('Event detail page')).toBeInTheDocument(),
      );
      expect(screen.queryByText('Dashboard page')).not.toBeInTheDocument();
    },
  );

  it('shows a pending state while the mutation is in flight and disables the submit button', async () => {
    const user = userEvent.setup();
    let resolveFetch!: (value: unknown) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
      ),
    );
    renderLoginForm(createTestQueryClient());

    await user.type(screen.getByLabelText('Email'), 'ashil@example.com');
    await user.type(
      screen.getByLabelText('Password'),
      'a-reasonably-long-password',
    );
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    const pendingButton = await screen.findByRole('button', {
      name: 'Signing in…',
    });
    expect(pendingButton).toBeDisabled();

    resolveFetch({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          accessToken: 'jwt-token',
          tokenType: 'Bearer',
          expiresIn: '15m',
          user: {
            id: 'u1',
            name: 'Ashil Patel',
            email: 'a@example.com',
            createdAt: '2026-09-25T00:00:00.000Z',
          },
        }),
    });
  });

  it('toasts an error and refocuses the email field on invalid credentials, staying on /login', async () => {
    const user = userEvent.setup();
    mockFetchInvalidJson(401);
    renderLoginForm(createTestQueryClient());

    await user.type(screen.getByLabelText('Email'), 'ashil@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.getByLabelText('Email')).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });
});
