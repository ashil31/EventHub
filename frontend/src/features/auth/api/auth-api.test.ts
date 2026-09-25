import { beforeEach, describe, expect, it } from 'vitest';
import { clearAuthToken } from '../../../lib/api/auth-token';
import { mockFetchJson } from '../../../test/mock-fetch';
import { authApi } from './auth-api';

beforeEach(() => {
  clearAuthToken();
});

describe('authApi', () => {
  it('register posts to /auth/register and returns the created user', async () => {
    const mock = mockFetchJson(201, {
      id: 'u1',
      name: 'Ashil Patel',
      email: 'ashil@example.com',
      createdAt: '2026-09-25T00:00:00.000Z',
    });

    const user = await authApi.register({
      name: 'Ashil Patel',
      email: 'ashil@example.com',
      password: 'a-reasonably-long-password',
    });

    expect(user.id).toBe('u1');
    expect(user.createdAt).toBe('2026-09-25T00:00:00.000Z');
    const [url, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3000/api/v1/auth/register');
    expect(init.method).toBe('POST');
  });

  it('login posts to /auth/login and returns the token + user', async () => {
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

    const result = await authApi.login({
      email: 'ashil@example.com',
      password: 'a-reasonably-long-password',
    });

    expect(result.accessToken).toBe('jwt-token');
    expect(result.user.email).toBe('ashil@example.com');
  });

  it('getCurrentUser calls GET /auth/me and returns the minimal summary shape', async () => {
    const mock = mockFetchJson(200, {
      id: 'u1',
      name: 'Ashil Patel',
      email: 'ashil@example.com',
    });

    const user = await authApi.getCurrentUser();

    expect(user).toEqual({
      id: 'u1',
      name: 'Ashil Patel',
      email: 'ashil@example.com',
    });
    const [url, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3000/api/v1/auth/me');
    expect(init.method).toBe('GET');
  });
});
