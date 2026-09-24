import { ApiProperty } from '@nestjs/swagger';
import { EventAttendee, User } from '@prisma/client';
import { UserSummaryDto } from '../../users/dto/user-summary.dto';

export class AttendeeResponseDto {
  @ApiProperty({ type: UserSummaryDto })
  user: UserSummaryDto;

  @ApiProperty({ example: '2026-09-24T12:00:00.000Z' })
  joinedAt: Date;
}

export type AttendeeWithUser = EventAttendee & {
  user: Pick<User, 'id' | 'name' | 'email'>;
};

export function toAttendeeResponse(
  attendee: AttendeeWithUser,
): AttendeeResponseDto {
  return {
    user: {
      id: attendee.user.id,
      name: attendee.user.name,
      email: attendee.user.email,
    },
    joinedAt: attendee.joinedAt,
  };
}
