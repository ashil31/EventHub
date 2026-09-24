/* eslint-disable @typescript-eslint/unbound-method -- repeated Jest mock
   assertions (expect(mock.fn).toHaveBeenCalledWith(...)) in this file are
   not real method references */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../database/prisma.service';
import { EventWithCreator } from './dto/event-response.dto';
import { EventsRepository } from './events.repository';
import { EventsService } from './events.service';

function buildEvent(
  overrides: Partial<EventWithCreator> = {},
): EventWithCreator {
  const now = new Date();
  return {
    id: 'event-1',
    title: 'Backend Meetup',
    description: 'A meetup',
    location: 'Ahmedabad',
    startsAt: new Date(now.getTime() + 24 * 3_600_000),
    endsAt: new Date(now.getTime() + 27 * 3_600_000),
    capacity: 100,
    createdBy: 'user-1',
    createdAt: now,
    updatedAt: now,
    creator: { id: 'user-1', name: 'Owner', email: 'owner@example.com' },
    _count: { attendees: 0 },
    ...overrides,
  };
}

const owner: AuthenticatedUser = {
  id: 'user-1',
  name: 'Owner',
  email: 'owner@example.com',
};
const otherUser: AuthenticatedUser = {
  id: 'user-2',
  name: 'Other',
  email: 'other@example.com',
};

describe('EventsService', () => {
  let service: EventsService;
  const repo = {
    create: jest.fn(),
    findById: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findByIdForUpdate: jest.fn(),
    countAttendees: jest.fn(),
  } as unknown as jest.Mocked<EventsRepository>;
  // $transaction just invokes the callback with a placeholder tx — every
  // repository call inside it is mocked anyway, so the fake tx is never
  // actually used for a real query.
  const prisma = {
    $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback({})),
  } as unknown as jest.Mocked<PrismaService>;

  beforeEach(() => {
    // clearAllMocks resets call history but not the $transaction
    // implementation set above, which is what we want it to keep.
    jest.clearAllMocks();
    service = new EventsService(repo, prisma);
  });

  describe('create', () => {
    const futureStart = new Date(Date.now() + 24 * 3_600_000).toISOString();
    const futureEnd = new Date(Date.now() + 27 * 3_600_000).toISOString();

    it('derives createdBy from the authenticated user, not the request', async () => {
      repo.create.mockResolvedValue(buildEvent());

      await service.create(
        {
          title: 'Meetup',
          location: 'Ahmedabad',
          startsAt: futureStart,
          endsAt: futureEnd,
          capacity: 10,
        },
        owner,
      );

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ createdBy: 'user-1' }),
      );
    });

    it('rejects startsAt >= endsAt', async () => {
      await expect(
        service.create(
          {
            title: 'Meetup',
            location: 'Ahmedabad',
            startsAt: futureEnd,
            endsAt: futureStart,
            capacity: 10,
          },
          owner,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('rejects a startsAt in the past', async () => {
      const past = new Date(Date.now() - 3_600_000).toISOString();
      const pastEnd = new Date(Date.now() - 1_600_000).toISOString();

      await expect(
        service.create(
          {
            title: 'Meetup',
            location: 'Ahmedabad',
            startsAt: past,
            endsAt: pastEnd,
            capacity: 10,
          },
          owner,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('allows a startsAt within the clock-skew grace window', async () => {
      repo.create.mockResolvedValue(buildEvent());
      const almostNow = new Date(Date.now() - 5_000).toISOString();

      await expect(
        service.create(
          {
            title: 'Meetup',
            location: 'Ahmedabad',
            startsAt: almostNow,
            endsAt: futureEnd,
            capacity: 10,
          },
          owner,
        ),
      ).resolves.toBeDefined();
    });
  });

  describe('list', () => {
    it('defaults `from` to now (upcoming events only)', async () => {
      repo.findMany.mockResolvedValue([]);
      repo.count.mockResolvedValue(0);

      await service.list({ page: 1, limit: 20 });

      const filter = repo.findMany.mock.calls[0][0] as { from?: Date };
      expect(filter.from).toBeInstanceOf(Date);
      expect(filter.from!.getTime()).toBeCloseTo(Date.now(), -2);
    });

    it('computes skip/take from page and limit', async () => {
      repo.findMany.mockResolvedValue([]);
      repo.count.mockResolvedValue(0);

      await service.list({ page: 3, limit: 10 });

      expect(repo.findMany).toHaveBeenCalledWith(expect.anything(), {
        skip: 20,
        take: 10,
      });
    });

    it('rejects `from` after `to`', async () => {
      await expect(
        service.list({
          page: 1,
          limit: 20,
          from: '2026-12-31T00:00:00.000Z',
          to: '2026-01-01T00:00:00.000Z',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns pagination metadata based on the total count', async () => {
      repo.findMany.mockResolvedValue([buildEvent()]);
      repo.count.mockResolvedValue(45);

      const result = await service.list({ page: 2, limit: 20 });

      expect(result.meta).toEqual({
        page: 2,
        limit: 20,
        total: 45,
        totalPages: 3,
      });
      expect(result.data).toHaveLength(1);
    });
  });

  describe('findById', () => {
    it('throws 404 for a nonexistent event', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.findById('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('never exposes passwordHash via the nested creator', async () => {
      repo.findById.mockResolvedValue(buildEvent());
      const result = await service.findById('event-1');
      expect(result.createdBy).not.toHaveProperty('passwordHash');
      expect(result.createdBy).toEqual({
        id: 'user-1',
        name: 'Owner',
        email: 'owner@example.com',
      });
    });
  });

  describe('update', () => {
    it('allows the creator to update a non-capacity field without a transaction', async () => {
      repo.findById.mockResolvedValue(buildEvent());
      repo.update.mockResolvedValue(buildEvent({ title: 'New title' }));

      const result = await service.update(
        'event-1',
        { title: 'New title' },
        owner,
      );

      expect(result.title).toBe('New title');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a non-owner with 403', async () => {
      repo.findById.mockResolvedValue(buildEvent());

      await expect(
        service.update('event-1', { title: 'x' }, otherUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('throws 404 for a nonexistent event before checking ownership', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(
        service.update('missing', { title: 'x' }, owner),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('validates the final merged date state, not just the changed field', async () => {
      // existing: startsAt +24h, endsAt +27h. Patch only endsAt to before
      // the EXISTING startsAt -- must be rejected.
      repo.findById.mockResolvedValue(buildEvent());
      const earlyEnd = new Date(Date.now() + 1_000).toISOString();

      await expect(
        service.update('event-1', { endsAt: earlyEnd }, owner),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('ignores a client-supplied createdBy — ownership cannot be transferred', async () => {
      repo.findById.mockResolvedValue(buildEvent());
      repo.update.mockResolvedValue(buildEvent());

      await service.update('event-1', { title: 'Changed' }, owner);

      const [, updateData] = repo.update.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      expect(updateData).not.toHaveProperty('createdBy');
    });

    describe('capacity changes (locked transaction)', () => {
      it('locks the event row and allows a capacity increase', async () => {
        repo.findById.mockResolvedValue(buildEvent());
        repo.findByIdForUpdate.mockResolvedValue({
          id: 'event-1',
          capacity: 100,
          startsAt: new Date(Date.now() + 24 * 3_600_000),
          createdBy: 'user-1',
        });
        repo.countAttendees.mockResolvedValue(80);
        repo.update.mockResolvedValue(buildEvent({ capacity: 200 }));

        const result = await service.update(
          'event-1',
          { capacity: 200 },
          owner,
        );

        expect(result.capacity).toBe(200);
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      });

      it('rejects reducing capacity below the current attendee count', async () => {
        repo.findById.mockResolvedValue(buildEvent({ capacity: 100 }));
        repo.findByIdForUpdate.mockResolvedValue({
          id: 'event-1',
          capacity: 100,
          startsAt: new Date(Date.now() + 24 * 3_600_000),
          createdBy: 'user-1',
        });
        repo.countAttendees.mockResolvedValue(80);

        await expect(
          service.update('event-1', { capacity: 50 }, owner),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(repo.update).not.toHaveBeenCalled();
      });

      it('allows reducing capacity to exactly the current attendee count', async () => {
        repo.findById.mockResolvedValue(buildEvent({ capacity: 100 }));
        repo.findByIdForUpdate.mockResolvedValue({
          id: 'event-1',
          capacity: 100,
          startsAt: new Date(Date.now() + 24 * 3_600_000),
          createdBy: 'user-1',
        });
        repo.countAttendees.mockResolvedValue(80);
        repo.update.mockResolvedValue(buildEvent({ capacity: 80 }));

        await expect(
          service.update('event-1', { capacity: 80 }, owner),
        ).resolves.toBeDefined();
      });
    });
  });

  describe('delete', () => {
    it('allows the creator to delete', async () => {
      repo.findById.mockResolvedValue(buildEvent());
      await service.delete('event-1', owner);
      expect(repo.delete).toHaveBeenCalledWith('event-1');
    });

    it('rejects a non-owner with 403', async () => {
      repo.findById.mockResolvedValue(buildEvent());
      await expect(service.delete('event-1', otherUser)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(repo.delete).not.toHaveBeenCalled();
    });

    it('throws 404 for a nonexistent event', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.delete('missing', owner)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
