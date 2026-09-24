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

// Explicit field selection everywhere — the creator relation only ever
// pulls id/name/email, never passwordHash (Phase 4 §34/§44).
const CREATOR_SELECT = {
  select: { id: true, name: true, email: true },
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
      include: { creator: CREATOR_SELECT },
    });
  }

  findById(id: string): Promise<EventWithCreator | null> {
    return this.prisma.event.findUnique({
      where: { id },
      include: { creator: CREATOR_SELECT },
    });
  }

  findMany(
    filter: EventListFilter,
    pagination: EventListPagination,
  ): Promise<EventWithCreator[]> {
    return this.prisma.event.findMany({
      where: this.buildWhere(filter),
      include: { creator: CREATOR_SELECT },
      orderBy: { startsAt: 'asc' },
      skip: pagination.skip,
      take: pagination.take,
    });
  }

  count(filter: EventListFilter): Promise<number> {
    return this.prisma.event.count({ where: this.buildWhere(filter) });
  }

  update(id: string, data: UpdateEventData): Promise<EventWithCreator> {
    return this.prisma.event.update({
      where: { id },
      data,
      include: { creator: CREATOR_SELECT },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.event.delete({ where: { id } });
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
