import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersRepository } from '../../users/users.repository';
import { AuthenticatedUser } from '../types/authenticated-user.type';
import { JwtPayload } from '../types/jwt-payload.type';

/**
 * Loads the full user record on every authenticated request rather than
 * trusting the JWT payload alone. Deliberate trade-off (Phase 3 §16): this
 * app has no refresh-token or session-revocation mechanism (ADR-004), so a
 * live existence check on every request is what actually stops a JWT for a
 * deleted account from working right up until it expires. It also means
 * `/auth/me` and any future authenticated endpoint gets the current
 * name/email for free instead of a second query. The cost is one extra
 * indexed lookup per authenticated request — acceptable at this project's
 * scale, and matches the installed nestjs-best-practices skill's own
 * `security-auth-jwt` example, which validates the user on every request.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly usersRepository: UsersRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('jwt.secret'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.usersRepository.findById(payload.sub);

    if (!user) {
      throw new UnauthorizedException();
    }

    return { id: user.id, name: user.name, email: user.email };
  }
}
