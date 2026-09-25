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

/**
 * Phase 8 audit: a lightweight, targeted penetration-style suite for the
 * two checks not already covered incidentally by auth/events/rsvp
 * e2e-spec.ts (mass assignment, RSVP impersonation, unknown-field
 * rejection, and passwordHash-absence are all already asserted there).
 * This file exists specifically to make the SQL-injection and
 * oversized-input checks permanent regressions rather than one-off
 * manual curl checks.
 */
describe('Security (e2e)', () => {
  let app: INestApplication;
  let httpServer: App;
  let prisma: PrismaService;

  const EMAIL_DOMAIN = 'eventhub-security-e2e.test';
  const uniqueEmail = (label: string): string =>
    `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@${EMAIL_DOMAIN}`;

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

  describe('SQL injection resistance (search is Prisma `contains`, always parameterized)', () => {
    it.each([
      ["' OR '1'='1", 'classic tautology'],
      ["'; DROP TABLE users; --", 'statement injection attempt'],
      [
        '\' UNION SELECT email, "passwordHash" FROM users --',
        'union-based exfiltration attempt',
      ],
    ])(
      'treats %j (%s) as a literal search string, never as SQL',
      async (payload) => {
        const response = await request(httpServer)
          .get('/api/v1/events')
          .query({ search: payload });

        // A vulnerable query would either 500 (malformed SQL) or return
        // unrelated rows (injection succeeded); the safe behavior is a
        // clean 200 with zero matches, since no real title/description/
        // location contains this string.
        expect(response.status).toBe(200);
        const body = response.body as { data: unknown[] };
        expect(body.data).toEqual([]);
      },
    );

    it('the users table survives an injection attempt — registration still works after', async () => {
      await request(httpServer)
        .get('/api/v1/events')
        .query({ search: "'; DROP TABLE users; --" });

      const email = uniqueEmail('post-injection');
      const response = await request(httpServer)
        .post('/api/v1/auth/register')
        .send({ name: 'Post Injection', email, password: 'a-secure-password' });

      expect(response.status).toBe(201);
    });
  });

  describe('Oversized input rejection', () => {
    it('rejects a search string over 200 characters with 400', async () => {
      const response = await request(httpServer)
        .get('/api/v1/events')
        .query({ search: 'a'.repeat(201) });
      expect(response.status).toBe(400);
    });

    it('rejects an event title over 200 characters with 400', async () => {
      const email = uniqueEmail('oversized-title');
      await request(httpServer)
        .post('/api/v1/auth/register')
        .send({ name: 'Oversized', email, password: 'a-secure-password' });
      const login = await request(httpServer)
        .post('/api/v1/auth/login')
        .send({ email, password: 'a-secure-password' });
      const { accessToken } = login.body as { accessToken: string };

      const response = await request(httpServer)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'a'.repeat(201),
          location: 'Ahmedabad',
          startsAt: new Date(Date.now() + 3_600_000).toISOString(),
          endsAt: new Date(Date.now() + 7_200_000).toISOString(),
          capacity: 10,
        });
      expect(response.status).toBe(400);
    });

    it('rejects an oversized pagination limit with 400 rather than returning every row', async () => {
      const response = await request(httpServer)
        .get('/api/v1/events')
        .query({ limit: 999999999 });
      expect(response.status).toBe(400);
    });

    it('rejects a registration password over 128 characters with 400', async () => {
      const response = await request(httpServer)
        .post('/api/v1/auth/register')
        .send({
          name: 'Long Password',
          email: uniqueEmail('long-password'),
          password: 'a'.repeat(129),
        });
      expect(response.status).toBe(400);
    });
  });
});
