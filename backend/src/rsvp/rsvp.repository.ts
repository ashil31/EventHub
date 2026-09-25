import { Injectable } from '@nestjs/common';
import { EventAttendee, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AttendeeWithUser } from './dto/attendee-response.dto';

type Db = PrismaService | Prisma.TransactionClient;

const USER_SELECT = { select: { id: true, name: true, email: true } } as const;

export interface AttendeeListPagination {
  skip: number;
  take: number;
}

/**
 * The only place the `event_attendees` table is queried directly. Pure
 * persistence — no capacity/duplicate/business decisions here, those
 * belong to RsvpService (Phase 5 §31).
 */
@Injectable()
export class RsvpRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAttendee(
    eventId: string,
    userId: string,
    client: Db,
  ): Promise<EventAttendee | null> {
    return client.eventAttendee.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
  }

  createAttendee(
    eventId: string,
    userId: string,
    client: Db,
  ): Promise<EventAttendee> {
    return client.eventAttendee.create({ data: { eventId, userId } });
  }

  async deleteAttendee(eventId: string, userId: string): Promise<number> {
    const result = await this.prisma.eventAttendee.deleteMany({
      where: { eventId, userId },
    });
    return result.count;
  }

  listAttendees(
    eventId: string,
    pagination: AttendeeListPagination,
  ): Promise<AttendeeWithUser[]> {
    return this.prisma.eventAttendee.findMany({
      where: { eventId },
      include: { user: USER_SELECT },
      // Earliest RSVP first (Phase 5 §38) — deterministic and matches the
      // natural "who joined first" reading of an attendee list.
      orderBy: { joinedAt: 'asc' },
      skip: pagination.skip,
      take: pagination.take,
    });
  }
}
