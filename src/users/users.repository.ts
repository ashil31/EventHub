import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

export interface CreateUserData {
  name: string;
  email: string;
  passwordHash: string;
}

/**
 * The only place that queries the `users` table. Email normalization
 * (trim + lowercase) lives here, not in callers, so every future caller —
 * AuthService now, anything else later — gets the same behavior for free
 * instead of having to remember to normalize themselves.
 *
 * Returns full Prisma `User` rows (including passwordHash) — callers in the
 * application layer are responsible for mapping to a safe response shape
 * before anything reaches an HTTP response. See users/dto/user-response.dto.ts.
 */
@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email: this.normalizeEmail(email) },
    });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  create(data: CreateUserData): Promise<User> {
    return this.prisma.user.create({
      data: {
        name: data.name,
        email: this.normalizeEmail(data.email),
        passwordHash: data.passwordHash,
      },
    });
  }
}
