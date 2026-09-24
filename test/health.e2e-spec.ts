import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

describe('Health (e2e)', () => {
  let app: INestApplication;
  let httpServer: App;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Mirror the production bootstrap configuration in main.ts.
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
    // Nest's `getHttpServer()` is typed `any`; capture it once, typed, here.
    httpServer = app.getHttpServer() as App;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health returns 200 with a safe status payload', async () => {
    const response = await request(httpServer).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      database: 'up',
      info: {
        name: 'eventhub-api',
        environment: 'test',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() is intentionally untyped
        uptime: expect.any(Number),
      },
    });
  });

  it('GET /api/v1/nonexistent returns the standard error response shape', async () => {
    const response = await request(httpServer).get('/api/v1/nonexistent');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      statusCode: 404,
      path: '/api/v1/nonexistent',
    });
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('requestId');
  });
});
