import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { toast } from 'sonner';
import { describe, expect, it, vi } from 'vitest';
import { mockFetchJson } from '../../../test/mock-fetch';
import { createTestQueryClient } from '../../../test/test-utils';
import { RegisterForm } from './register-form';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function renderRegisterForm(
  queryClient: ReturnType<typeof createTestQueryClient>,
) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route path="/register" element={<RegisterForm />} />
          <Route path="/login" element={<div>Login page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('RegisterForm', () => {
  it('shows an inline validation error for a password under 8 characters', async () => {
    const user = userEvent.setup();
    const fetchSpy = mockFetchJson(201, {});
    renderRegisterForm(createTestQueryClient());

    await user.type(screen.getByLabelText('Name'), 'Ashil Patel');
    await user.type(screen.getByLabelText('Email'), 'ashil@example.com');
    await user.type(screen.getByLabelText('Password'), 'short1');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(
      await screen.findByText('Password must be at least 8 characters'),
    ).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('toasts success and navigates to /login on valid registration (no token stored — register does not log in)', async () => {
    const user = userEvent.setup();
    mockFetchJson(201, {
      id: 'u1',
      name: 'Ashil Patel',
      email: 'ashil@example.com',
      createdAt: '2026-09-25T00:00:00.000Z',
    });
    renderRegisterForm(createTestQueryClient());

    await user.type(screen.getByLabelText('Name'), 'Ashil Patel');
    await user.type(screen.getByLabelText('Email'), 'ashil@example.com');
    await user.type(
      screen.getByLabelText('Password'),
      'a-reasonably-long-password',
    );
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() =>
      expect(screen.getByText('Login page')).toBeInTheDocument(),
    );
    expect(toast.success).toHaveBeenCalledWith(
      'Account created',
      expect.objectContaining({ description: 'Sign in to continue.' }),
    );
  });

  it('toasts an error on a duplicate-email 409 and refocuses the name field', async () => {
    const user = userEvent.setup();
    mockFetchJson(409, {
      statusCode: 409,
      code: 'CONFLICT',
      message: 'Email already registered',
      error: 'Conflict',
      timestamp: '2026-09-25T00:00:00.000Z',
      path: '/api/v1/auth/register',
      requestId: 'req-1',
    });
    renderRegisterForm(createTestQueryClient());

    await user.type(screen.getByLabelText('Name'), 'Ashil Patel');
    await user.type(screen.getByLabelText('Email'), 'taken@example.com');
    await user.type(
      screen.getByLabelText('Password'),
      'a-reasonably-long-password',
    );
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Registration failed',
        expect.objectContaining({ description: 'Email already registered' }),
      ),
    );
    expect(screen.getByLabelText('Name')).toHaveFocus();
  });
});
