import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;
  const configServiceMock = {
    get: jest.fn().mockReturnValue('test'),
  };
  const prismaServiceMock = {
    $queryRaw: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: ConfigService, useValue: configServiceMock },
        { provide: PrismaService, useValue: prismaServiceMock },
      ],
    }).compile();

    service = module.get(HealthService);
  });

  it('reports ok status with safe metadata when the database is reachable', async () => {
    prismaServiceMock.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    const result = await service.check();

    expect(result.status).toBe('ok');
    expect(result.database).toBe('up');
    expect(result.info.name).toBe('eventhub-api');
    expect(result.info.environment).toBe('test');
    expect(typeof result.info.uptime).toBe('number');
  });

  it('never includes secrets or infrastructure details', async () => {
    prismaServiceMock.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    const result = await service.check();
    const serialized = JSON.stringify(result);

    expect(serialized).not.toMatch(/DATABASE_URL|JWT_SECRET|postgres:\/\//i);
  });

  it('throws a safe 503 when the database is unreachable', async () => {
    prismaServiceMock.$queryRaw.mockRejectedValue(
      new Error('connection refused to 10.0.0.5:5432 user=postgres'),
    );

    await expect(service.check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(service.check()).rejects.not.toThrow(
      /10\.0\.0\.5|connection refused/,
    );
  });
});
