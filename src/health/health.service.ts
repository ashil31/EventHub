import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';

export interface HealthStatus {
  status: 'ok';
  database: 'up';
  info: {
    name: string;
    environment: string;
    uptime: number;
  };
}

@Injectable()
export class HealthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * `SELECT 1` is as cheap as a database check gets — enough to prove the
   * connection pool can actually reach Postgres, not a real query. Throws a
   * safe, generic 503 if the database is unreachable; never surfaces the
   * connection string or the underlying driver error to the client.
   */
  async check(): Promise<HealthStatus> {
    await this.pingDatabase();

    return {
      status: 'ok',
      database: 'up',
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

  private async pingDatabase(): Promise<void> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException('Database unavailable');
    }
  }
}
