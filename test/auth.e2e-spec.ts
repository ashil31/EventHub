import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';

interface RegisterResponseBody {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

interface LoginResponseBody {
  accessToken: string;
  tokenType: string;
  expiresIn: string;
  user: RegisterResponseBody;
}

interface MeResponseBody {
  id: string;
  name: string;
  email: string;
}

/**
 * Full authentication flow against a real Postgres instance (via
 * PrismaService) and the real HTTP stack. Every test user's email is
 * tagged under the eventhub-auth-e2e.test domain so cleanup can target
 * exactly (and only) what this suite created.
 */
describe('Auth (e2e)', () => {
  let app: INestApplication;
  let httpServer: App;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let configService: ConfigService;

  const EMAIL_DOMAIN = 'eventhub-auth-e2e.test';
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
    jwtService = app.get(JwtService);
    configService = app.get(ConfigService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { endsWith: `@${EMAIL_DOMAIN}` } },
    });
    await app.close();
  });

  describe('POST /api/v1/auth/register', () => {
    it('registers a new user and never returns passwordHash', async () => {
      const email = uniqueEmail('register-success');

      const response = await request(httpServer)
        .post('/api/v1/auth/register')
        .send({ name: 'Ashil Patel', email, password: 'a-secure-password' });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        name: 'Ashil Patel',
        email,
      });
      expect(response.body).not.toHaveProperty('passwordHash');
      expect(response.body).not.toHaveProperty('password');
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('createdAt');
    });

    it('normalizes email (uppercase + whitespace) before persisting', async () => {
      const base = uniqueEmail('normalize');
      const padded = `  ${base.toUpperCase()}  `;

      const response = await request(httpServer)
        .post('/api/v1/auth/register')
        .send({
          name: 'Normalize Test',
          email: padded,
          password: 'a-secure-password',
        });

      expect(response.status).toBe(201);
      expect((response.body as RegisterResponseBody).email).toBe(base);
    });

    it('stores the password as an Argon2 hash, never plaintext', async () => {
      const email = uniqueEmail('hash-check');

      await request(httpServer)
        .post('/api/v1/auth/register')
        .send({ name: 'Hash Check', email, password: 'a-secure-password' });

      const stored = await prisma.user.findUnique({ where: { email } });
      expect(stored?.passwordHash).toBeDefined();
      expect(stored?.passwordHash).not.toBe('a-secure-password');
      expect(stored?.passwordHash.startsWith('$argon2id$')).toBe(true);
      await expect(
        argon2.verify(stored!.passwordHash, 'a-secure-password'),
      ).resolves.toBe(true);
    });

    it('rejects a duplicate email with 409', async () => {
      const email = uniqueEmail('duplicate');
      await request(httpServer)
        .post('/api/v1/auth/register')
        .send({ name: 'First', email, password: 'a-secure-password' });

      const second = await request(httpServer)
        .post('/api/v1/auth/register')
        .send({ name: 'Second', email, password: 'another-password' });

      expect(second.status).toBe(409);
    });

    it('rejects a missing name with 400', async () => {
      const response = await request(httpServer)
        .post('/api/v1/auth/register')
        .send({ email: uniqueEmail('no-name'), password: 'a-secure-password' });

      expect(response.status).toBe(400);
    });

    it('rejects an invalid email with 400', async () => {
      const response = await request(httpServer)
        .post('/api/v1/auth/register')
        .send({
          name: 'Bad Email',
          email: 'not-an-email',
          password: 'a-secure-password',
        });

      expect(response.status).toBe(400);
    });

    it('rejects a missing password with 400', async () => {
      const response = await request(httpServer)
        .post('/api/v1/auth/register')
        .send({ name: 'No Password', email: uniqueEmail('no-password') });

      expect(response.status).toBe(400);
    });

    it('rejects a too-short password with 400', async () => {
      const response = await request(httpServer)
        .post('/api/v1/auth/register')
        .send({
          name: 'Short Password',
          email: uniqueEmail('short-pw'),
          password: 'short',
        });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    const password = 'a-secure-password';
    let email: string;

    beforeAll(async () => {
      email = uniqueEmail('login-user');
      await request(httpServer)
        .post('/api/v1/auth/register')
        .send({ name: 'Login User', email, password });
    });

    it('logs in successfully and returns a JWT whose subject is the user id', async () => {
      const response = await request(httpServer)
        .post('/api/v1/auth/login')
        .send({ email, password });

      const body = response.body as LoginResponseBody;
      expect(response.status).toBe(200);
      expect(body.tokenType).toBe('Bearer');
      expect(typeof body.accessToken).toBe('string');
      expect(body.user).toMatchObject({ email });
      expect(body.user).not.toHaveProperty('passwordHash');

      const decoded = jwtService.decode<{ sub: string }>(body.accessToken);
      expect(decoded.sub).toBe(body.user.id);
    });

    it('normalizes email on login the same way as registration', async () => {
      const response = await request(httpServer)
        .post('/api/v1/auth/login')
        .send({ email: `  ${email.toUpperCase()}  `, password });

      expect(response.status).toBe(200);
    });

    it('rejects an incorrect password with 401', async () => {
      const response = await request(httpServer)
        .post('/api/v1/auth/login')
        .send({ email, password: 'wrong-password' });

      expect(response.status).toBe(401);
    });

    it('rejects an unknown email with 401 (same status as wrong password)', async () => {
      const response = await request(httpServer)
        .post('/api/v1/auth/login')
        .send({ email: uniqueEmail('unknown'), password });

      expect(response.status).toBe(401);
    });

    it('rejects invalid input with 400', async () => {
      const response = await request(httpServer)
        .post('/api/v1/auth/login')
        .send({ email: 'not-an-email', password });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    const password = 'a-secure-password';
    let email: string;
    let accessToken: string;
    let userId: string;

    beforeAll(async () => {
      email = uniqueEmail('me-user');
      await request(httpServer)
        .post('/api/v1/auth/register')
        .send({ name: 'Me User', email, password });

      const loginResponse = await request(httpServer)
        .post('/api/v1/auth/login')
        .send({ email, password });

      const loginBody = loginResponse.body as LoginResponseBody;
      accessToken = loginBody.accessToken;
      userId = loginBody.user.id;
    });

    it('returns 401 with no token', async () => {
      const response = await request(httpServer).get('/api/v1/auth/me');
      expect(response.status).toBe(401);
    });

    it('returns 401 with a malformed token', async () => {
      const response = await request(httpServer)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer not-a-real-jwt');
      expect(response.status).toBe(401);
    });

    it('returns 401 with a validly-formed but tampered token', async () => {
      const tampered = accessToken.slice(0, -2) + 'xx';
      const response = await request(httpServer)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${tampered}`);
      expect(response.status).toBe(401);
    });

    it('returns 401 with an expired token', async () => {
      const expiredToken = jwtService.sign(
        { sub: userId },
        { secret: configService.get<string>('jwt.secret'), expiresIn: '-10s' },
      );
      const response = await request(httpServer)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);
      expect(response.status).toBe(401);
    });

    it('returns the authenticated user with a valid token, never passwordHash', async () => {
      const response = await request(httpServer)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ id: userId, name: 'Me User', email });
      expect(response.body).not.toHaveProperty('passwordHash');
    });
  });

  describe('full register -> login -> me flow', () => {
    it('exercises the entire authentication lifecycle end to end', async () => {
      const email = uniqueEmail('full-flow');
      const password = 'a-secure-password';

      const registerResponse = await request(httpServer)
        .post('/api/v1/auth/register')
        .send({ name: 'Full Flow', email, password });
      expect(registerResponse.status).toBe(201);

      const loginResponse = await request(httpServer)
        .post('/api/v1/auth/login')
        .send({ email, password });
      expect(loginResponse.status).toBe(200);
      const { accessToken } = loginResponse.body as LoginResponseBody;

      const meResponse = await request(httpServer)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(meResponse.status).toBe(200);
      expect((meResponse.body as MeResponseBody).email).toBe(email);
      expect(meResponse.body).not.toHaveProperty('passwordHash');

      const unauthenticatedResponse =
        await request(httpServer).get('/api/v1/auth/me');
      expect(unauthenticatedResponse.status).toBe(401);
    });
  });
});
