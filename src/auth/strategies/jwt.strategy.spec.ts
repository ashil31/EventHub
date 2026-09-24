import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User } from '@prisma/client';
import { UsersRepository } from '../../users/users.repository';
import { JwtStrategy } from './jwt.strategy';

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    name: 'Ashil Patel',
    email: 'ashil@example.com',
    passwordHash: 'hashed',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  const usersRepository = {
    findById: jest.fn(),
  } as unknown as jest.Mocked<UsersRepository>;
  const configService = {
    getOrThrow: jest.fn().mockReturnValue('a-development-secret-32-chars-min'),
  } as unknown as jest.Mocked<ConfigService>;

  beforeEach(() => {
    jest.clearAllMocks();
    configService.getOrThrow.mockReturnValue(
      'a-development-secret-32-chars-min',
    );
    strategy = new JwtStrategy(configService, usersRepository);
  });

  it('returns the minimal authenticated user shape when the subject exists', async () => {
    usersRepository.findById.mockResolvedValue(buildUser());

    const result = await strategy.validate({ sub: 'user-1' });

    expect(result).toEqual({
      id: 'user-1',
      name: 'Ashil Patel',
      email: 'ashil@example.com',
    });
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('rejects with 401 when the subject no longer exists (e.g. deleted account)', async () => {
    usersRepository.findById.mockResolvedValue(null);

    await expect(
      strategy.validate({ sub: 'ghost-user' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
