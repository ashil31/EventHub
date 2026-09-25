// Same base environment as the main e2e suites (test/setup-env.ts), but
// with deliberately tiny throttle limits — this file exists specifically
// to prove rate limiting actually enforces something, which the generous
// limits in the main suites can't demonstrate.
process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
process.env.DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/eventhub';
process.env.JWT_SECRET = 'test-only-secret-not-for-production-1234567890';
process.env.JWT_EXPIRES_IN = '15m';
process.env.THROTTLE_TTL = '60';
process.env.THROTTLE_LIMIT = '3';
process.env.AUTH_THROTTLE_TTL = '60';
process.env.AUTH_THROTTLE_LIMIT = '3';
