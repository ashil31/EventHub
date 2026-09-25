// Provides a fixed environment for e2e tests so they never depend on a
// developer's local .env file or real secrets. As of Phase 2, the health
// check genuinely queries Postgres, so these tests require the local
// docker-compose database to be running (`docker compose up -d`) — this is
// the same database local development uses, not a separate throwaway one,
// per the project's "don't over-engineer" guidance.
process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
process.env.DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/eventhub';
process.env.JWT_SECRET = 'test-only-secret-not-for-production-1234567890';
process.env.JWT_EXPIRES_IN = '15m';
// Deliberately generous (not disabled — the throttler is genuinely active
// and exercised by these suites): the main e2e suites, especially the
// RSVP concurrency tests, legitimately fire many rapid requests from one
// test process, and that's expected, not abuse. Real enforcement is
// verified separately, with its own tiny limits, in
// test/throttle/rate-limit.spec.ts.
process.env.THROTTLE_TTL = '60';
process.env.THROTTLE_LIMIT = '100000';
process.env.AUTH_THROTTLE_TTL = '60';
process.env.AUTH_THROTTLE_LIMIT = '100000';
