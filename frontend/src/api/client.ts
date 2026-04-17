import {
  ApiError,
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

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ClientOptions {
  /** Query-string parameters. Keys with undefined values are skipped. */
  query?: Record<string, unknown>;
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

function buildUrl(path: string, query?: Record<string, unknown>): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    params.append(key, String(value));
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

export async function client<T>(
  method: HttpMethod,
  path: string,
  options: ClientOptions = {},
): Promise<T> {
  const url = buildUrl(path, options.query);

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

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body,
      credentials: "include",
      signal: options.signal,
      keepalive: options.keepalive,
    });
  } catch (err) {
    // AbortError — штатный control-flow, пробрасываем без оборачивания.
    // Check by name since different runtimes may have different error types.
    if (err instanceof Error && err.name === "AbortError") {
      throw err;
    }
    // TypeError from fetch typically means network failure / offline.
    throw new OfflineError();
  }

  if (!res.ok) {
    await mapErrorResponse(res);
  }

  if (options.blob) {
    if (options.onProgress) {
      const reader = res.body?.getReader();
      if (!reader) {
        return (await res.blob()) as T;
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
          options.onProgress(Math.round((received / total) * 100), received);
        } else {
          // Unknown size: emit -1 as percent sentinel (matches reader-loading-screen's loadProgress < 0 mode).
          options.onProgress(-1, received);
        }
      }
      return new Blob(chunks as BlobPart[]) as T;
    }
    return (await res.blob()) as T;
  }

  // 204 No Content — no body to parse.
  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
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
