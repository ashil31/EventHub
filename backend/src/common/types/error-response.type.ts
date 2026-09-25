export interface ErrorResponseBody {
  statusCode: number;
  /** Stable, machine-readable identifier a client can branch on without
   * parsing `message` — derived from the HTTP status (see
   * common/utils/error-code.util.ts), not a per-business-error taxonomy. */
  code: string;
  message: string | string[];
  error: string;
  timestamp: string;
  path: string;
  requestId: string;
}
