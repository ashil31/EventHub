import { ApiProperty } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { UserSummaryDto } from './user-summary.dto';

/**
 * The safe, public representation of a user. Deliberately NOT the Prisma
 * `User` type — the database model and the API response model are
 * different things with different responsibilities (Phase 3 §21).
 * `passwordHash` never appears here because `toUserResponse` below never
 * reads it off the source object.
 */
export class UserResponseDto extends UserSummaryDto {
  @ApiProperty({ example: '2026-09-24T12:00:00.000Z' })
  createdAt: Date;
}

export function toUserResponse(
  user: Pick<User, 'id' | 'name' | 'email' | 'createdAt'>,
): UserResponseDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
  };
}
