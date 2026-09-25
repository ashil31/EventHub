import { ApiProperty } from '@nestjs/swagger';

/**
 * The minimal safe shape of a user — exactly what `AuthenticatedUser`
 * (src/auth/types) carries too. Kept separate from `UserResponseDto` (which
 * adds `createdAt`) because not every response needs the full record, and
 * because `AuthenticatedUser` — what gets attached to every authenticated
 * request — should only ever contain what's actually needed for identity
 * and authorization, not incidental extra fields.
 */
export class UserSummaryDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id: string;

  @ApiProperty({ example: 'Ashil Patel' })
  name: string;

  @ApiProperty({ example: 'ashil@example.com' })
  email: string;
}
