import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface HealthStatus {
  status: 'ok';
  info: {
    name: string;
    environment: string;
    uptime: number;
  };
}

@Injectable()
export class HealthService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Deliberately cheap: no database or downstream calls. A real readiness
   * check (Postgres connectivity) is introduced once Prisma exists.
   */
  check(): HealthStatus {
    return {
      status: 'ok',
      info: {
        name: 'eventhub-api',
        environment: this.configService.get<string>(
          'app.environment',
          'development',
        ),
        uptime: process.uptime(),
      },
    };
  }
}
