import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthenticatedUser } from '../types/authenticated-user.type';

/**
 * Protects a route with the JWT strategy. Explicitly overrides
 * `handleRequest` so that whatever passport-jwt's underlying error says
 * (expired, malformed, bad signature, etc.) never reaches the client —
 * every failure becomes the same generic 401 (Phase 3 §17/§23). The
 * specific reason is still available server-side via `info`/`err` for
 * debugging, but deliberately isn't logged here — the global exception
 * filter already logs a warning for every 401 with a request ID.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = AuthenticatedUser>(
    err: unknown,
    user: TUser | false,
  ): TUser {
    if (err || !user) {
      throw new UnauthorizedException();
    }
    return user;
  }
}
