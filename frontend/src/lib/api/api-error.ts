/**
 * The backend's actual error response shape (verified against
 * backend/src/common/types/error-response.type.ts and
 * all-exceptions.filter.ts — every thrown exception in the API is
 * normalized to this exact body, so this type is not a guess).
 *
 * `code` is status-derived ("BAD_REQUEST", "CONFLICT", …), not a
 * per-business-error taxonomy — the backend deliberately doesn't maintain
 * one. Callers that need finer distinction than the status code fall back
 * to `message`.
 */
interface BackendErrorBody {
  statusCode: number;
  code: string;
  message: string | string[];
  error: string;
  timestamp: string;
  path: string;
  requestId: string;
}

function isBackendErrorBody(value: unknown): value is BackendErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'statusCode' in value &&
    'code' in value &&
    'message' in value
  );
}

/**
 * The one error type every API call can throw. Components branch on
 * `status`/`code` rather than re-parsing a raw `Response` at every call
 * site. `status: 0` marks a request that never reached the server (offline,
 * DNS failure, CORS rejection) — there is no HTTP status for that, so 0 is
 * this client's own sentinel, never a value the backend can send.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;

  constructor(
    message: string,
    options: { status: number; code: string; requestId?: string | null },
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status;
    this.code = options.code;
    this.requestId = options.requestId ?? null;
  }

  /** True for a request that never got an HTTP response at all. */
  get isNetworkError(): boolean {
    return this.status === 0;
  }

  static async fromResponse(response: Response): Promise<ApiError> {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      // Non-JSON error body (e.g. a proxy's plain-text 502) — fall through
      // to the generic message below rather than throwing while building
      // the error we were about to throw.
      body = null;
    }

    if (isBackendErrorBody(body)) {
      const message = Array.isArray(body.message)
        ? body.message.join(' ')
        : body.message;
      return new ApiError(message, {
        status: body.statusCode,
        code: body.code,
        requestId: body.requestId,
      });
    }

    return new ApiError(response.statusText || 'Request failed', {
      status: response.status,
      code: 'UNKNOWN_ERROR',
    });
  }

  static networkError(cause: unknown): ApiError {
    const error = new ApiError('Unable to reach the server', {
      status: 0,
      code: 'NETWORK_ERROR',
    });
    error.cause = cause;
    return error;
  }
}
