import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';

interface EventResponseBody {
  id: string;
  capacity: number;
  attendeeCount: number;
  availableSpots: number;
  startsAt: string;
}

interface RsvpResponseBody {
  message: string;
  eventId: string;
  userId: string;
  joinedAt: string;
  attendeeCount: number;
  capacity: number;
  availableSpots: number;
}

interface AttendeesResponseBody {
  data: Array<{
    user: { id: string; name: string; email: string };
    joinedAt: string;
  }>;
  meta: { page: number; limit: number; total: number; totalPages: number };
}

/**
 * RSVP + concurrency tests against a real Postgres instance and the real
 * HTTP stack. This is the correctness-critical suite for the whole
 * project — see docs/specs/phase-5-rsvp.md for the design these tests
 * verify.
 */
describe('RSVP (e2e)', () => {
  let app: INestApplication;
  let httpServer: App;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const EMAIL_DOMAIN = 'eventhub-rsvp-e2e.test';
  let emailCounter = 0;
  const uniqueEmail = (label: string): string =>
    `${label}-${Date.now()}-${emailCounter++}-${Math.random().toString(36).slice(2)}@${EMAIL_DOMAIN}`;

  // Argon2 hashing is deliberately not free — reuse one precomputed hash
  // for every fast-path test user instead of hashing per user. Password
  // content is irrelevant to these tests (auth.e2e-spec.ts already
  // thoroughly covers real registration/hashing); this suite is about the
  // RSVP endpoint's behavior under real concurrent HTTP requests, so user
  // setup is fast-pathed while the actual RSVP calls remain real HTTP
  // requests through the real Nest app.
  let sharedPasswordHash: string;

  const createUser = async (
    label: string,
  ): Promise<{ userId: string; token: string }> => {
    const user = await prisma.user.create({
      data: {
        name: label,
        email: uniqueEmail(label),
        passwordHash: sharedPasswordHash,
      },
    });
    const token = jwtService.sign({ sub: user.id });
    return { userId: user.id, token };
  };

  const createUsers = (label: string, count: number) =>
    Promise.all(
      Array.from({ length: count }, (_, i) => createUser(`${label}-${i}`)),
    );

  const futureIso = (hoursFromNow: number): string =>
    new Date(Date.now() + hoursFromNow * 3_600_000).toISOString();

  const createEvent = async (
    ownerToken: string,
    overrides: Record<string, unknown> = {},
  ): Promise<EventResponseBody> => {
    const response = await request(httpServer)
      .post('/api/v1/events')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        title: 'RSVP Test Event',
        location: 'Ahmedabad',
        startsAt: futureIso(24),
        endsAt: futureIso(27),
        capacity: 10,
        ...overrides,
      });
    return response.body as EventResponseBody;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
    httpServer = app.getHttpServer() as App;
    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);

    sharedPasswordHash = await argon2.hash('shared-test-password');
  });

  afterAll(async () => {
    await prisma.event.deleteMany({
      where: { creator: { email: { endsWith: `@${EMAIL_DOMAIN}` } } },
    });
    await prisma.user.deleteMany({
      where: { email: { endsWith: `@${EMAIL_DOMAIN}` } },
    });
    await app.close();
  });

  describe('GET /api/v1/events/:id/rsvp — status', () => {
    it('requires authentication', async () => {
      const owner = await createUser('status-noauth-owner');
      const event = await createEvent(owner.token);

      const response = await request(httpServer).get(
        `/api/v1/events/${event.id}/rsvp`,
      );
      expect(response.status).toBe(401);
    });

    it('returns attending: false before joining', async () => {
      const owner = await createUser('status-notyet-owner');
      const user = await createUser('status-notyet-user');
      const event = await createEvent(owner.token);

      const response = await request(httpServer)
        .get(`/api/v1/events/${event.id}/rsvp`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ attending: false, joinedAt: null });
    });

    it('returns attending: true with joinedAt after joining', async () => {
      const owner = await createUser('status-joined-owner');
      const user = await createUser('status-joined-user');
      const event = await createEvent(owner.token);

      await request(httpServer)
        .post(`/api/v1/events/${event.id}/rsvp`)
        .set('Authorization', `Bearer ${user.token}`);

      const response = await request(httpServer)
        .get(`/api/v1/events/${event.id}/rsvp`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(response.status).toBe(200);
      const body = response.body as { attending: boolean; joinedAt: string };
      expect(body.attending).toBe(true);
      expect(typeof body.joinedAt).toBe('string');
    });

    it('returns attending: false again after cancelling', async () => {
      const owner = await createUser('status-cancelled-owner');
      const user = await createUser('status-cancelled-user');
      const event = await createEvent(owner.token);

      await request(httpServer)
        .post(`/api/v1/events/${event.id}/rsvp`)
        .set('Authorization', `Bearer ${user.token}`);
      await request(httpServer)
        .delete(`/api/v1/events/${event.id}/rsvp`)
        .set('Authorization', `Bearer ${user.token}`);

      const response = await request(httpServer)
        .get(`/api/v1/events/${event.id}/rsvp`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ attending: false, joinedAt: null });
    });

    it('returns 404 for a nonexistent event', async () => {
      const user = await createUser('status-missing-event');
      const response = await request(httpServer)
        .get('/api/v1/events/00000000-0000-0000-0000-000000000000/rsvp')
        .set('Authorization', `Bearer ${user.token}`);
      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/v1/events/:id/rsvp — basic flow', () => {
    it('requires authentication', async () => {
      const owner = await createUser('rsvp-noauth-owner');
      const event = await createEvent(owner.token);

      const response = await request(httpServer).post(
        `/api/v1/events/${event.id}/rsvp`,
      );
      expect(response.status).toBe(401);
    });

    it('succeeds and returns authoritative counts (201)', async () => {
      const owner = await createUser('rsvp-success-owner');
      const attendee = await createUser('rsvp-success-attendee');
      const event = await createEvent(owner.token, { capacity: 100 });

      const response = await request(httpServer)
        .post(`/api/v1/events/${event.id}/rsvp`)
        .set('Authorization', `Bearer ${attendee.token}`);

      expect(response.status).toBe(201);
      const body = response.body as RsvpResponseBody;
      expect(body.eventId).toBe(event.id);
      expect(body.userId).toBe(attendee.userId);
      expect(body.attendeeCount).toBe(1);
      expect(body.capacity).toBe(100);
      expect(body.availableSpots).toBe(99);
    });

    it('ignores a userId in the body — identity comes only from the JWT', async () => {
      const owner = await createUser('rsvp-spoof-owner');
      const attacker = await createUser('rsvp-spoof-attacker');
      const victim = await createUser('rsvp-spoof-victim');
      const event = await createEvent(owner.token);

      // The route has no @Body() binding at all (Phase 5 §4 — RSVP takes
      // no request body), so there's nothing for the ValidationPipe to
      // reject; the body is simply never read by the handler. The real
      // security property is that the RSVP is attributed to whoever the
      // JWT identifies (the attacker), never to the spoofed id.
      const response = await request(httpServer)
        .post(`/api/v1/events/${event.id}/rsvp`)
        .set('Authorization', `Bearer ${attacker.token}`)
        .send({ userId: victim.userId });

      expect(response.status).toBe(201);
      expect((response.body as RsvpResponseBody).userId).toBe(attacker.userId);

      const victimAttendance = await prisma.eventAttendee.findUnique({
        where: { eventId_userId: { eventId: event.id, userId: victim.userId } },
      });
      expect(victimAttendance).toBeNull();

      const attackerAttendance = await prisma.eventAttendee.findUnique({
        where: {
          eventId_userId: { eventId: event.id, userId: attacker.userId },
        },
      });
      expect(attackerAttendance).not.toBeNull();
    });

    it('rejects a duplicate RSVP with 409 and a safe message', async () => {
      const owner = await createUser('rsvp-dup-owner');
      const attendee = await createUser('rsvp-dup-attendee');
      const event = await createEvent(owner.token);

      const first = await request(httpServer)
        .post(`/api/v1/events/${event.id}/rsvp`)
        .set('Authorization', `Bearer ${attendee.token}`);
      expect(first.status).toBe(201);

      const second = await request(httpServer)
        .post(`/api/v1/events/${event.id}/rsvp`)
        .set('Authorization', `Bearer ${attendee.token}`);
      expect(second.status).toBe(409);
      expect((second.body as { message: string }).message).toMatch(
        /already RSVP/,
      );
    });

    it('rejects RSVP for a nonexistent event with 404', async () => {
      const user = await createUser('rsvp-missing-event');
      const response = await request(httpServer)
        .post('/api/v1/events/00000000-0000-0000-0000-000000000000/rsvp')
        .set('Authorization', `Bearer ${user.token}`);
      expect(response.status).toBe(404);
    });

    it('rejects a malformed event id with 400', async () => {
      const user = await createUser('rsvp-bad-id');
      const response = await request(httpServer)
        .post('/api/v1/events/not-a-uuid/rsvp')
        .set('Authorization', `Bearer ${user.token}`);
      expect(response.status).toBe(400);
    });

    it('rejects RSVP for a full event with 409 and inserts nothing', async () => {
      const owner = await createUser('rsvp-full-owner');
      const event = await createEvent(owner.token, { capacity: 1 });
      const first = await createUser('rsvp-full-first');
      const second = await createUser('rsvp-full-second');

      const firstResponse = await request(httpServer)
        .post(`/api/v1/events/${event.id}/rsvp`)
        .set('Authorization', `Bearer ${first.token}`);
      expect(firstResponse.status).toBe(201);

      const secondResponse = await request(httpServer)
        .post(`/api/v1/events/${event.id}/rsvp`)
        .set('Authorization', `Bearer ${second.token}`);
      expect(secondResponse.status).toBe(409);
      expect((secondResponse.body as { message: string }).message).toMatch(
        /full/i,
      );

      const count = await prisma.eventAttendee.count({
        where: { eventId: event.id },
      });
      expect(count).toBe(1);
    });

    it('rejects RSVP for an event that has already started', async () => {
      const owner = await createUser('rsvp-started-owner');
      // Create with a valid future start, then move it into the past
      // directly (EventsService itself refuses to create/patch into the
      // past) — this reflects real passage of time for an event whose
      // start has now elapsed.
      const event = await createEvent(owner.token);
      await prisma.event.update({
        where: { id: event.id },
        data: { startsAt: new Date(Date.now() - 3_600_000) },
      });

      const attendee = await createUser('rsvp-started-attendee');
      const response = await request(httpServer)
        .post(`/api/v1/events/${event.id}/rsvp`)
        .set('Authorization', `Bearer ${attendee.token}`);

      expect(response.status).toBe(409);
      expect((response.body as { message: string }).message).toMatch(
        /already started/,
      );
    });
  });

  describe('DELETE /api/v1/events/:id/rsvp', () => {
    it('requires authentication', async () => {
      const owner = await createUser('cancel-noauth-owner');
      const event = await createEvent(owner.token);
      const response = await request(httpServer).delete(
        `/api/v1/events/${event.id}/rsvp`,
      );
      expect(response.status).toBe(401);
    });

    it('cancels successfully with 204 and frees the spot', async () => {
      const owner = await createUser('cancel-success-owner');
      const attendee = await createUser('cancel-success-attendee');
      const event = await createEvent(owner.token, { capacity: 1 });

      await request(httpServer)
        .post(`/api/v1/events/${event.id}/rsvp`)
        .set('Authorization', `Bearer ${attendee.token}`);

      const cancelResponse = await request(httpServer)
        .delete(`/api/v1/events/${event.id}/rsvp`)
        .set('Authorization', `Bearer ${attendee.token}`);
      expect(cancelResponse.status).toBe(204);

      // The freed spot can be taken by someone else.
      const another = await createUser('cancel-success-another');
      const rsvpAgain = await request(httpServer)
        .post(`/api/v1/events/${event.id}/rsvp`)
        .set('Authorization', `Bearer ${another.token}`);
      expect(rsvpAgain.status).toBe(201);
    });

    it('returns 404 when the user is not attending', async () => {
      const owner = await createUser('cancel-notattending-owner');
      const user = await createUser('cancel-notattending-user');
      const event = await createEvent(owner.token);

      const response = await request(httpServer)
        .delete(`/api/v1/events/${event.id}/rsvp`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(response.status).toBe(404);
      expect((response.body as { message: string }).message).toMatch(
        /not attending/,
      );
    });

    it('returns 404 for a nonexistent event', async () => {
      const user = await createUser('cancel-missing-event');
      const response = await request(httpServer)
        .delete('/api/v1/events/00000000-0000-0000-0000-000000000000/rsvp')
        .set('Authorization', `Bearer ${user.token}`);
      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/v1/events/:id/attendees', () => {
    it('requires authentication', async () => {
      const owner = await createUser('attendees-noauth-owner');
      const event = await createEvent(owner.token);
      const response = await request(httpServer).get(
        `/api/v1/events/${event.id}/attendees`,
      );
      expect(response.status).toBe(401);
    });

    it('returns 404 for a nonexistent event', async () => {
      const user = await createUser('attendees-missing-event');
      const response = await request(httpServer)
        .get('/api/v1/events/00000000-0000-0000-0000-000000000000/attendees')
        .set('Authorization', `Bearer ${user.token}`);
      expect(response.status).toBe(404);
    });

    it('rejects a limit above the maximum, same pagination convention as Events', async () => {
      const owner = await createUser('attendees-badlimit-owner');
      const event = await createEvent(owner.token);
      const response = await request(httpServer)
        .get(`/api/v1/events/${event.id}/attendees?limit=1000`)
        .set('Authorization', `Bearer ${owner.token}`);
      expect(response.status).toBe(400);
    });

    it('lists attendees ordered by joinedAt ascending, with counts and no passwordHash', async () => {
      const owner = await createUser('attendees-list-owner');
      const event = await createEvent(owner.token, { capacity: 10 });
      const first = await createUser('attendees-list-first');
      const second = await createUser('attendees-list-second');

      await request(httpServer)
        .post(`/api/v1/events/${event.id}/rsvp`)
        .set('Authorization', `Bearer ${first.token}`);
      await new Promise((resolve) => setTimeout(resolve, 20));
      await request(httpServer)
        .post(`/api/v1/events/${event.id}/rsvp`)
        .set('Authorization', `Bearer ${second.token}`);

      const requester = await createUser('attendees-list-requester');
      const response = await request(httpServer)
        .get(`/api/v1/events/${event.id}/attendees`)
        .set('Authorization', `Bearer ${requester.token}`);

      expect(response.status).toBe(200);
      const body = response.body as AttendeesResponseBody;
      expect(body.meta.total).toBe(2);
      expect(body.data.map((a) => a.user.id)).toEqual([
        first.userId,
        second.userId,
      ]);
      expect(JSON.stringify(body)).not.toMatch(/passwordHash/);
    });

    it('paginates attendees using database-level skip/take', async () => {
      const owner = await createUser('attendees-page-owner');
      const event = await createEvent(owner.token, { capacity: 30 });
      const attendees = await createUsers('attendees-page', 25);

      // Sequential on purpose: this test verifies pagination/ordering, not
      // concurrency (that's covered separately below).
      for (const a of attendees) {
        await request(httpServer)
          .post(`/api/v1/events/${event.id}/rsvp`)
          .set('Authorization', `Bearer ${a.token}`);
      }

      const page1 = await request(httpServer)
        .get(`/api/v1/events/${event.id}/attendees?page=1&limit=10`)
        .set('Authorization', `Bearer ${owner.token}`);
      const page2 = await request(httpServer)
        .get(`/api/v1/events/${event.id}/attendees?page=2&limit=10`)
        .set('Authorization', `Bearer ${owner.token}`);
      const page3 = await request(httpServer)
        .get(`/api/v1/events/${event.id}/attendees?page=3&limit=10`)
        .set('Authorization', `Bearer ${owner.token}`);

      const p1 = page1.body as AttendeesResponseBody;
      const p2 = page2.body as AttendeesResponseBody;
      const p3 = page3.body as AttendeesResponseBody;

      expect(p1.data).toHaveLength(10);
      expect(p2.data).toHaveLength(10);
      expect(p3.data).toHaveLength(5);
      expect(p1.meta).toEqual({ page: 1, limit: 10, total: 25, totalPages: 3 });

      // No overlap between pages.
      const allIds = [...p1.data, ...p2.data, ...p3.data].map((a) => a.user.id);
      expect(new Set(allIds).size).toBe(25);
    }, 30000);
  });

  describe('Event responses show attendeeCount/availableSpots', () => {
    it('GET /events/:id reflects the current attendee count', async () => {
      const owner = await createUser('eventcount-owner');
      const attendee = await createUser('eventcount-attendee');
      const event = await createEvent(owner.token, { capacity: 5 });

      await request(httpServer)
        .post(`/api/v1/events/${event.id}/rsvp`)
        .set('Authorization', `Bearer ${attendee.token}`);

      const response = await request(httpServer).get(
        `/api/v1/events/${event.id}`,
      );
      const body = response.body as EventResponseBody;
      expect(body.attendeeCount).toBe(1);
      expect(body.availableSpots).toBe(4);
    });
  });

  describe('Event deletion cascades to attendees (Phase 2 FK, re-verified with real RSVPs)', () => {
    it('deleting an event removes its EventAttendee rows via ON DELETE CASCADE', async () => {
      const owner = await createUser('cascade-owner');
      const attendee = await createUser('cascade-attendee');
      const event = await createEvent(owner.token);

      await request(httpServer)
        .post(`/api/v1/events/${event.id}/rsvp`)
        .set('Authorization', `Bearer ${attendee.token}`);

      const beforeCount = await prisma.eventAttendee.count({
        where: { eventId: event.id },
      });
      expect(beforeCount).toBe(1);

      const deleteResponse = await request(httpServer)
        .delete(`/api/v1/events/${event.id}`)
        .set('Authorization', `Bearer ${owner.token}`);
      expect(deleteResponse.status).toBe(204);

      const afterCount = await prisma.eventAttendee.count({
        where: { eventId: event.id },
      });
      expect(afterCount).toBe(0);
    });
  });

  describe('Capacity update vs. attendee count', () => {
    it('rejects reducing capacity below the current attendee count', async () => {
      const owner = await createUser('capreduce-owner');
      const event = await createEvent(owner.token, { capacity: 100 });
      const attendees = await createUsers('capreduce', 5);
      for (const a of attendees) {
        await request(httpServer)
          .post(`/api/v1/events/${event.id}/rsvp`)
          .set('Authorization', `Bearer ${a.token}`);
      }

      const response = await request(httpServer)
        .patch(`/api/v1/events/${event.id}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ capacity: 3 });

      expect(response.status).toBe(409);

      const unchanged = await request(httpServer).get(
        `/api/v1/events/${event.id}`,
      );
      expect((unchanged.body as EventResponseBody).capacity).toBe(100);
    }, 20000);

    it('allows reducing capacity to exactly the current attendee count', async () => {
      const owner = await createUser('capexact-owner');
      const event = await createEvent(owner.token, { capacity: 100 });
      const attendees = await createUsers('capexact', 5);
      for (const a of attendees) {
        await request(httpServer)
          .post(`/api/v1/events/${event.id}/rsvp`)
          .set('Authorization', `Bearer ${a.token}`);
      }

      const response = await request(httpServer)
        .patch(`/api/v1/events/${event.id}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ capacity: 5 });

      expect(response.status).toBe(200);
      expect((response.body as EventResponseBody).capacity).toBe(5);
    }, 20000);
  });

  // ---------------------------------------------------------------------
  // Mandatory concurrency tests (Phase 5 §14/§15/§47/§48/§49/§50/§61).
  // Every RSVP call in this block fires via Promise.all — genuinely
  // concurrent HTTP requests against the real app and real Postgres, not
  // sequential awaits.
  // ---------------------------------------------------------------------
  describe('Concurrency — the critical correctness tests', () => {
    it('capacity=1, 20 concurrent users -> exactly 1 success, 19 conflicts, DB count=1', async () => {
      const owner = await createUser('conc-cap1-owner');
      const event = await createEvent(owner.token, { capacity: 1 });
      const users = await createUsers('conc-cap1-user', 20);

      const responses = await Promise.all(
        users.map((u) =>
          request(httpServer)
            .post(`/api/v1/events/${event.id}/rsvp`)
            .set('Authorization', `Bearer ${u.token}`),
        ),
      );

      const succeeded = responses.filter((r) => r.status === 201);
      const conflicted = responses.filter((r) => r.status === 409);

      expect(succeeded).toHaveLength(1);
      expect(conflicted).toHaveLength(19);

      const dbCount = await prisma.eventAttendee.count({
        where: { eventId: event.id },
      });
      expect(dbCount).toBe(1);
    }, 30000);

    it('capacity=10, 50 concurrent users -> exactly 10 successes, DB count=10', async () => {
      const owner = await createUser('conc-cap10-owner');
      const event = await createEvent(owner.token, { capacity: 10 });
      const users = await createUsers('conc-cap10-user', 50);

      const responses = await Promise.all(
        users.map((u) =>
          request(httpServer)
            .post(`/api/v1/events/${event.id}/rsvp`)
            .set('Authorization', `Bearer ${u.token}`),
        ),
      );

      const succeeded = responses.filter((r) => r.status === 201);
      const conflicted = responses.filter((r) => r.status === 409);

      expect(succeeded).toHaveLength(10);
      expect(conflicted).toHaveLength(40);

      const dbCount = await prisma.eventAttendee.count({
        where: { eventId: event.id },
      });
      expect(dbCount).toBe(10);
      expect(dbCount).toBeLessThanOrEqual(10);
    }, 30000);

    it('same user firing many concurrent RSVPs -> exactly 1 succeeds, DB count=1', async () => {
      const owner = await createUser('conc-dup-owner');
      const event = await createEvent(owner.token, { capacity: 50 });
      const user = await createUser('conc-dup-user');

      const responses = await Promise.all(
        Array.from({ length: 15 }, () =>
          request(httpServer)
            .post(`/api/v1/events/${event.id}/rsvp`)
            .set('Authorization', `Bearer ${user.token}`),
        ),
      );

      const succeeded = responses.filter((r) => r.status === 201);
      const conflicted = responses.filter((r) => r.status === 409);

      expect(succeeded).toHaveLength(1);
      expect(conflicted).toHaveLength(14);

      const dbCount = await prisma.eventAttendee.count({
        where: { eventId: event.id, userId: user.userId },
      });
      expect(dbCount).toBe(1);
    }, 30000);

    it('capacity=1: User A and User B both fire concurrent RSVPs -> exactly 1 attendee total, ever', async () => {
      const owner = await createUser('conc-race-owner');
      const event = await createEvent(owner.token, { capacity: 1 });
      const userA = await createUser('conc-race-a');
      const userB = await createUser('conc-race-b');

      const requestsA = Array.from({ length: 10 }, () =>
        request(httpServer)
          .post(`/api/v1/events/${event.id}/rsvp`)
          .set('Authorization', `Bearer ${userA.token}`),
      );
      const requestsB = Array.from({ length: 10 }, () =>
        request(httpServer)
          .post(`/api/v1/events/${event.id}/rsvp`)
          .set('Authorization', `Bearer ${userB.token}`),
      );

      // Interleaved in one Promise.all — genuinely concurrent across both
      // users, not "all of A's then all of B's".
      const responses = await Promise.all([...requestsA, ...requestsB]);

      const succeeded = responses.filter((r) => r.status === 201);
      expect(succeeded).toHaveLength(1);

      const dbCount = await prisma.eventAttendee.count({
        where: { eventId: event.id },
      });
      expect(dbCount).toBe(1);
    }, 30000);

    it('capacity update racing a concurrent RSVP never results in attendees > capacity', async () => {
      const owner = await createUser('conc-caprace-owner');
      const event = await createEvent(owner.token, { capacity: 100 });

      // Arrange 99 existing attendees directly (the mechanism of arranging
      // this baseline isn't what's under test here — the race between the
      // 100th RSVP and the capacity reduction is).
      const fillerUsers = await createUsers('conc-caprace-filler', 99);
      await prisma.eventAttendee.createMany({
        data: fillerUsers.map((u) => ({ eventId: event.id, userId: u.userId })),
      });

      const lastUser = await createUser('conc-caprace-last');

      const [patchResponse, rsvpResponse] = await Promise.all([
        request(httpServer)
          .patch(`/api/v1/events/${event.id}`)
          .set('Authorization', `Bearer ${owner.token}`)
          .send({ capacity: 50 }),
        request(httpServer)
          .post(`/api/v1/events/${event.id}/rsvp`)
          .set('Authorization', `Bearer ${lastUser.token}`),
      ]);

      // Exactly one of the two must have been rejected (409) -- the row
      // lock serializes them, so both can never fully succeed against
      // each other (patch success requires attendees<=newCapacity; RSVP
      // success requires attendees<capacity at the time it runs). Which
      // one wins is a legitimate race outcome that depends on connection
      // pool / event loop timing, not something this test should assume
      // -- only the invariant below is guaranteed.
      const statuses = [patchResponse.status, rsvpResponse.status];
      expect(statuses).toContain(409);
      expect(statuses.filter((s) => s === 409)).toHaveLength(1);
      const successStatus = statuses.find((s) => s !== 409);
      expect([200, 201]).toContain(successStatus);

      const finalEvent = await prisma.event.findUniqueOrThrow({
        where: { id: event.id },
      });
      const finalAttendeeCount = await prisma.eventAttendee.count({
        where: { eventId: event.id },
      });

      // The invariant that actually matters, regardless of which request
      // "won" the race:
      expect(finalAttendeeCount).toBeLessThanOrEqual(finalEvent.capacity);
    }, 30000);

    it('cancelling an RSVP racing a concurrent rejoin never leaves duplicate attendee rows (Phase 8)', async () => {
      const owner = await createUser('conc-cancelrace-owner');
      const user = await createUser('conc-cancelrace-user');

      // A single concurrent pair might not exercise every interleaving —
      // Node's event loop and the connection pool can happen to serialize
      // two "concurrent" requests anyway. Repeating across independent
      // events increases confidence the invariant holds regardless of
      // which order Postgres actually processes the two requests in.
      for (let i = 0; i < 10; i++) {
        const event = await createEvent(owner.token, { capacity: 10 });
        await request(httpServer)
          .post(`/api/v1/events/${event.id}/rsvp`)
          .set('Authorization', `Bearer ${user.token}`);

        const [cancelResponse, rejoinResponse] = await Promise.all([
          request(httpServer)
            .delete(`/api/v1/events/${event.id}/rsvp`)
            .set('Authorization', `Bearer ${user.token}`),
          request(httpServer)
            .post(`/api/v1/events/${event.id}/rsvp`)
            .set('Authorization', `Bearer ${user.token}`),
        ]);

        // Either response can legitimately land in more than one state
        // depending on timing (204 or 404 for cancel; 201 or 409 for
        // rejoin) — the API intentionally permits either outcome; this
        // test does not assume a winner.
        expect([204, 404]).toContain(cancelResponse.status);
        expect([201, 409]).toContain(rejoinResponse.status);

        // The invariant that actually matters, regardless of ordering:
        // never more than one row for this (event, user) pair. The
        // UNIQUE(eventId, userId) constraint is what guarantees this at
        // the database level even under a genuine race.
        const dbCount = await prisma.eventAttendee.count({
          where: { eventId: event.id, userId: user.userId },
        });
        expect(dbCount).toBeLessThanOrEqual(1);
      }
    }, 30000);

    it('deleting an event racing a concurrent RSVP never leaves an orphaned attendee row (Phase 8)', async () => {
      const owner = await createUser('conc-delrace-owner');

      for (let i = 0; i < 10; i++) {
        const event = await createEvent(owner.token, { capacity: 10 });
        const joiner = await createUser(`conc-delrace-joiner-${i}`);

        const [deleteResponse, rsvpResponse] = await Promise.all([
          request(httpServer)
            .delete(`/api/v1/events/${event.id}`)
            .set('Authorization', `Bearer ${owner.token}`),
          request(httpServer)
            .post(`/api/v1/events/${event.id}/rsvp`)
            .set('Authorization', `Bearer ${joiner.token}`),
        ]);

        // The event is always the owner's own, valid event — deletion
        // itself never fails; Postgres's row lock on the events row just
        // makes DELETE wait its turn against a concurrent RSVP
        // transaction that already holds `SELECT ... FOR UPDATE` on the
        // same row, rather than the two operations racing unsafely.
        expect(deleteResponse.status).toBe(204);
        // Whichever the database serialized first: either the RSVP
        // transaction committed before the delete could acquire the row
        // (in which case ON DELETE CASCADE removes the just-created
        // attendee row as part of the delete), or the delete removed the
        // event before the RSVP transaction's row lock could even be
        // acquired (in which case RSVP correctly reports "not found").
        expect([201, 404]).toContain(rsvpResponse.status);

        const eventStillExists = await prisma.event.findUnique({
          where: { id: event.id },
        });
        expect(eventStillExists).toBeNull();

        // The actual invariant: no orphaned attendee row survives,
        // regardless of which request the database processed first.
        const orphanedAttendees = await prisma.eventAttendee.count({
          where: { eventId: event.id },
        });
        expect(orphanedAttendees).toBe(0);
      }
    }, 30000);
  });
});
