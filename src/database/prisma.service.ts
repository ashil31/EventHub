import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

/**
 * The single, application-wide Prisma Client instance. Every module that
 * needs database access injects this — nothing outside this file
 * instantiates PrismaClient.
 *
 * Prisma 7 requires an explicit driver adapter (no more implicit
 * query-engine-binary connection); @prisma/adapter-pg wraps `pg` for
 * PostgreSQL. The connection string is read from ConfigService rather than
 * process.env directly, consistent with the rest of the app.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(configService: ConfigService) {
    super({
      adapter: new PrismaPg({
        connectionString: configService.get<string>('database.url'),
      }),
    });
  }

  async onModuleInit(): Promise<void> {
    // $connect() alone does not prove connectivity: @prisma/adapter-pg
    // wraps `pg`'s Pool, which connects lazily and does not authenticate
    // until the first real query. A cheap round trip here is what actually
    // makes the fail-fast-on-unreachable-database behavior in main.ts work
    // — without it, bad credentials or a down database would silently
    // surface on the first real request instead of at startup.
    await this.$connect();
    await this.$queryRaw`SELECT 1`;
    this.logger.log('Connected to PostgreSQL');
  }

  async onModuleDestroy(): Promise<void> {
    // Runs as part of Nest's shutdown-hook lifecycle (enabled in main.ts),
    // triggered by SIGTERM/SIGINT — closes the pg Pool cleanly so a
    // container stop/redeploy doesn't leave dangling connections on the
    // database side.
    await this.$disconnect();
    this.logger.log('Disconnected from PostgreSQL');
  }
}
