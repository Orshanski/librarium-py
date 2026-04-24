import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { client } from "../client";
import { ServerError } from "../errors";
import { getScrollCounter } from "../../utils/scroll-counter";

function mockFetchOk(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ),
  );
}

function mockFetchError(status: number): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ detail: "boom" }), {
          status,
          headers: { "content-type": "application/json" },
        }),
    ),
  );
}

describe("client scroll-counter integration", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("PUT /api/books/42 инкрементит scrollCounter", async () => {
    mockFetchOk();
    await client("PUT", "/api/books/42", { body: { title: "t" } });
    expect(getScrollCounter()).toBe(1);
  });

  it("PUT /api/auth/profile не инкрементит (whitelist)", async () => {
    mockFetchOk();
    await client("PUT", "/api/auth/profile", { body: { name: "x" } });
    expect(getScrollCounter()).toBe(0);
  });

  it("GET не инкрементит", async () => {
    mockFetchOk();
    await client("GET", "/api/books");
    expect(getScrollCounter()).toBe(0);
  });

  it("500-ответ не инкрементит (исключение бросается раньше)", async () => {
    mockFetchError(500);
    await expect(client("PUT", "/api/books/42", { body: {} })).rejects.toBeInstanceOf(ServerError);
    expect(getScrollCounter()).toBe(0);
  });

  it("POST /api/books/42/cover не инкрементит (whitelist)", async () => {
    mockFetchOk();
    await client("POST", "/api/books/42/cover", { body: new FormData() });
    expect(getScrollCounter()).toBe(0);
  });

  it("DELETE /api/uploads/abc-123 не инкрементит", async () => {
    mockFetchOk();
    await client("DELETE", "/api/uploads/abc-123");
    expect(getScrollCounter()).toBe(0);
  });
});
