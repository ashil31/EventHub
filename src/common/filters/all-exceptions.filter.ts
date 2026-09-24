import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { ErrorResponseBody } from '../types/error-response.type';

/**
 * Catches every thrown exception (HttpException subclasses and anything
 * unexpected) and turns it into the single, predictable response shape
 * documented in the README. Never forwards stack traces, DB errors, or other
 * internal detail to the client.
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
    const { message, error } = this.resolveMessage(exception);
    const requestId = (request as unknown as { id?: string }).id ?? 'unknown';

    const body: ErrorResponseBody = {
      statusCode: status,
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
    return exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private resolveMessage(exception: unknown): {
    message: string | string[];
    error: string;
  } {
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
