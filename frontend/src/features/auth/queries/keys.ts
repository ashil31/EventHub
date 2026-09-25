/**
 * Query keys for the auth feature. `me` is a function (not a bare array)
 * for consistency with every other feature's key factory, even though it
 * takes no arguments — a single authenticated user's data never varies by
 * parameters the way an event or attendee list does.
 */
export const authKeys = {
  all: ['auth'] as const,
  me: () => [...authKeys.all, 'me'] as const,
};
