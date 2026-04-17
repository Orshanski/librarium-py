/**
 * Normalized error model for the typed API client.
 *
 * - Network/transport errors map to OfflineError (no response available).
 * - HTTP 4xx/5xx map to concrete ApiError subclasses by status.
 * - Pydantic 422 keeps `detail` as a list of {type, loc, msg} items
 *   (FastAPI's native validation shape).
 * - AbortError (from AbortController) is NOT mapped — client rethrows
 *   the native DOMException. Callers identify via `error.name === "AbortError"`.
 */

export interface PydanticDetailItem {
  type: string;
  loc: (string | number)[];
  msg: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
    message?: string,
  ) {
    super(message ?? detail);
    this.name = this.constructor.name;
  }
}

export class OfflineError extends Error {
  readonly name = "OfflineError" as const;
  constructor(message = "Offline or network unreachable") {
    super(message);
  }
}

export class UnauthenticatedError extends ApiError {}
export class ForbiddenError extends ApiError {}
export class NotFoundError extends ApiError {}
export class ConflictError extends ApiError {}

export class ValidationError extends ApiError {
  constructor(readonly fields: PydanticDetailItem[], message = "Validation failed") {
    // `detail` stays the raw JSON for debug visibility; primary consumers use `fields`.
    super(422, JSON.stringify(fields), message);
  }
}

export class ServerError extends ApiError {}
export class UnknownError extends ApiError {}
