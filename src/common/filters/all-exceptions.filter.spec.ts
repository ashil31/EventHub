import { ArgumentsHost, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { ErrorResponseBody } from '../types/error-response.type';
import { AllExceptionsFilter } from './all-exceptions.filter';

function buildHost(): {
  host: ArgumentsHost;
  json: jest.Mock<void, [ErrorResponseBody]>;
  status: jest.Mock;
} {
  const json = jest.fn<void, [ErrorResponseBody]>();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ url: '/api/v1/example', id: 'req-1' }),
    }),
  } as unknown as ArgumentsHost;

  return { host, json, status };
}

function buildLogger(): PinoLogger {
  return {
    setContext: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  } as unknown as PinoLogger;
}

describe('AllExceptionsFilter', () => {
  it('maps a known HttpException straight through', () => {
    const filter = new AllExceptionsFilter(buildLogger());
    const { host, json, status } = buildHost();

    filter.catch(new NotFoundException('Event not found'), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        message: 'Event not found',
        requestId: 'req-1',
      }),
    );
  });

  it('maps a Prisma unique-constraint violation (P2002) to a safe 409', () => {
    const filter = new AllExceptionsFilter(buildLogger());
    const { host, json, status } = buildHost();
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`email`)',
      { code: 'P2002', clientVersion: 'test' },
    );

    filter.catch(prismaError, host);

    expect(status).toHaveBeenCalledWith(409);
    const body = json.mock.calls[0][0];
    expect(body).toMatchObject({ statusCode: 409, error: 'Conflict' });
    expect(JSON.stringify(body)).not.toMatch(/email|Unique constraint/);
  });

  it('maps a Prisma not-found error (P2025) to a safe 404', () => {
    const filter = new AllExceptionsFilter(buildLogger());
    const { host, json, status } = buildHost();
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'An operation failed because it depends on one or more records that were required but not found.',
      { code: 'P2025', clientVersion: 'test' },
    );

    filter.catch(prismaError, host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, error: 'Not Found' }),
    );
  });

  it('never leaks internal error details for unrecognized exceptions', () => {
    const filter = new AllExceptionsFilter(buildLogger());
    const { host, json, status } = buildHost();

    filter.catch(new Error('connection to 10.0.0.5:5432 refused'), host);

    expect(status).toHaveBeenCalledWith(500);
    const body = json.mock.calls[0][0];
    expect(JSON.stringify(body)).not.toMatch(/10\.0\.0\.5|refused/);
  });
});
