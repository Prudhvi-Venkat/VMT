/**
 * Centralized API Error representation.
 * Encapsulates status code, error code, request/correlation ID, and validation details.
 */

export class ApiError extends Error {
  code: string;
  statusCode: number;
  requestId?: string;
  details?: Record<string, unknown>;

  constructor(
    message: string,
    code = "UNKNOWN_ERROR",
    statusCode = 500,
    requestId?: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.statusCode = statusCode;
    this.requestId = requestId;
    this.details = details;
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}
