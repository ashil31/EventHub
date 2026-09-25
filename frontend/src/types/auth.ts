import type { User } from './user';

/** Matches backend/src/auth/dto/login-response.dto.ts. */
export interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
  user: User;
}
