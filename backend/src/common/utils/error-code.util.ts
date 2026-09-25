import { HttpStatus } from '@nestjs/common';

/**
 * Maps an HTTP status to a small, stable, machine-readable `code` a client
 * can branch on. Deliberately status-derived rather than a large
 * per-business-error enum (e.g. "EVENT_FULL", "DUPLICATE_RSVP") — that
 * would be a second taxonomy to keep in sync with every new error a
 * service throws, for a project this size not worth the upkeep. A client
 * that needs finer distinction than the status code already gives it can
 * still fall back to `message`.
 */
const STATUS_CODE_NAMES: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
  [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_SERVER_ERROR',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
};

export function errorCodeForStatus(status: number): string {
  return STATUS_CODE_NAMES[status] ?? 'ERROR';
}
