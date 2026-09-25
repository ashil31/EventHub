import { describe, expect, it } from 'vitest';
import { loginSchema } from './login-schema';

describe('loginSchema', () => {
  it('accepts valid data, trimming and lowercasing the email', () => {
    const result = loginSchema.safeParse({
      email: '  Ashil@Example.com  ',
      password: 'anything',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('ashil@example.com');
    }
  });

  it('rejects an invalid email', () => {
    const result = loginSchema.safeParse({
      email: 'not-an-email',
      password: 'anything',
    });

    expect(result.success).toBe(false);
  });

  it('rejects a missing password', () => {
    const result = loginSchema.safeParse({
      email: 'ashil@example.com',
      password: '',
    });

    expect(result.success).toBe(false);
  });

  it('rejects a password over 128 characters (matches backend @MaxLength(128))', () => {
    const result = loginSchema.safeParse({
      email: 'ashil@example.com',
      password: 'a'.repeat(129),
    });

    expect(result.success).toBe(false);
  });

  it('does not enforce a minimum password length (login only checks it against a stored hash)', () => {
    const result = loginSchema.safeParse({
      email: 'ashil@example.com',
      password: 'a',
    });

    expect(result.success).toBe(true);
  });
});
