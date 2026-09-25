import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';

interface UserResponseBody {
  id: string;
  name: string;
  email: string;
}

interface LoginResponseBody {
  accessToken: string;
  user: UserResponseBody;
}

interface EventResponseBody {
  id: string;
  title: string;
  description: string | null;
  location: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  createdBy: UserResponseBody;
  createdAt: string;
  updatedAt: string;
}

interface PaginatedEventsBody {
  data: EventResponseBody[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

/**
 * Full Events CRUD + authorization flow against a real Postgres instance
 * and the real HTTP stack. Test users/events are tagged so cleanup can
 * target exactly (and only) what this suite created.
 */
describe('Events (e2e)', () => {
  let app: INestApplication;
  let httpServer: App;
  let prisma: PrismaService;

  const EMAIL_DOMAIN = 'eventhub-events-e2e.test';
  const uniqueEmail = (label: string): string =>
    `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@${EMAIL_DOMAIN}`;

  const registerAndLogin = async (
    label: string,
  ): Promise<{ token: string; user: UserResponseBody }> => {
    const email = uniqueEmail(label);
    const password = 'a-secure-password';
    await request(httpServer)
      .post('/api/v1/auth/register')
      .send({ name: label, email, password });
    const loginResponse = await request(httpServer)
      .post('/api/v1/auth/login')
      .send({ email, password });
    const body = loginResponse.body as LoginResponseBody;
    return { token: body.accessToken, user: body.user };
  };

  const futureIso = (hoursFromNow: number): string =>
    new Date(Date.now() + hoursFromNow * 3_600_000).toISOString();

  const validEventPayload = (overrides: Record<string, unknown> = {}) => ({
    title: 'Backend Engineering Meetup',
    description: 'A meetup for backend engineers.',
    location: 'Ahmedabad',
    startsAt: futureIso(24),
    endsAt: futureIso(27),
    capacity: 100,
    ...overrides,
  });

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

  describe('POST /api/v1/events', () => {
    it('requires authentication', async () => {
      const response = await request(httpServer)
        .post('/api/v1/events')
        .send(validEventPayload());
      expect(response.status).toBe(401);
    });

    it('creates an event for the authenticated user and derives createdBy from the JWT', async () => {
      const { token, user } = await registerAndLogin('creator-basic');

      const response = await request(httpServer)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${token}`)
        .send(validEventPayload());

      expect(response.status).toBe(201);
      const body = response.body as EventResponseBody;
      expect(body.createdBy).toEqual({
        id: user.id,
        name: user.name,
        email: user.email,
      });
      expect(body.title).toBe('Backend Engineering Meetup');
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('createdAt');
    });

    it('ignores a client-supplied createdBy — ownership cannot be spoofed', async () => {
      const { token, user } = await registerAndLogin('creator-spoof');
      const impostor = await registerAndLogin('creator-victim');

      const response = await request(httpServer)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${token}`)
        .send(validEventPayload({ createdBy: impostor.user.id }));

      // forbidNonWhitelisted rejects the whole request rather than
      // silently dropping the extra field.
      expect(response.status).toBe(400);
      expect(user).toBeDefined();
    });

    it('rejects an empty title with 400', async () => {
      const { token } = await registerAndLogin('creator-badtitle');
      const response = await request(httpServer)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${token}`)
        .send(validEventPayload({ title: '' }));
      expect(response.status).toBe(400);
    });

    it('rejects a zero/negative capacity with 400', async () => {
      const { token } = await registerAndLogin('creator-badcap');
      const zero = await request(httpServer)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${token}`)
        .send(validEventPayload({ capacity: 0 }));
      expect(zero.status).toBe(400);

      const negative = await request(httpServer)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${token}`)
        .send(validEventPayload({ capacity: -5 }));
      expect(negative.status).toBe(400);
    });

    it('rejects startsAt after endsAt with 400', async () => {
      const { token } = await registerAndLogin('creator-baddates');
      const response = await request(httpServer)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${token}`)
        .send(
          validEventPayload({ startsAt: futureIso(27), endsAt: futureIso(24) }),
        );
      expect(response.status).toBe(400);
    });

    it('rejects a startsAt in the past with 400', async () => {
      const { token } = await registerAndLogin('creator-past');
      const response = await request(httpServer)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${token}`)
        .send(
          validEventPayload({
            startsAt: new Date(Date.now() - 3_600_000).toISOString(),
          }),
        );
      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/v1/events', () => {
    it('is publicly accessible without a token', async () => {
      const response = await request(httpServer).get('/api/v1/events');
      expect(response.status).toBe(200);
      const body = response.body as PaginatedEventsBody;
      expect(body).toHaveProperty('data');
      expect(body).toHaveProperty('meta');
    });

    it('applies default pagination (page=1, limit=20)', async () => {
      const response = await request(httpServer).get('/api/v1/events');
      const body = response.body as PaginatedEventsBody;
      expect(body.meta.page).toBe(1);
      expect(body.meta.limit).toBe(20);
    });

    it('rejects a limit above the maximum', async () => {
      const response = await request(httpServer).get(
        '/api/v1/events?limit=1000',
      );
      expect(response.status).toBe(400);
    });

    it('rejects invalid pagination values', async () => {
      const response = await request(httpServer).get('/api/v1/events?page=0');
      expect(response.status).toBe(400);
    });

    it('finds events by search term across title/description/location', async () => {
      const { token } = await registerAndLogin('search-user');
      const unique = `Unsearchable${Date.now()}`;
      await request(httpServer)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${token}`)
        .send(validEventPayload({ title: `${unique} Conference` }));

      const response = await request(httpServer).get(
        `/api/v1/events?search=${unique}`,
      );
      const body = response.body as PaginatedEventsBody;
      expect(body.data.some((e) => e.title.includes(unique))).toBe(true);
    });

    it('filters by date range (from/to)', async () => {
      const response = await request(httpServer).get(
        `/api/v1/events?from=${futureIso(1000)}&to=${futureIso(1001)}`,
      );
      expect(response.status).toBe(200);
      const body = response.body as PaginatedEventsBody;
      expect(body.data).toHaveLength(0);
    });

    it('rejects from after to with 400', async () => {
      const response = await request(httpServer).get(
        `/api/v1/events?from=${futureIso(10)}&to=${futureIso(1)}`,
      );
      expect(response.status).toBe(400);
    });

    it('rejects an invalid date filter with 400', async () => {
      const response = await request(httpServer).get(
        '/api/v1/events?from=not-a-date',
      );
      expect(response.status).toBe(400);
    });

    it('orders upcoming events by startsAt ascending', async () => {
      const { token } = await registerAndLogin('order-user');
      const tag = `OrderTest${Date.now()}`;
      await request(httpServer)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${token}`)
        .send(
          validEventPayload({
            title: `${tag} B`,
            startsAt: futureIso(500),
            endsAt: futureIso(501),
          }),
        );
      await request(httpServer)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${token}`)
        .send(
          validEventPayload({
            title: `${tag} A`,
            startsAt: futureIso(400),
            endsAt: futureIso(401),
          }),
        );

      const response = await request(httpServer).get(
        `/api/v1/events?search=${tag}&limit=10`,
      );
      const body = response.body as PaginatedEventsBody;
      const titles = body.data.map((e) => e.title);
      expect(titles).toEqual([`${tag} A`, `${tag} B`]);
    });
  });

  describe('GET /api/v1/events/:id', () => {
    it('returns event details with a safe creator representation', async () => {
      const { token, user } = await registerAndLogin('getone-user');
      const created = await request(httpServer)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${token}`)
        .send(validEventPayload());
      const eventId = (created.body as EventResponseBody).id;

      const response = await request(httpServer).get(
        `/api/v1/events/${eventId}`,
      );

      expect(response.status).toBe(200);
      const body = response.body as EventResponseBody;
      expect(body.createdBy).toEqual({
        id: user.id,
        name: user.name,
        email: user.email,
      });
      expect(body.createdBy).not.toHaveProperty('passwordHash');
      expect(JSON.stringify(body)).not.toMatch(/passwordHash/);
    });

    it('returns 404 for a nonexistent event', async () => {
      const response = await request(httpServer).get(
        '/api/v1/events/00000000-0000-0000-0000-000000000000',
      );
      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /api/v1/events/:id (ownership)', () => {
    it('allows the creator to update', async () => {
      const { token } = await registerAndLogin('update-owner');
      const created = await request(httpServer)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${token}`)
        .send(validEventPayload());
      const eventId = (created.body as EventResponseBody).id;

      const response = await request(httpServer)
        .patch(`/api/v1/events/${eventId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ capacity: 150 });

      expect(response.status).toBe(200);
      expect((response.body as EventResponseBody).capacity).toBe(150);
    });

    it('rejects an unauthenticated update with 401', async () => {
      const { token } = await registerAndLogin('update-noauth');
      const created = await request(httpServer)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${token}`)
        .send(validEventPayload());
      const eventId = (created.body as EventResponseBody).id;

      const response = await request(httpServer)
        .patch(`/api/v1/events/${eventId}`)
        .send({ capacity: 150 });

      expect(response.status).toBe(401);
    });

    it('rejects a non-owner update with 403 — User A owns, User B is forbidden', async () => {
      const userA = await registerAndLogin('owner-a');
      const userB = await registerAndLogin('other-b');
      const created = await request(httpServer)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${userA.token}`)
        .send(validEventPayload());
      const eventId = (created.body as EventResponseBody).id;

      const response = await request(httpServer)
        .patch(`/api/v1/events/${eventId}`)
        .set('Authorization', `Bearer ${userB.token}`)
        .send({ capacity: 999 });

      expect(response.status).toBe(403);

      // Verify the event was NOT modified.
      const unchanged = await request(httpServer).get(
        `/api/v1/events/${eventId}`,
      );
      expect((unchanged.body as EventResponseBody).capacity).toBe(100);
    });

    it('returns 404 for a nonexistent event', async () => {
      const { token } = await registerAndLogin('update-missing');
      const response = await request(httpServer)
        .patch('/api/v1/events/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${token}`)
        .send({ capacity: 150 });
      expect(response.status).toBe(404);
    });

    it('applies a partial update without touching unspecified fields', async () => {
      const { token } = await registerAndLogin('update-partial');
      const created = await request(httpServer)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${token}`)
        .send(validEventPayload({ title: 'Original Title' }));
      const eventId = (created.body as EventResponseBody).id;

      const response = await request(httpServer)
        .patch(`/api/v1/events/${eventId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ capacity: 55 });

      const body = response.body as EventResponseBody;
      expect(body.title).toBe('Original Title');
      expect(body.capacity).toBe(55);
    });

    it('validates the final merged date state on partial update', async () => {
      const { token } = await registerAndLogin('update-dates');
      const created = await request(httpServer)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${token}`)
        .send(
          validEventPayload({ startsAt: futureIso(10), endsAt: futureIso(12) }),
        );
      const eventId = (created.body as EventResponseBody).id;

      // Patch only endsAt to before the EXISTING startsAt.
      const response = await request(httpServer)
        .patch(`/api/v1/events/${eventId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ endsAt: futureIso(5) });

      expect(response.status).toBe(400);
    });

    it('rejects an invalid capacity on update', async () => {
      const { token } = await registerAndLogin('update-badcap');
      const created = await request(httpServer)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${token}`)
        .send(validEventPayload());
      const eventId = (created.body as EventResponseBody).id;

      const response = await request(httpServer)
        .patch(`/api/v1/events/${eventId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ capacity: -1 });

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /api/v1/events/:id', () => {
    it('rejects an unauthenticated delete with 401', async () => {
      const { token } = await registerAndLogin('delete-noauth');
      const created = await request(httpServer)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${token}`)
        .send(validEventPayload());
      const eventId = (created.body as EventResponseBody).id;

      const response = await request(httpServer).delete(
        `/api/v1/events/${eventId}`,
      );
      expect(response.status).toBe(401);
    });

    it('rejects a non-owner delete with 403', async () => {
      const userA = await registerAndLogin('delete-owner-a');
      const userB = await registerAndLogin('delete-other-b');
      const created = await request(httpServer)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${userA.token}`)
        .send(validEventPayload());
      const eventId = (created.body as EventResponseBody).id;

      const response = await request(httpServer)
        .delete(`/api/v1/events/${eventId}`)
        .set('Authorization', `Bearer ${userB.token}`);
      expect(response.status).toBe(403);
    });

    it('returns 404 for a nonexistent event', async () => {
      const { token } = await registerAndLogin('delete-missing');
      const response = await request(httpServer)
        .delete('/api/v1/events/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(404);
    });

    it('allows the creator to delete with 204 and no body', async () => {
      const { token } = await registerAndLogin('delete-owner');
      const created = await request(httpServer)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${token}`)
        .send(validEventPayload());
      const eventId = (created.body as EventResponseBody).id;

      const response = await request(httpServer)
        .delete(`/api/v1/events/${eventId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(204);
      expect(response.body).toEqual({});

      const afterDelete = await request(httpServer).get(
        `/api/v1/events/${eventId}`,
      );
      expect(afterDelete.status).toBe(404);
    });
  });

  describe('full event lifecycle (register -> create -> read -> list -> update -> forbidden -> delete)', () => {
    it('exercises the entire flow end to end across two users', async () => {
      const userA = await registerAndLogin('lifecycle-a');
      const userB = await registerAndLogin('lifecycle-b');

      const createResponse = await request(httpServer)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${userA.token}`)
        .send(validEventPayload({ title: 'Lifecycle Event' }));
      expect(createResponse.status).toBe(201);
      const eventId = (createResponse.body as EventResponseBody).id;

      const getResponse = await request(httpServer).get(
        `/api/v1/events/${eventId}`,
      );
      expect(getResponse.status).toBe(200);

      const listResponse = await request(httpServer).get(
        `/api/v1/events?search=Lifecycle Event`,
      );
      expect(
        (listResponse.body as PaginatedEventsBody).data.some(
          (e) => e.id === eventId,
        ),
      ).toBe(true);

      const updateResponse = await request(httpServer)
        .patch(`/api/v1/events/${eventId}`)
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ title: 'Lifecycle Event Updated' });
      expect(updateResponse.status).toBe(200);
      expect((updateResponse.body as EventResponseBody).title).toBe(
        'Lifecycle Event Updated',
      );

      const forbiddenUpdate = await request(httpServer)
        .patch(`/api/v1/events/${eventId}`)
        .set('Authorization', `Bearer ${userB.token}`)
        .send({ title: 'Hijacked' });
      expect(forbiddenUpdate.status).toBe(403);

      const forbiddenDelete = await request(httpServer)
        .delete(`/api/v1/events/${eventId}`)
        .set('Authorization', `Bearer ${userB.token}`);
      expect(forbiddenDelete.status).toBe(403);

      const deleteResponse = await request(httpServer)
        .delete(`/api/v1/events/${eventId}`)
        .set('Authorization', `Bearer ${userA.token}`);
      expect(deleteResponse.status).toBe(204);

      const afterDelete = await request(httpServer).get(
        `/api/v1/events/${eventId}`,
      );
      expect(afterDelete.status).toBe(404);
    });
  });
});
