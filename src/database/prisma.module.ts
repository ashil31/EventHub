import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Global by deliberate choice, not default: the installed nestjs-best-
 * practices skill (`arch-module-sharing`) explicitly lists "database
 * connections" as one of the few legitimate uses of @Global(), alongside
 * config/logging. PrismaService will be a dependency of every future
 * feature module (auth, users, events, rsvp) — repeating `imports:
 * [PrismaModule]` in each of them would be pure boilerplate for a module
 * that has no meaningful per-feature configuration. Still imported once,
 * explicitly, in AppModule (not auto-loaded), so it's visible in the
 * module graph.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
