// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { server } from "@/test/msw/server";
import { useUpdateAvailable } from "./useUpdateAvailable";

declare global {
  // eslint-disable-next-line no-var
  var __BUILD_VERSION__: string | undefined;
}

function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe("useUpdateAvailable", () => {
  beforeEach(() => {
    globalThis.__BUILD_VERSION__ = undefined;
  });

  it("returns [false, reload] by default when no __BUILD_VERSION__ defined", async () => {
    const { result } = renderHook(() => useUpdateAvailable(), { wrapper: Wrapper });
    const [available, reload] = result.current;
    expect(available).toBe(false);
    expect(typeof reload).toBe("function");
  });

  it("stays false when server version matches build version", async () => {
    globalThis.__BUILD_VERSION__ = "abc123";
    server.use(
      http.get("/version.txt", () => new HttpResponse("abc123", { status: 200 })),
    );
    const { result } = renderHook(() => useUpdateAvailable(), { wrapper: Wrapper });
    await new Promise((r) => setTimeout(r, 30));
    expect(result.current[0]).toBe(false);
  });

  it("flips to true when server version differs from build version", async () => {
    globalThis.__BUILD_VERSION__ = "abc123";
    server.use(
      http.get("/version.txt", () => new HttpResponse("xyz999\n", { status: 200 })),
    );
    const { result } = renderHook(() => useUpdateAvailable(), { wrapper: Wrapper });
    await waitFor(() => {
      expect(result.current[0]).toBe(true);
    });
  });

  it("reload invokes globalThis.location.reload", () => {
    const reloadSpy = vi.fn();
    const originalLocation = globalThis.location;
    Object.defineProperty(globalThis, "location", {
      value: { ...originalLocation, reload: reloadSpy },
      configurable: true,
    });
    try {
      const { result } = renderHook(() => useUpdateAvailable(), { wrapper: Wrapper });
      result.current[1]();
      expect(reloadSpy).toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, "location", { value: originalLocation, configurable: true });
    }
  });
});
