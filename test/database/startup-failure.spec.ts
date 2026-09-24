import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../src/database/prisma.service';

/**
 * Verifies the fail-fast startup mechanism directly: PrismaService.onModuleInit
 * must actually prove connectivity (not just resolve a lazy pool), because
 * main.ts's bootstrap().catch(...) depends on this rejecting when Postgres
 * is unreachable — that's what makes the app crash on startup instead of
 * serving a permanently degraded instance (see docs/specs/phase-2-database.md).
 */
describe('PrismaService startup behavior', () => {
  const buildConfigService = (url: string): ConfigService =>
    ({ get: () => url }) as unknown as ConfigService;

  it('onModuleInit resolves against a reachable database', async () => {
    const prisma = new PrismaService(
      buildConfigService(process.env.DATABASE_URL as string),
    );

    await expect(prisma.onModuleInit()).resolves.toBeUndefined();

    await prisma.onModuleDestroy();
  });

  it('onModuleInit rejects when the database is unreachable (wrong credentials)', async () => {
    const badUrl = (process.env.DATABASE_URL as string).replace(
      'postgres:postgres',
      'postgres:wrong-password',
    );
    const prisma = new PrismaService(buildConfigService(badUrl));

    await expect(prisma.onModuleInit()).rejects.toBeDefined();
  });

  it('onModuleInit rejects when nothing is listening on the target port', async () => {
    const badUrl = 'postgresql://postgres:postgres@localhost:59999/eventhub';
    const prisma = new PrismaService(buildConfigService(badUrl));

    await expect(prisma.onModuleInit()).rejects.toBeDefined();
  });
});
