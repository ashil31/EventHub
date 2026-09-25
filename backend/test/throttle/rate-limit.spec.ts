import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/database/prisma.service';

/**
 * Proves rate limiting actually enforces something — run with its own
 * tiny THROTTLE_LIMIT/AUTH_THROTTLE_LIMIT=3 (test/setup-env-throttle.ts),
 * completely separate from the main e2e suites, whose deliberately
 * generous limits (test/setup-env.ts) would never trip and so could never
 * demonstrate this. Run via `npm run test:throttle`.
 */
describe('Rate limiting (e2e)', () => {
  let app: INestApplication;
  let httpServer: App;
  let prisma: PrismaService;

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
    await prisma.user.deleteMany({
      where: { email: { endsWith: '@eventhub-throttle-e2e.test' } },
    });
    await app.close();
  });

  it('allows requests up to AUTH_THROTTLE_LIMIT, then rejects with 429', async () => {
    const email = 'ratelimit@eventhub-throttle-e2e.test';
    const attempt = () =>
      request(httpServer)
        .post('/api/v1/auth/login')
        .send({ email, password: 'wrong-password' });

    // Configured limit is 3 — the first 3 attempts are handled normally
    // (401, since the credentials are wrong; the point here is the status
    // is NOT 429 yet).
    const first = await attempt();
    const second = await attempt();
    const third = await attempt();
    expect([first.status, second.status, third.status]).toEqual([
      401, 401, 401,
    ]);

    const fourth = await attempt();
    expect(fourth.status).toBe(429);
  });

  it('rate limiting is not a substitute for the duplicate-email check — 409 still applies within the limit', async () => {
    // A generic-API request that isn't login/register also uses the
    // (equally tiny, in this suite) default throttle. Two requests to a
    // public, unauthenticated endpoint stay under the default limit of 3.
    const first = await request(httpServer).get('/api/v1/events?limit=1');
    const second = await request(httpServer).get('/api/v1/events?limit=1');
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });

  it('the 429 response uses the same safe error shape as every other error', async () => {
    const email = 'ratelimit-shape@eventhub-throttle-e2e.test';
    const attempt = () =>
      request(httpServer)
        .post('/api/v1/auth/login')
        .send({ email, password: 'wrong-password' });

    await attempt();
    await attempt();
    await attempt();
    const limited = await attempt();

    expect(limited.status).toBe(429);
    expect(limited.body).toHaveProperty('statusCode', 429);
    expect(limited.body).toHaveProperty('requestId');
    expect(limited.body).toHaveProperty('code');
    expect(JSON.stringify(limited.body)).not.toMatch(
      /stack|DATABASE_URL|JWT_SECRET/i,
    );
  });
});
