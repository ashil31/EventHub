import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

/**
 * Integration tests against a REAL PostgreSQL database (the same one local
 * development uses via `docker compose up -d`) — not a mock. This suite
 * truncates the users/events/event_attendees tables before every test, so
 * it must never be pointed at a shared or production database. It proves
 * the constraints Prisma migrations created actually behave as designed:
 * uniqueness, foreign keys, cascade/restrict delete behavior, and the
 * CHECK constraint on capacity.
 *
 * Run with `npm run test:db` (separate from `npm test`/`test:e2e` so the
 * default suites stay fast and don't require a live database).
 */
describe('Database constraints (integration)', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
  });

  afterAll(async () => {
    // Leave the database clean — this suite must never leave rows behind
    // in the shared dev database after a run.
    await prisma.eventAttendee.deleteMany();
    await prisma.event.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.eventAttendee.deleteMany();
    await prisma.event.deleteMany();
    await prisma.user.deleteMany();
  });

  const future = (hoursFromNow: number): Date =>
    new Date(Date.now() + hoursFromNow * 3_600_000);

  const createUser = (email: string) =>
    prisma.user.create({
      data: { name: 'Test User', email, passwordHash: 'not-a-real-hash' },
    });

  it('connects to PostgreSQL', async () => {
    const result = await prisma.$queryRaw<
      Array<{ ok: number }>
    >`SELECT 1 as ok`;
    expect(result[0]?.ok).toBe(1);
  });

  it('enforces unique user email', async () => {
    await createUser('duplicate@eventhub.test');

    await expect(createUser('duplicate@eventhub.test')).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  it('enforces the events.createdBy foreign key', async () => {
    await expect(
      prisma.event.create({
        data: {
          title: 'Orphan event',
          location: 'Nowhere',
          startsAt: future(1),
          endsAt: future(2),
          capacity: 10,
          createdBy: '00000000-0000-0000-0000-000000000000',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('enforces capacity > 0 at the database level (CHECK constraint)', async () => {
    const owner = await createUser('owner-capacity@eventhub.test');

    await expect(
      prisma.event.create({
        data: {
          title: 'Zero capacity event',
          location: 'Somewhere',
          startsAt: future(1),
          endsAt: future(2),
          capacity: 0,
          createdBy: owner.id,
        },
      }),
    ).rejects.toThrow();
  });

  it('enforces event_attendees foreign keys', async () => {
    const user = await createUser('fk-attendee@eventhub.test');

    await expect(
      prisma.eventAttendee.create({
        data: {
          eventId: '00000000-0000-0000-0000-000000000000',
          userId: user.id,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('enforces unique(eventId, userId) — prevents duplicate RSVP', async () => {
    const user = await createUser('duplicate-rsvp@eventhub.test');
    const event = await prisma.event.create({
      data: {
        title: 'Event',
        location: 'Venue',
        startsAt: future(1),
        endsAt: future(2),
        capacity: 5,
        createdBy: user.id,
      },
    });

    await prisma.eventAttendee.create({
      data: { eventId: event.id, userId: user.id },
    });

    await expect(
      prisma.eventAttendee.create({
        data: { eventId: event.id, userId: user.id },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('cascades: deleting an event removes its attendee rows', async () => {
    const user = await createUser('cascade-event@eventhub.test');
    const event = await prisma.event.create({
      data: {
        title: 'Event',
        location: 'Venue',
        startsAt: future(1),
        endsAt: future(2),
        capacity: 5,
        createdBy: user.id,
      },
    });
    await prisma.eventAttendee.create({
      data: { eventId: event.id, userId: user.id },
    });

    await prisma.event.delete({ where: { id: event.id } });

    const remaining = await prisma.eventAttendee.findMany({
      where: { eventId: event.id },
    });
    expect(remaining).toHaveLength(0);
  });

  it('restricts: deleting a user who has created events fails', async () => {
    const owner = await createUser('restrict-owner@eventhub.test');
    await prisma.event.create({
      data: {
        title: 'Event',
        location: 'Venue',
        startsAt: future(1),
        endsAt: future(2),
        capacity: 5,
        createdBy: owner.id,
      },
    });

    await expect(
      prisma.user.delete({ where: { id: owner.id } }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('cascades: deleting an attending user removes their attendee rows (not the event)', async () => {
    const owner = await createUser('cascade-owner@eventhub.test');
    const attendee = await createUser('cascade-attendee@eventhub.test');
    const event = await prisma.event.create({
      data: {
        title: 'Event',
        location: 'Venue',
        startsAt: future(1),
        endsAt: future(2),
        capacity: 5,
        createdBy: owner.id,
      },
    });
    await prisma.eventAttendee.create({
      data: { eventId: event.id, userId: attendee.id },
    });

    await prisma.user.delete({ where: { id: attendee.id } });

    const remainingAttendance = await prisma.eventAttendee.findMany({
      where: { userId: attendee.id },
    });
    expect(remainingAttendance).toHaveLength(0);

    const eventStillExists = await prisma.event.findUnique({
      where: { id: event.id },
    });
    expect(eventStillExists).not.toBeNull();
  });

  it('supports locking an event row inside a transaction (the RSVP concurrency primitive)', async () => {
    const user = await createUser('lock-primitive@eventhub.test');
    const event = await prisma.event.create({
      data: {
        title: 'Event',
        location: 'Venue',
        startsAt: future(1),
        endsAt: future(2),
        capacity: 1,
        createdBy: user.id,
      },
    });

    // Not the RSVP endpoint itself (that's a later phase) — this proves the
    // schema and Prisma's $transaction support the exact primitive the
    // future RSVP implementation depends on: locking the event row, then
    // reading/writing within the same transaction.
    const result = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        Array<{ id: string; capacity: number }>
      >`SELECT id, capacity FROM events WHERE id = ${event.id}::uuid FOR UPDATE`;
      const attendeeCount = await tx.eventAttendee.count({
        where: { eventId: event.id },
      });
      return { locked: locked[0], attendeeCount };
    });

    expect(result.locked?.id).toBe(event.id);
    expect(result.locked?.capacity).toBe(1);
    expect(result.attendeeCount).toBe(0);
  });
});
