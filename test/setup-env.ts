// Provides a fixed, self-contained environment for e2e tests so they never
// depend on a developer's local .env file or real secrets.
process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
process.env.DATABASE_URL =
  'postgresql://test:test@localhost:5432/eventhub_test';
process.env.JWT_SECRET = 'test-only-secret-not-for-production-1234567890';
process.env.JWT_EXPIRES_IN = '15m';
