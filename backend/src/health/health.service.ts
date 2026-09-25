import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';

export interface LivenessStatus {
  status: 'ok';
  info: {
    name: string;
    environment: string;
    uptime: number;
  };
}

export interface ReadinessStatus extends LivenessStatus {
  database: 'up';
}

@Injectable()
export class HealthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Liveness: "is the process alive?" — no dependency checks. A
   * container orchestrator restarts the process if this fails, so it must
   * never fail because of something restarting wouldn't fix (like
   * Postgres being briefly unreachable) — that's what readiness is for.
   */
  liveness(): LivenessStatus {
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

  /**
   * Readiness: "can this instance actually serve requests?" — checks
   * Postgres with the cheapest possible query (`SELECT 1`, not a real
   * query) — enough to prove the connection pool can reach the database,
   * not a load-bearing check. Throws a safe, generic 503 if unreachable;
   * never surfaces the connection string or the underlying driver error.
   */
  async readiness(): Promise<ReadinessStatus> {
    await this.pingDatabase();

    return {
      ...this.liveness(),
      database: 'up',
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
