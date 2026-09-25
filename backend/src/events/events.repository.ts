import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { EventWithCreator } from './dto/event-response.dto';

export interface CreateEventData {
  title: string;
  description?: string;
  location: string;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  createdBy: string;
}

export type UpdateEventData = Partial<Omit<CreateEventData, 'createdBy'>>;

export interface EventListFilter {
  search?: string;
  from?: Date;
  to?: Date;
}

export interface EventListPagination {
  skip: number;
  take: number;
}

/** The minimal row returned by the locking query — just what RSVP and the
 * capacity-update path need to make their decision. */
export interface EventLockRow {
  id: string;
  capacity: number;
  startsAt: Date;
  createdBy: string;
}

/** Either the plain PrismaService or a transaction-scoped client — callers
 * pass whichever one their operation needs to participate in (Phase 5 §34). */
type Db = PrismaService | Prisma.TransactionClient;

// Explicit field selection everywhere — the creator relation only ever
// pulls id/name/email, never passwordHash (Phase 4 §34/§44).
const CREATOR_SELECT = {
  select: { id: true, name: true, email: true },
} as const;

// Prisma's relation-count feature (`_count`) computes attendeeCount in the
// SAME query as the event itself (one SQL statement with a subquery), not a
// separate query per event — this is what keeps event listing free of N+1
// even though every event now reports its attendee count (Phase 5 §42).
const ATTENDEE_COUNT_INCLUDE = {
  _count: { select: { attendees: true } },
} as const;

/**
 * The only place the `events` table is queried. Pure persistence — no
 * business rules, no authorization, no HTTP concerns (Phase 4 §3/§29).
 */
@Injectable()
export class EventsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateEventData): Promise<EventWithCreator> {
    return this.prisma.event.create({
      data,
      include: { creator: CREATOR_SELECT, ...ATTENDEE_COUNT_INCLUDE },
    });
  }

  findById(id: string): Promise<EventWithCreator | null> {
    return this.prisma.event.findUnique({
      where: { id },
      include: { creator: CREATOR_SELECT, ...ATTENDEE_COUNT_INCLUDE },
    });
  }

  findMany(
    filter: EventListFilter,
    pagination: EventListPagination,
  ): Promise<EventWithCreator[]> {
    return this.prisma.event.findMany({
      where: this.buildWhere(filter),
      include: { creator: CREATOR_SELECT, ...ATTENDEE_COUNT_INCLUDE },
      orderBy: { startsAt: 'asc' },
      skip: pagination.skip,
      take: pagination.take,
    });
  }

  count(filter: EventListFilter): Promise<number> {
    return this.prisma.event.count({ where: this.buildWhere(filter) });
  }

  /**
   * `client` defaults to the plain PrismaService for ordinary updates, but
   * the capacity-race-sensitive path in EventsService passes the
   * transaction-scoped client explicitly so the write participates in the
   * SAME transaction that locked the row and checked attendee count —
   * using the wrong client here would silently reopen the race (Phase 5 §34).
   */
  update(
    id: string,
    data: UpdateEventData,
    client: Db = this.prisma,
  ): Promise<EventWithCreator> {
    return client.event.update({
      where: { id },
      data,
      include: { creator: CREATOR_SELECT, ...ATTENDEE_COUNT_INCLUDE },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.event.delete({ where: { id } });
  }

  /**
   * Locks the event row for the duration of the caller's transaction
   * (`SELECT ... FOR UPDATE`). This is the ONLY raw SQL in the codebase,
   * isolated here because Prisma's high-level query API has no way to
   * express PostgreSQL row locking (Phase 5 §9). The interpolated `id` is
   * parameterized by Prisma's tagged-template `$queryRaw` — never string
   * concatenation — so there is no injection surface. Column names are
   * double-quoted because Prisma's schema uses camelCase columns, which
   * Postgres would otherwise fold to lowercase.
   *
   * Must be called with a transaction client — a lock acquired outside a
   * transaction is released immediately and provides no protection, so
   * there is no default/non-transactional overload of this method.
   */
  async findByIdForUpdate(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<EventLockRow | null> {
    const rows = await tx.$queryRaw<EventLockRow[]>`
      SELECT id, capacity, "startsAt", "createdBy"
      FROM events
      WHERE id = ${id}::uuid
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  /**
   * Attendee count for a single event. Takes an explicit client (see `Db`
   * above) because this is used both inside RSVP's/capacity-update's locked
   * transactions (must use `tx`) and for ordinary reads (`this.prisma`).
   */
  countAttendees(eventId: string, client: Db): Promise<number> {
    return client.eventAttendee.count({ where: { eventId } });
  }

  private buildWhere(filter: EventListFilter): Prisma.EventWhereInput {
    const where: Prisma.EventWhereInput = {};

    if (filter.search) {
      // Prisma's `contains` compiles to a parameterized ILIKE — never raw
      // SQL string concatenation, so there's no injection surface here
      // regardless of what the client sends as `search` (Phase 4 §18).
      where.OR = [
        { title: { contains: filter.search, mode: 'insensitive' } },
        { description: { contains: filter.search, mode: 'insensitive' } },
        { location: { contains: filter.search, mode: 'insensitive' } },
      ];
    }

    if (filter.from || filter.to) {
      where.startsAt = {
        ...(filter.from && { gte: filter.from }),
        ...(filter.to && { lte: filter.to }),
      };
    }

    return where;
  }
}
