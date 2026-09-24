import { ApiProperty } from '@nestjs/swagger';

export class RsvpResponseDto {
  @ApiProperty({ example: 'RSVP successful' })
  message: string;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  eventId: string;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  userId: string;

  @ApiProperty({ example: '2026-09-24T12:00:00.000Z' })
  joinedAt: Date;

  @ApiProperty({
    example: 74,
    description:
      'Authoritative count from EventAttendee, read inside the same locked transaction that just inserted this RSVP.',
  })
  attendeeCount: number;

  @ApiProperty({ example: 100 })
  capacity: number;

  @ApiProperty({ example: 26 })
  availableSpots: number;
}
