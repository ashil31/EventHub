import { z } from 'zod';

/**
 * Mirrors backend/src/auth/dto/login.dto.ts exactly: `@IsEmail()` and
 * `@MaxLength(128)` on the password — no `@MinLength` on login (unlike
 * registration), since login only checks the submitted password against
 * a stored hash, it doesn't need to enforce password strength again.
 * Frontend validation here is a UX improvement only; the backend's own
 * `ValidationPipe` remains authoritative (Phase 0 § H).
 */
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'Email is required')
    .email('Enter a valid email address'),
  password: z
    .string()
    .min(1, 'Password is required')
    .max(128, 'Password must be 128 characters or fewer'),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
