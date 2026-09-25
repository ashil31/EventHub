import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../database/prisma.service';
import { EventsRepository } from '../events/events.repository';
import { toAttendeeResponse } from './dto/attendee-response.dto';
import { ListAttendeesDto } from './dto/list-attendees.dto';
import { PaginatedAttendeesResponseDto } from './dto/paginated-attendees-response.dto';
import { RsvpResponseDto } from './dto/rsvp-response.dto';
import { RsvpRepository } from './rsvp.repository';

const ALREADY_RSVPD_MESSAGE = "You have already RSVP'd to this event.";

/**
 * Joining/cancelling/listing for a single event's RSVPs. Coordinates
 * EventsRepository (for the row lock + attendee count, shared with
 * EventsService's capacity-update path) and RsvpRepository (for the
 * actual attendee record). See docs/specs/phase-5-rsvp.md for the full
 * concurrency design and why each piece exists.
 */
@Injectable()
export class RsvpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsRepository: EventsRepository,
    private readonly rsvpRepository: RsvpRepository,
  ) {}

  async join(
    eventId: string,
    currentUser: AuthenticatedUser,
  ): Promise<RsvpResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      // Everything that decides whether a seat is available happens
      // inside this one transaction, on the ROW-LOCKED event, and the
      // lock is held until COMMIT (Phase 5 §7). A second concurrent
      // request for the same event blocks at this line until the first
      // transaction commits or rolls back, then sees its committed
      // effects — this is what makes the capacity/duplicate decision
      // below race-free without any application-level lock.
      const event = await this.eventsRepository.findByIdForUpdate(tx, eventId);
      if (!event) {
        throw new NotFoundException('Event not found');
      }

      if (event.startsAt.getTime() <= Date.now()) {
        throw new ConflictException(
          'RSVP is closed because the event has already started.',
        );
      }

      const existing = await this.rsvpRepository.findAttendee(
        eventId,
        currentUser.id,
        tx,
      );
      if (existing) {
        throw new ConflictException(ALREADY_RSVPD_MESSAGE);
      }

      const attendeeCount = await this.eventsRepository.countAttendees(
        eventId,
        tx,
      );
      if (attendeeCount >= event.capacity) {
        throw new ConflictException('Event is full.');
      }

      const attendee = await this.createAttendeeSafely(
        tx,
        eventId,
        currentUser.id,
      );

      // Safe to compute rather than re-query: the event row has been
      // locked since before this count was taken, so no other
      // transaction could have inserted an attendee in between.
      const newCount = attendeeCount + 1;

      return {
        message: 'RSVP successful',
        eventId,
        userId: currentUser.id,
        joinedAt: attendee.joinedAt,
        attendeeCount: newCount,
        capacity: event.capacity,
        availableSpots: event.capacity - newCount,
      };
    });
  }

  async cancel(eventId: string, currentUser: AuthenticatedUser): Promise<void> {
    const event = await this.eventsRepository.findById(eventId);
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    // No capacity race to protect against here (Phase 5 §24) — removing a
    // row can never push attendeeCount above capacity, so a plain atomic
    // delete is sufficient; no transaction/lock needed.
    const deletedCount = await this.rsvpRepository.deleteAttendee(
      eventId,
      currentUser.id,
    );
    if (deletedCount === 0) {
      throw new NotFoundException('You are not attending this event.');
    }
  }

  async listAttendees(
    eventId: string,
    query: ListAttendeesDto,
  ): Promise<PaginatedAttendeesResponseDto> {
    const event = await this.eventsRepository.findById(eventId);
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const skip = (query.page - 1) * query.limit;
    const [attendees, total] = await Promise.all([
      this.rsvpRepository.listAttendees(eventId, { skip, take: query.limit }),
      this.eventsRepository.countAttendees(eventId, this.prisma),
    ]);

    return {
      data: attendees.map(toAttendeeResponse),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  /**
   * The app-level duplicate check above already prevents this under the
   * row lock in the ordinary case — this catch is deliberate defense in
   * depth (Phase 5 §11), not the primary mechanism: the database's own
   * UNIQUE(eventId, userId) constraint is the actual final authority, and
   * this just translates a hypothetical P2002 into the same friendly,
   * non-leaking message rather than letting a raw Prisma error surface.
   */
  private async createAttendeeSafely(
    tx: Prisma.TransactionClient,
    eventId: string,
    userId: string,
  ) {
    try {
      return await this.rsvpRepository.createAttendee(eventId, userId, tx);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(ALREADY_RSVPD_MESSAGE);
      }
      throw error;
    }
  }
}
