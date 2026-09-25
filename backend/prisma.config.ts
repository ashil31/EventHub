// Prisma 7 config: the Prisma CLI (migrate/generate/studio) reads the
// datasource URL from here, not from schema.prisma. The .env file is not
// auto-loaded by the CLI, hence the explicit dotenv import.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
