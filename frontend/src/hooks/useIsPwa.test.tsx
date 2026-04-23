// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useIsPwa } from "./useIsPwa";

function mockMatchMedia(matches: boolean) {
  globalThis.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function setUrl(search: string) {
  // jsdom permits overriding location fields via the defineProperty trick
  Object.defineProperty(globalThis, "location", {
    value: {
      ...globalThis.location,
      search,
      pathname: "/",
      hash: "",
    },
    configurable: true,
  });
}

describe("useIsPwa", () => {
  beforeEach(() => {
    sessionStorage.clear();
    setUrl("");
  });

  it("returns false when neither standalone nor sessionStorage flag set", () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useIsPwa());
    expect(result.current).toBe(false);
  });

  it("returns true when matchMedia reports standalone", () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useIsPwa());
    expect(result.current).toBe(true);
  });

  it("returns true when sessionStorage 'librarium_pwa_debug'='1'", () => {
    mockMatchMedia(false);
    sessionStorage.setItem("librarium_pwa_debug", "1");
    const { result } = renderHook(() => useIsPwa());
    expect(result.current).toBe(true);
  });

  it("?pwa sets sessionStorage flag and returns true", () => {
    mockMatchMedia(false);
    const replaceSpy = vi.fn();
    Object.defineProperty(globalThis, "history", {
      value: { ...globalThis.history, replaceState: replaceSpy },
      configurable: true,
    });
    setUrl("?pwa");
    const { result } = renderHook(() => useIsPwa());
    expect(result.current).toBe(true);
    expect(sessionStorage.getItem("librarium_pwa_debug")).toBe("1");
    expect(replaceSpy).toHaveBeenCalled();
  });

  it("?nopwa clears sessionStorage flag and returns false", () => {
    mockMatchMedia(false);
    sessionStorage.setItem("librarium_pwa_debug", "1");
    setUrl("?nopwa");
    const { result } = renderHook(() => useIsPwa());
    expect(result.current).toBe(false);
    expect(sessionStorage.getItem("librarium_pwa_debug")).toBeNull();
  });
});
