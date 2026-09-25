import { describe, expect, it } from 'vitest';
import { registerSchema } from './register-schema';

const VALID = {
  name: 'Ashil Patel',
  email: 'ashil@example.com',
  password: 'a-reasonably-long-password',
};

describe('registerSchema', () => {
  it('accepts valid data', () => {
    expect(registerSchema.safeParse(VALID).success).toBe(true);
  });

  it('rejects a missing name', () => {
    const result = registerSchema.safeParse({ ...VALID, name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a name over 100 characters (matches backend @MaxLength(100))', () => {
    const result = registerSchema.safeParse({
      ...VALID,
      name: 'a'.repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid email', () => {
    const result = registerSchema.safeParse({
      ...VALID,
      email: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a password shorter than 8 characters (matches backend @MinLength(8))', () => {
    const result = registerSchema.safeParse({ ...VALID, password: 'short1' });
    expect(result.success).toBe(false);
  });

  it('rejects a password over 128 characters (matches backend @MaxLength(128))', () => {
    const result = registerSchema.safeParse({
      ...VALID,
      password: 'a'.repeat(129),
    });
    expect(result.success).toBe(false);
  });

  it('trims the name and normalizes the email the same way the backend does', () => {
    const result = registerSchema.safeParse({
      ...VALID,
      name: '  Ashil Patel  ',
      email: '  Ashil@Example.com  ',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Ashil Patel');
      expect(result.data.email).toBe('ashil@example.com');
    }
  });
});
