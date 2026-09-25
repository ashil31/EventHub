import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { ErrorResponseBody } from '../types/error-response.type';
import { errorCodeForStatus } from '../utils/error-code.util';

/**
 * Prisma error codes we know how to map to a sensible HTTP status without
 * any Events/RSVP-specific business logic. Full field-level error mapping
 * (e.g. "which unique field collided") belongs to the feature modules that
 * introduce those business rules — this is just "don't 500 on a known,
 * generic database conflict."
 */
const PRISMA_CONFLICT_CODES = new Set(['P2002']); // unique constraint violation
const PRISMA_NOT_FOUND_CODES = new Set(['P2025']); // record not found

/**
 * Catches every thrown exception (HttpException subclasses, known Prisma
 * errors, and anything unexpected) and turns it into the single,
 * predictable response shape documented in the README. Never forwards
 * stack traces, DB errors, connection strings, or other internal detail to
 * the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(AllExceptionsFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = this.resolveStatus(exception);
    const { message, error } = this.resolveMessage(exception, status);
    const requestId = (request as unknown as { id?: string }).id ?? 'unknown';

    const body: ErrorResponseBody = {
      statusCode: status,
      code: errorCodeForStatus(status),
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
      requestId,
    };

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error({ err: exception, requestId }, 'Unhandled exception');
    } else {
      this.logger.warn({ requestId, status }, 'Request rejected');
    }

    response.status(status).json(body);
  }

  private resolveStatus(exception: unknown): HttpStatus {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (PRISMA_CONFLICT_CODES.has(exception.code)) {
        return HttpStatus.CONFLICT;
      }
      if (PRISMA_NOT_FOUND_CODES.has(exception.code)) {
        return HttpStatus.NOT_FOUND;
      }
    }

    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private resolveMessage(
    exception: unknown,
    status: HttpStatus,
  ): {
    message: string | string[];
    error: string;
  } {
    if (
      exception instanceof Prisma.PrismaClientKnownRequestError &&
      status !== HttpStatus.INTERNAL_SERVER_ERROR
    ) {
      // Generic, safe messages only — never the raw Prisma error (which can
      // include table/column names and query details).
      return status === HttpStatus.CONFLICT
        ? { message: 'Resource already exists', error: 'Conflict' }
        : { message: 'Resource not found', error: 'Not Found' };
    }

    if (status === HttpStatus.TOO_MANY_REQUESTS) {
      // @nestjs/throttler's default ThrottlerException message is
      // 'ThrottlerException: Too Many Requests' — technically not
      // sensitive, but it needlessly exposes the internal exception class
      // name in a client-facing message. A clean, fixed message here is
      // more polished and consistent with how every other known error
      // type in this filter gets a curated message.
      return {
        message: 'Too many requests. Please try again later.',
        error: 'Too Many Requests',
      };
    }

    if (!(exception instanceof HttpException)) {
      // Never leak internal error details (stack traces, DB errors, etc.)
      return {
        message: 'Internal server error',
        error: 'Internal Server Error',
      };
    }

    const payload = exception.getResponse();

    if (typeof payload === 'string') {
      return { message: payload, error: exception.name };
    }

    if (typeof payload === 'object' && payload !== null) {
      const body = payload as { message?: string | string[]; error?: string };
      return {
        message: body.message ?? exception.message,
        error: body.error ?? exception.name,
      };
    }

    return { message: exception.message, error: exception.name };
  }
}
