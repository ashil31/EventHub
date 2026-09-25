import { apiClient } from '../../../lib/api/api-client';
import type { LoginResponse } from '../../../types/auth';
import type { User, UserSummary } from '../../../types/user';

/** Matches backend/src/auth/dto/register.dto.ts. */
export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

/** Matches backend/src/auth/dto/login.dto.ts. */
export interface LoginInput {
  email: string;
  password: string;
}

/**
 * Plain, framework-independent functions (§ 48 — no React, no JSX, no
 * cache manipulation here). Each one calls the API and returns typed data
 * or throws the normalized `ApiError`; nothing here touches
 * `localStorage`, `QueryClient`, or component state — that's the query
 * hooks' job (`queries/hooks.ts`), one layer up.
 */
export const authApi = {
  /**
   * Does NOT log the user in — confirmed from auth.controller.ts:
   * `register()` returns only the created `UserResponseDto`, no token.
   * Callers must route a fresh registration to the login flow.
   */
  register: (input: RegisterInput): Promise<User> =>
    apiClient.post<User>('/auth/register', input),

  login: (input: LoginInput): Promise<LoginResponse> =>
    apiClient.post<LoginResponse>('/auth/login', input),

  /**
   * Returns `UserSummary`, not `User` — confirmed from
   * auth.controller.ts: `me()` returns the `AuthenticatedUser` request
   * property (id/name/email only), not the full `UserResponseDto` its own
   * Swagger annotation names. No `createdAt` on this response.
   */
  getCurrentUser: (): Promise<UserSummary> =>
    apiClient.get<UserSummary>('/auth/me'),
};
