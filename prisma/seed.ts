/**
 * Development-only seed data. Never run against production —
 * `npm run db:seed` is a manual, explicit command; nothing in the
 * application ever calls this automatically.
 *
 * Passwords are hashed with Argon2id, the same algorithm Phase 3's
 * authentication will use — but this file does not implement or depend on
 * any auth module. It's a standalone script.
 */
import 'dotenv/config';
import * as argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const DEV_ONLY_SEED_PASSWORD = 'dev-only-seed-password-not-real';

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run seed data against a production environment.');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const passwordHash = await argon2.hash(DEV_ONLY_SEED_PASSWORD);

    const alice = await prisma.user.upsert({
      where: { email: 'alice@eventhub.dev' },
      update: {},
      create: { name: 'Alice Example', email: 'alice@eventhub.dev', passwordHash },
    });

    const bob = await prisma.user.upsert({
      where: { email: 'bob@eventhub.dev' },
      update: {},
      create: { name: 'Bob Example', email: 'bob@eventhub.dev', passwordHash },
    });

    const meetup = await prisma.event.upsert({
      where: { id: '00000000-0000-0000-0000-000000000001' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000001',
        title: 'EventHub Dev Meetup',
        description: 'A sample event for local development and manual testing.',
        location: 'Community Hall',
        startsAt: new Date(Date.now() + 7 * 24 * 3_600_000),
        endsAt: new Date(Date.now() + 7 * 24 * 3_600_000 + 3_600_000),
        capacity: 20,
        createdBy: alice.id,
      },
    });

    await prisma.eventAttendee.upsert({
      where: { eventId_userId: { eventId: meetup.id, userId: bob.id } },
      update: {},
      create: { eventId: meetup.id, userId: bob.id },
    });

    console.log('Seed complete:', {
      users: [alice.email, bob.email],
      events: [meetup.title],
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
