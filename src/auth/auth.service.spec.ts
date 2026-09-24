import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, User } from '@prisma/client';
import * as argon2 from 'argon2';
import { UsersRepository } from '../users/users.repository';
import { AuthService } from './auth.service';

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    name: 'Ashil Patel',
    email: 'ashil@example.com',
    passwordHash: 'hashed',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('AuthService', () => {
  let service: AuthService;
  const usersRepository = {
    create: jest.fn(),
    findByEmail: jest.fn(),
    findById: jest.fn(),
  } as unknown as jest.Mocked<UsersRepository>;
  const jwtService = { sign: jest.fn() } as unknown as jest.Mocked<JwtService>;
  const configService = {
    get: jest.fn(),
  } as unknown as jest.Mocked<ConfigService>;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(usersRepository, jwtService, configService);
  });

  describe('register', () => {
    it('hashes the password with Argon2 before persisting — never stores plaintext', async () => {
      usersRepository.create.mockResolvedValue(buildUser());

      await service.register({
        name: 'Ashil Patel',
        email: 'ashil@example.com',
        password: 'a-secure-password',
      });

      const [createArg] = usersRepository.create.mock.calls[0] as [
        { passwordHash: string },
      ];
      expect(createArg.passwordHash).not.toBe('a-secure-password');
      await expect(
        argon2.verify(createArg.passwordHash, 'a-secure-password'),
      ).resolves.toBe(true);
    });

    it('never returns passwordHash in the response', async () => {
      usersRepository.create.mockResolvedValue(buildUser());

      const result = await service.register({
        name: 'Ashil Patel',
        email: 'ashil@example.com',
        password: 'a-secure-password',
      });

      expect(result).not.toHaveProperty('passwordHash');
      expect(result).toEqual({
        id: 'user-1',
        name: 'Ashil Patel',
        email: 'ashil@example.com',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() is intentionally untyped
        createdAt: expect.any(Date),
      });
    });

    it('converts a Prisma unique-constraint violation into a 409 Conflict', async () => {
      usersRepository.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.register({
          name: 'Ashil Patel',
          email: 'dup@example.com',
          password: 'a-secure-password',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rethrows unrelated database errors unchanged', async () => {
      usersRepository.create.mockRejectedValue(new Error('connection lost'));

      await expect(
        service.register({
          name: 'Ashil Patel',
          email: 'ashil@example.com',
          password: 'a-secure-password',
        }),
      ).rejects.toThrow('connection lost');
    });
  });

  describe('login', () => {
    it('issues a JWT with sub set to the user id on success', async () => {
      const passwordHash = await argon2.hash('correct-password');
      usersRepository.findByEmail.mockResolvedValue(
        buildUser({ passwordHash }),
      );
      jwtService.sign.mockReturnValue('signed.jwt.token');
      configService.get.mockReturnValue('15m');

      const result = await service.login({
        email: 'ashil@example.com',
        password: 'correct-password',
      });

      // eslint-disable-next-line @typescript-eslint/unbound-method -- asserting on a jest mock function, not a real method reference
      expect(jwtService.sign).toHaveBeenCalledWith({ sub: 'user-1' });
      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.tokenType).toBe('Bearer');
      expect(result.user).toEqual({
        id: 'user-1',
        name: 'Ashil Patel',
        email: 'ashil@example.com',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() is intentionally untyped
        createdAt: expect.any(Date),
      });
    });

    it('rejects an unknown email with a generic message (no user enumeration)', async () => {
      usersRepository.findByEmail.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'whatever' }),
      ).rejects.toMatchObject({
        message: 'Invalid email or password.',
      });
    });

    it('rejects an incorrect password with the identical generic message', async () => {
      const passwordHash = await argon2.hash('correct-password');
      usersRepository.findByEmail.mockResolvedValue(
        buildUser({ passwordHash }),
      );

      await expect(
        service.login({ email: 'ashil@example.com', password: 'wrong' }),
      ).rejects.toMatchObject({ message: 'Invalid email or password.' });
    });

    it('rejects both failure cases with the same exception type', async () => {
      usersRepository.findByEmail.mockResolvedValueOnce(null);
      await expect(
        service.login({ email: 'nobody@example.com', password: 'x' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      const passwordHash = await argon2.hash('correct-password');
      usersRepository.findByEmail.mockResolvedValueOnce(
        buildUser({ passwordHash }),
      );
      await expect(
        service.login({ email: 'ashil@example.com', password: 'wrong' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
