import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import {
  toUserResponse,
  UserResponseDto,
} from '../users/dto/user-response.dto';
import { UsersRepository } from '../users/users.repository';
import { LoginResponseDto } from './dto/login-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './types/jwt-payload.type';

// OWASP-recommended minimum configuration for Argon2id (2023 Password
// Storage Cheat Sheet): m=19 MiB, t=2, p=1. Deliberately not maximized —
// these are sized for a normal web request/response cycle, not a
// standalone auth service with its own compute budget.
const ARGON2_OPTIONS: argon2.HashOptions = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password.';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<UserResponseDto> {
    const passwordHash = await argon2.hash(dto.password, ARGON2_OPTIONS);

    try {
      const user = await this.usersRepository.create({
        name: dto.name,
        email: dto.email,
        passwordHash,
      });
      return toUserResponse(user);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Email already registered');
      }
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<LoginResponseDto> {
    const user = await this.usersRepository.findByEmail(dto.email);

    // Same generic failure whether the account doesn't exist or the
    // password is wrong — never reveal which one it was (Phase 3 §6).
    if (!user) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const passwordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordValid) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const payload: JwtPayload = { sub: user.id };
    const accessToken = this.jwtService.sign(payload);
    const expiresIn = this.configService.get<string>('jwt.expiresIn', '15m');

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn,
      user: toUserResponse(user),
    };
  }
}
