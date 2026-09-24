import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Event, User } from '@prisma/client';
import { UserSummaryDto } from '../../users/dto/user-summary.dto';

/**
 * The safe, public representation of an event. Deliberately not the
 * Prisma `Event` type — same database-model-vs-API-response-model
 * separation as UserResponseDto. `createdBy` is a nested safe user
 * summary (id/name/email), never a bare id and never passwordHash.
 */
export class EventResponseDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id: string;

  @ApiProperty({ example: 'Backend Engineering Meetup' })
  title: string;

  @ApiPropertyOptional({ example: 'A meetup for backend engineers.' })
  description: string | null;

  @ApiProperty({ example: 'Ahmedabad' })
  location: string;

  @ApiProperty({ example: '2026-10-10T10:00:00.000Z' })
  startsAt: Date;

  @ApiProperty({ example: '2026-10-10T13:00:00.000Z' })
  endsAt: Date;

  @ApiProperty({ example: 100 })
  capacity: number;

  @ApiProperty({ type: UserSummaryDto })
  createdBy: UserSummaryDto;

  @ApiProperty({ example: '2026-09-24T12:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-09-24T12:00:00.000Z' })
  updatedAt: Date;
}

export type EventWithCreator = Event & {
  creator: Pick<User, 'id' | 'name' | 'email'>;
};

export function toEventResponse(event: EventWithCreator): EventResponseDto {
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    location: event.location,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    capacity: event.capacity,
    createdBy: {
      id: event.creator.id,
      name: event.creator.name,
      email: event.creator.email,
    },
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };
}
