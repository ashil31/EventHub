import { z } from 'zod';

/** Mirrors backend/src/auth/dto/register.dto.ts exactly: `name` trimmed,
 * max 100; `email` trimmed + lowercased (the backend does the same
 * normalization server-side via `@Transform`, so what the user sees
 * matches what actually gets stored/compared); `password` 8–128 chars. */
export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(100, 'Name must be 100 characters or fewer'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'Email is required')
    .email('Enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be 128 characters or fewer'),
});

export type RegisterFormValues = z.infer<typeof registerSchema>;
