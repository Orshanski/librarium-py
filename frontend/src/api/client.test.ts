// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/msw/server";
import { client } from "./client";
import {
  ApiError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ServerError,
  UnauthenticatedError,
  UnknownError,
  ValidationError,
} from "./errors";

// Server is already listening via global setupFiles.
afterEach(() => server.resetHandlers());

describe("client — happy path", () => {
  it("parses JSON response", async () => {
    server.use(http.get("/api/thing", () => HttpResponse.json({ ok: 1 })));
    const data = await client<{ ok: number }>("GET", "/api/thing");
    expect(data).toEqual({ ok: 1 });
  });

  it("serializes JSON body and sets Content-Type", async () => {
    let captured: { headers: Record<string, string>; body: string } | null = null;
    server.use(
      http.post("/api/thing", async ({ request }) => {
        const body = await request.text();
        captured = {
          headers: Object.fromEntries(request.headers.entries()),
          body,
        };
        return HttpResponse.json({ ok: true });
      }),
    );
    await client("POST", "/api/thing", { body: { a: 1 } });
    expect(captured!.headers["content-type"]).toContain("application/json");
    expect(captured!.headers["x-requested-with"]).toBe("XMLHttpRequest");
    expect(captured!.body).toBe('{"a":1}');
  });

  it("does NOT set Content-Type for FormData body", async () => {
    let capturedContentType: string | undefined;
    server.use(
      http.post("/api/upload", ({ request }) => {
        capturedContentType = request.headers.get("content-type") ?? undefined;
        return HttpResponse.json({ ok: true });
      }),
    );
    const form = new FormData();
    form.append("file", new Blob(["x"]), "x.txt");
    await client("POST", "/api/upload", { body: form });
    // multipart/form-data with boundary set by runtime, never application/json.
    expect(capturedContentType ?? "").toContain("multipart/form-data");
  });

  it("builds query string from query options", async () => {
    let requestedUrl = "";
    server.use(
      http.get("/api/list", ({ request }) => {
        requestedUrl = request.url;
        return HttpResponse.json({ items: [] });
      }),
    );
    await client("GET", "/api/list", { query: { q: "hello", limit: 10, skip: undefined } });
    expect(requestedUrl).toContain("q=hello");
    expect(requestedUrl).toContain("limit=10");
    expect(requestedUrl).not.toContain("skip=");
  });
});

describe("client — error mapping", () => {
  it.each([
    [401, UnauthenticatedError],
    [403, ForbiddenError],
    [404, NotFoundError],
    [409, ConflictError],
    [500, ServerError],
    [503, ServerError],
    [418, UnknownError],
  ])("status %s maps to %s", async (status, Cls) => {
    server.use(
      http.get("/api/err", () =>
        HttpResponse.json({ detail: "Something" }, { status }),
      ),
    );
    await expect(client("GET", "/api/err")).rejects.toBeInstanceOf(Cls);
  });

  it("status 422 maps to ValidationError with typed fields", async () => {
    const fields = [{ type: "missing", loc: ["body", "title"], msg: "Field required" }];
    server.use(
      http.post("/api/v", () => HttpResponse.json({ detail: fields }, { status: 422 })),
    );
    try {
      await client("POST", "/api/v", { body: {} });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).fields).toEqual(fields);
    }
  });

  it("error without usable detail falls back to HTTP N", async () => {
    server.use(http.get("/api/err", () => HttpResponse.json({}, { status: 500 })));
    try {
      await client("GET", "/api/err");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).detail).toBe("HTTP 500");
    }
  });
});

describe("client — AbortError passthrough", () => {
  it("rethrows AbortError as-is, not mapped to ApiError", async () => {
    const ctl = new AbortController();
    // Abort the signal before the request even starts.
    ctl.abort();
    try {
      await client("GET", "/api/slow", { signal: ctl.signal });
      expect.unreachable();
    } catch (err) {
      // AbortError is a DOMException with name "AbortError".
      // Not mapped to ApiError — rethrown as-is.
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).name).toBe("AbortError");
      expect(err).not.toBeInstanceOf(ApiError);
    }
  });
});
