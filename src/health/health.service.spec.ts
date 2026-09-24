import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;
  const configServiceMock = {
    get: jest.fn().mockReturnValue('test'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();

    service = module.get(HealthService);
  });

  it('reports ok status with safe metadata', () => {
    const result = service.check();

    expect(result.status).toBe('ok');
    expect(result.info.name).toBe('eventhub-api');
    expect(result.info.environment).toBe('test');
    expect(typeof result.info.uptime).toBe('number');
  });

  it('never includes secrets or infrastructure details', () => {
    const result = service.check();
    const serialized = JSON.stringify(result);

    expect(serialized).not.toMatch(/DATABASE_URL|JWT_SECRET|postgres:\/\//i);
  });
});
