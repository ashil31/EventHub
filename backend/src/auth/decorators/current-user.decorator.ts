import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AuthenticatedUser } from '../types/authenticated-user.type';

/**
 * Lets a controller declare `@CurrentUser() user: AuthenticatedUser`
 * instead of reaching into `request.user` (and casting it from `any`)
 * everywhere it's needed. Only valid behind JwtAuthGuard, which is what
 * populates `request.user` in the first place.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user: AuthenticatedUser }>();
    return request.user;
  },
);
