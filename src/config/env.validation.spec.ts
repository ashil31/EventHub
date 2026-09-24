import { validate } from './env.validation';

const validEnv = {
  NODE_ENV: 'development',
  PORT: '3000',
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/eventhub',
  JWT_SECRET: 'a-development-secret-that-is-long-enough',
  JWT_EXPIRES_IN: '15m',
};

describe('env.validation', () => {
  it('accepts a fully valid environment', () => {
    expect(() => validate({ ...validEnv })).not.toThrow();
  });

  it('rejects an invalid NODE_ENV', () => {
    expect(() => validate({ ...validEnv, NODE_ENV: 'staging' })).toThrow(
      /Environment validation failed/,
    );
  });

  it('rejects a non-numeric PORT', () => {
    expect(() => validate({ ...validEnv, PORT: 'not-a-port' })).toThrow(
      /Environment validation failed/,
    );
  });

  it('rejects a missing DATABASE_URL', () => {
    const { DATABASE_URL: _drop, ...rest } = validEnv;
    expect(() => validate({ ...rest })).toThrow(
      /Environment validation failed/,
    );
  });

  it('rejects a DATABASE_URL that is not a postgres connection string', () => {
    expect(() =>
      validate({ ...validEnv, DATABASE_URL: 'mysql://localhost/eventhub' }),
    ).toThrow(/Environment validation failed/);
  });

  it('rejects a JWT_SECRET shorter than 32 characters', () => {
    expect(() => validate({ ...validEnv, JWT_SECRET: 'too-short' })).toThrow(
      /Environment validation failed/,
    );
  });

  it('rejects a production JWT_SECRET left as the development placeholder', () => {
    expect(() =>
      validate({
        ...validEnv,
        NODE_ENV: 'production',
        JWT_SECRET: 'replace-this-in-development-with-a-long-random-value',
      }),
    ).toThrow(/development placeholder/);
  });
});
