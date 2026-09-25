import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Tracks authenticated requests by user id rather than IP. Two reasons:
 * IP-based tracking has real production downsides for an authenticated API
 * (users sharing a NAT/VPN share one bucket; one user with several IPs
 * evades the limit), and per-user tracking is what the installed
 * nestjs-best-practices skill's own `security-rate-limiting` rule
 * recommends ("use user ID if authenticated, IP otherwise").
 *
 * Unauthenticated routes (register/login, public GETs) have no
 * `request.user` yet, so they fall back to IP — which is correct and
 * unavoidable for pre-authentication endpoints.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    const user = req.user as { id?: string } | undefined;
    return Promise.resolve(user?.id ?? (req.ip as string));
  }
}
