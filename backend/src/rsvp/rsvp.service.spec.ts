/* eslint-disable @typescript-eslint/unbound-method -- Jest mock assertions
   (expect(mock.fn).toHaveBeenCalledWith(...)) are not real method references */
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EventAttendee, Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../database/prisma.service';
import { EventLockRow } from '../events/events.repository';
import { EventsRepository } from '../events/events.repository';
import { RsvpRepository } from './rsvp.repository';
import { RsvpService } from './rsvp.service';

const currentUser: AuthenticatedUser = {
  id: 'user-1',
  name: 'Alice',
  email: 'alice@example.com',
};

function buildLockRow(overrides: Partial<EventLockRow> = {}): EventLockRow {
  return {
    id: 'event-1',
    capacity: 100,
    startsAt: new Date(Date.now() + 24 * 3_600_000),
    createdBy: 'owner-1',
    ...overrides,
  };
}

function buildAttendee(overrides: Partial<EventAttendee> = {}): EventAttendee {
  return {
    id: 'attendee-1',
    eventId: 'event-1',
    userId: 'user-1',
    joinedAt: new Date(),
    ...overrides,
  };
}

describe('RsvpService', () => {
  let service: RsvpService;
  const eventsRepository = {
    findByIdForUpdate: jest.fn(),
    countAttendees: jest.fn(),
    findById: jest.fn(),
  } as unknown as jest.Mocked<EventsRepository>;
  const rsvpRepository = {
    findAttendee: jest.fn(),
    createAttendee: jest.fn(),
    deleteAttendee: jest.fn(),
    listAttendees: jest.fn(),
  } as unknown as jest.Mocked<RsvpRepository>;
  const prisma = {
    $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback({})),
  } as unknown as jest.Mocked<PrismaService>;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RsvpService(prisma, eventsRepository, rsvpRepository);
  });

  describe('getStatus', () => {
    it('throws 404 for a nonexistent event', async () => {
      eventsRepository.findById.mockResolvedValue(null);

      await expect(
        service.getStatus('missing', currentUser),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(rsvpRepository.findAttendee).not.toHaveBeenCalled();
    });

    it('returns attending: false when there is no attendee row', async () => {
      eventsRepository.findById.mockResolvedValue({} as never);
      rsvpRepository.findAttendee.mockResolvedValue(null);

      const result = await service.getStatus('event-1', currentUser);

      expect(result).toEqual({ attending: false, joinedAt: null });
    });

    it('returns attending: true with joinedAt when an attendee row exists', async () => {
      eventsRepository.findById.mockResolvedValue({} as never);
      const attendee = buildAttendee();
      rsvpRepository.findAttendee.mockResolvedValue(attendee);

      const result = await service.getStatus('event-1', currentUser);

      expect(result).toEqual({
        attending: true,
        joinedAt: attendee.joinedAt,
      });
    });
  });

  describe('join', () => {
    it('succeeds and returns the authoritative counts', async () => {
      eventsRepository.findByIdForUpdate.mockResolvedValue(buildLockRow());
      rsvpRepository.findAttendee.mockResolvedValue(null);
      eventsRepository.countAttendees.mockResolvedValue(73);
      rsvpRepository.createAttendee.mockResolvedValue(buildAttendee());

      const result = await service.join('event-1', currentUser);

      expect(result).toMatchObject({
        message: 'RSVP successful',
        eventId: 'event-1',
        userId: 'user-1',
        attendeeCount: 74,
        capacity: 100,
        availableSpots: 26,
      });
    });

    it('performs the whole decision inside one transaction', async () => {
      eventsRepository.findByIdForUpdate.mockResolvedValue(buildLockRow());
      rsvpRepository.findAttendee.mockResolvedValue(null);
      eventsRepository.countAttendees.mockResolvedValue(0);
      rsvpRepository.createAttendee.mockResolvedValue(buildAttendee());

      await service.join('event-1', currentUser);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('throws 404 for a nonexistent event', async () => {
      eventsRepository.findByIdForUpdate.mockResolvedValue(null);

      await expect(service.join('missing', currentUser)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(rsvpRepository.createAttendee).not.toHaveBeenCalled();
    });

    it('rejects a duplicate RSVP with 409 (app-level check)', async () => {
      eventsRepository.findByIdForUpdate.mockResolvedValue(buildLockRow());
      rsvpRepository.findAttendee.mockResolvedValue(buildAttendee());

      await expect(service.join('event-1', currentUser)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(rsvpRepository.createAttendee).not.toHaveBeenCalled();
    });

    it('rejects when the event is full', async () => {
      eventsRepository.findByIdForUpdate.mockResolvedValue(
        buildLockRow({ capacity: 10 }),
      );
      rsvpRepository.findAttendee.mockResolvedValue(null);
      eventsRepository.countAttendees.mockResolvedValue(10);

      await expect(service.join('event-1', currentUser)).rejects.toMatchObject({
        message: 'Event is full.',
      });
      expect(rsvpRepository.createAttendee).not.toHaveBeenCalled();
    });

    it('rejects RSVP for an event that has already started', async () => {
      eventsRepository.findByIdForUpdate.mockResolvedValue(
        buildLockRow({ startsAt: new Date(Date.now() - 3_600_000) }),
      );

      await expect(service.join('event-1', currentUser)).rejects.toMatchObject({
        message: 'RSVP is closed because the event has already started.',
      });
      expect(rsvpRepository.findAttendee).not.toHaveBeenCalled();
    });

    it('translates a database unique-constraint race into the same friendly 409', async () => {
      eventsRepository.findByIdForUpdate.mockResolvedValue(buildLockRow());
      rsvpRepository.findAttendee.mockResolvedValue(null);
      eventsRepository.countAttendees.mockResolvedValue(0);
      rsvpRepository.createAttendee.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(service.join('event-1', currentUser)).rejects.toMatchObject({
        message: "You have already RSVP'd to this event.",
      });
    });
  });

  describe('cancel', () => {
    it('succeeds when the user is attending', async () => {
      eventsRepository.findById.mockResolvedValue({} as never);
      rsvpRepository.deleteAttendee.mockResolvedValue(1);

      await expect(
        service.cancel('event-1', currentUser),
      ).resolves.toBeUndefined();
    });

    it('throws 404 when the event does not exist', async () => {
      eventsRepository.findById.mockResolvedValue(null);

      await expect(
        service.cancel('missing', currentUser),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(rsvpRepository.deleteAttendee).not.toHaveBeenCalled();
    });

    it('throws 404 when the user is not attending', async () => {
      eventsRepository.findById.mockResolvedValue({} as never);
      rsvpRepository.deleteAttendee.mockResolvedValue(0);

      await expect(
        service.cancel('event-1', currentUser),
      ).rejects.toMatchObject({
        message: 'You are not attending this event.',
      });
    });
  });

  describe('listAttendees', () => {
    it('throws 404 for a nonexistent event', async () => {
      eventsRepository.findById.mockResolvedValue(null);

      await expect(
        service.listAttendees('missing', { page: 1, limit: 20 }, currentUser),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("throws 403 for a caller who isn't the event's creator", async () => {
      eventsRepository.findById.mockResolvedValue({
        createdBy: 'owner-1',
      } as never);

      await expect(
        service.listAttendees('event-1', { page: 1, limit: 20 }, currentUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(rsvpRepository.listAttendees).not.toHaveBeenCalled();
    });

    it('returns paginated attendees with metadata for the event creator', async () => {
      eventsRepository.findById.mockResolvedValue({
        createdBy: currentUser.id,
      } as never);
      rsvpRepository.listAttendees.mockResolvedValue([
        {
          ...buildAttendee(),
          user: { id: 'user-1', name: 'Alice', email: 'alice@example.com' },
        },
      ]);
      eventsRepository.countAttendees.mockResolvedValue(41);

      const result = await service.listAttendees(
        'event-1',
        { page: 2, limit: 20 },
        currentUser,
      );

      expect(result.meta).toEqual({
        page: 2,
        limit: 20,
        total: 41,
        totalPages: 3,
      });
      expect(result.data[0].user).not.toHaveProperty('passwordHash');
    });
  });
});
