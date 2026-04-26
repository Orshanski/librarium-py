import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  OfflineError,
  ServerError,
  UnauthenticatedError,
  UnknownError,
  ValidationError,
  type PydanticDetailItem,
} from "./errors";
import { bumpScrollCounter } from "../utils/scroll-counter";
import { shouldSkipScrollBump } from "./non-bumping-paths";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Primitive values acceptable as query-string parameters. Objects are excluded
 * because URLSearchParams stringifies them as "[object Object]" — almost never
 * what callers want.
 */
export type ClientQueryValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Array<string | number | boolean | null | undefined>;

export type ClientQuery = Record<string, ClientQueryValue>;

export interface ClientOptions {
  /** Query-string parameters. Keys with undefined/null values are skipped. */
  query?: ClientQuery;
  /** Request body. FormData passed as-is; other values JSON-stringified. */
  body?: unknown;
  /** AbortSignal — AbortError rethrown as-is, not mapped to ApiError. */
  signal?: AbortSignal;
  /** If true, parse response as Blob (for binary endpoints). */
  blob?: boolean;
  /**
   * Optional progress callback for blob downloads. Emits (percent, bytes).
   * When Content-Length is unknown, percent is -1 and bytes is received so far.
   * Only active when blob: true.
   */
  onProgress?: (percent: number, bytes: number) => void;
  /** Pass-through to fetch's keepalive option (for unload-time sends). */
  keepalive?: boolean;
}

const CSRF_METHODS = new Set<HttpMethod>(["POST", "PUT", "PATCH", "DELETE"]);

function buildUrl(path: string, query?: ClientQuery): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const v of value) {
        if (v === undefined || v === null) continue;
        params.append(key, String(v));
      }
    } else {
      params.append(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

async function mapErrorResponse(res: Response): Promise<never> {
  const body: unknown = await res.json().catch(() => ({}));
  const detail = (body as { detail?: unknown }).detail;

  if (res.status === 422) {
    const fields = Array.isArray(detail) ? (detail as PydanticDetailItem[]) : [];
    throw new ValidationError(fields);
  }

  const detailString = typeof detail === "string" ? detail : `HTTP ${res.status}`;

  switch (res.status) {
    case 401:
      throw new UnauthenticatedError(401, detailString);
    case 403:
      throw new ForbiddenError(403, detailString);
    case 404:
      throw new NotFoundError(404, detailString);
    case 409:
      throw new ConflictError(409, detailString);
  }

  if (res.status >= 500) {
    throw new ServerError(res.status, detailString);
  }

  throw new UnknownError(res.status, detailString);
}

function prepareRequestInit(method: HttpMethod, options: ClientOptions): RequestInit {
  const headers = new Headers();
  let body: BodyInit | undefined;

  if (options.body !== undefined) {
    if (options.body instanceof FormData) {
      body = options.body;
    } else {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(options.body);
    }
  }

  if (CSRF_METHODS.has(method)) {
    headers.set("X-Requested-With", "XMLHttpRequest");
  }

  return {
    method,
    headers,
    body,
    credentials: "include",
    signal: options.signal,
    keepalive: options.keepalive,
  };
}

async function executeFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    // AbortError is regular control-flow, rethrow unwrapped.
    // Check by name since different runtimes may have different error types.
    if (err instanceof Error && err.name === "AbortError") {
      throw err;
    }
    // TypeError from fetch typically means network failure / offline.
    throw new OfflineError();
  }
}

/**
 * Reads a blob from the response body and emits progress events while doing so.
 * If the runtime does not expose a readable body stream (older runtimes,
 * test fakes), falls back to a single `res.blob()` call WITHOUT firing onProgress —
 * there is no way to observe partial reads in that case.
 */
async function readBlobWithProgress(
  res: Response,
  onProgress: (percent: number, bytes: number) => void,
): Promise<Blob> {
  const reader = res.body?.getReader();
  if (!reader) {
    return await res.blob();
  }
  const totalHeader = res.headers.get("Content-Length");
  const total = totalHeader ? Number(totalHeader) : 0;
  let received = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total > 0) {
      onProgress(Math.round((received / total) * 100), received);
    } else {
      // Unknown total — emit percent = -1 as the "no Content-Length" sentinel;
      // callers render `bytes` directly in MB instead of a percentage.
      onProgress(-1, received);
    }
  }
  return new Blob(chunks as BlobPart[]);
}

async function parseResponseBody<T>(res: Response, options: ClientOptions): Promise<T> {
  if (options.blob) {
    if (options.onProgress) {
      return (await readBlobWithProgress(res, options.onProgress)) as T;
    }
    return (await res.blob()) as T;
  }
  // 204 No Content — no body to parse.
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export async function client<T>(
  method: HttpMethod,
  path: string,
  options: ClientOptions = {},
): Promise<T> {
  const url = buildUrl(path, options.query);
  const init = prepareRequestInit(method, options);
  const res = await executeFetch(url, init);

  if (!res.ok) {
    await mapErrorResponse(res);
  }

  if (CSRF_METHODS.has(method) && !shouldSkipScrollBump(method, path)) {
    bumpScrollCounter();
  }

  return parseResponseBody<T>(res, options);
}

/**
 * Minimal fetch for non-API static resources (e.g. /version.txt).
 * Bypasses the typed-API error model — just returns text on 200 or throws.
 */
export async function fetchStatic(path: string, init?: RequestInit): Promise<string> {
  const res = await fetch(path, init);
  if (!res.ok) {
    throw new Error(`fetchStatic ${path}: HTTP ${res.status}`);
  }
  return res.text();
}
