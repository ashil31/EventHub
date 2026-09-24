import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../database/prisma.service';
import {
  EventResponseDto,
  EventWithCreator,
  toEventResponse,
} from './dto/event-response.dto';
import { CreateEventDto } from './dto/create-event.dto';
import { ListEventsDto } from './dto/list-events.dto';
import { PaginatedEventsResponseDto } from './dto/paginated-events-response.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventsRepository, UpdateEventData } from './events.repository';

// Absorbs minor clock skew/request latency between client and server
// without meaningfully allowing "past" events to be created (Phase 4 §8).
const PAST_EVENT_GRACE_MS = 60_000;

@Injectable()
export class EventsService {
  constructor(
    private readonly eventsRepository: EventsRepository,
    private readonly prisma: PrismaService,
  ) {}

  async create(
    dto: CreateEventDto,
    currentUser: AuthenticatedUser,
  ): Promise<EventResponseDto> {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);

    this.validateDateOrder(startsAt, endsAt);
    this.validateNotInPast(startsAt);

    const event = await this.eventsRepository.create({
      title: dto.title,
      description: dto.description,
      location: dto.location,
      startsAt,
      endsAt,
      capacity: dto.capacity,
      // The creator is always the authenticated user — never a
      // client-supplied value. CreateEventDto has no `createdBy` field at
      // all, so there is nothing to ignore here; this is the only source.
      createdBy: currentUser.id,
    });

    return toEventResponse(event);
  }

  async list(query: ListEventsDto): Promise<PaginatedEventsResponseDto> {
    // No explicit `from` → default to "now": this is what makes the
    // default listing "upcoming events only" (Phase 4 §16). Passing an
    // explicit past `from` opts out and allows browsing past events.
    const from = query.from ? new Date(query.from) : new Date();
    const to = query.to ? new Date(query.to) : undefined;

    if (to && from > to) {
      throw new BadRequestException('`from` must not be after `to`.');
    }

    const filter = { search: query.search, from, to };
    const skip = (query.page - 1) * query.limit;

    const [events, total] = await Promise.all([
      this.eventsRepository.findMany(filter, { skip, take: query.limit }),
      this.eventsRepository.count(filter),
    ]);

    return {
      data: events.map(toEventResponse),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findById(id: string): Promise<EventResponseDto> {
    const event = await this.findEventOrThrow(id);
    return toEventResponse(event);
  }

  async update(
    id: string,
    dto: UpdateEventDto,
    currentUser: AuthenticatedUser,
  ): Promise<EventResponseDto> {
    const event = await this.findEventOrThrow(id);
    this.assertOwner(event, currentUser);

    // Validate the FINAL resulting state, not each field in isolation —
    // a PATCH that only sends `endsAt` must still be checked against the
    // existing `startsAt` (Phase 4 §25).
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : event.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : event.endsAt;
    this.validateDateOrder(startsAt, endsAt);
    if (dto.startsAt) {
      this.validateNotInPast(startsAt);
    }

    const updateData: UpdateEventData = {
      title: dto.title,
      description: dto.description,
      location: dto.location,
      startsAt: dto.startsAt ? startsAt : undefined,
      endsAt: dto.endsAt ? endsAt : undefined,
      capacity: dto.capacity,
    };

    // Only capacity changes race against RSVP (Phase 5 §28/§29) — other
    // field edits don't touch the attendees<=capacity invariant, so they
    // don't need the lock. Locking unconditionally would serialize every
    // event edit against every RSVP for no reason ("do not blindly add
    // locks everywhere", §29).
    if (dto.capacity === undefined) {
      const updated = await this.eventsRepository.update(id, updateData);
      return toEventResponse(updated);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Locks the SAME event row RsvpService.join locks — this is what
      // actually prevents the race in §29's example (capacity reduced to
      // 50 while a 100th attendee is concurrently joining): whichever
      // transaction acquires the lock first completes its full
      // check-then-write atomically, and the second one re-reads
      // up-to-date state once it acquires the lock in turn.
      const locked = await this.eventsRepository.findByIdForUpdate(tx, id);
      if (!locked) {
        throw new NotFoundException('Event not found');
      }

      const attendeeCount = await this.eventsRepository.countAttendees(id, tx);
      if (dto.capacity! < attendeeCount) {
        throw new ConflictException(
          `Capacity cannot be reduced below the current attendee count (${attendeeCount}).`,
        );
      }

      return this.eventsRepository.update(id, updateData, tx);
    });

    return toEventResponse(updated);
  }

  async delete(id: string, currentUser: AuthenticatedUser): Promise<void> {
    const event = await this.findEventOrThrow(id);
    this.assertOwner(event, currentUser);

    // No manual attendee cleanup needed: event_attendees.eventId has
    // ON DELETE CASCADE (Phase 2), so Postgres removes those rows itself.
    await this.eventsRepository.delete(id);
  }

  private async findEventOrThrow(id: string): Promise<EventWithCreator> {
    const event = await this.eventsRepository.findById(id);
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    return event;
  }

  private assertOwner(
    event: EventWithCreator,
    currentUser: AuthenticatedUser,
  ): void {
    // 403, not 404, for a non-owner: the event is already publicly
    // readable (GET /events/:id has no auth requirement), so there is
    // nothing to conceal by pretending it doesn't exist. Matches Phase 0's
    // security model decision. A genuinely missing event is still 404,
    // via findEventOrThrow above, checked before this.
    if (event.createdBy !== currentUser.id) {
      throw new ForbiddenException(
        'Only the event creator can perform this action',
      );
    }
  }

  private validateDateOrder(startsAt: Date, endsAt: Date): void {
    if (startsAt >= endsAt) {
      throw new BadRequestException('startsAt must be before endsAt');
    }
  }

  private validateNotInPast(startsAt: Date): void {
    if (startsAt.getTime() < Date.now() - PAST_EVENT_GRACE_MS) {
      throw new BadRequestException('startsAt must not be in the past');
    }
  }
}
