// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useReaderSessionFlag } from "./useReaderSessionFlag";

declare global {
  // eslint-disable-next-line no-var
  var __librariumReaderActiveCount: number | undefined;
}

describe("useReaderSessionFlag", () => {
  beforeEach(() => {
    globalThis.__librariumReaderActiveCount = undefined;
  });

  it("increments counter on mount", () => {
    renderHook(() => useReaderSessionFlag());
    expect(globalThis.__librariumReaderActiveCount).toBe(1);
  });

  it("decrements counter on unmount (down to 0)", () => {
    const { unmount } = renderHook(() => useReaderSessionFlag());
    expect(globalThis.__librariumReaderActiveCount).toBe(1);
    unmount();
    expect(globalThis.__librariumReaderActiveCount).toBe(0);
  });

  it("tracks multiple concurrent instances", () => {
    const r1 = renderHook(() => useReaderSessionFlag());
    const r2 = renderHook(() => useReaderSessionFlag());
    expect(globalThis.__librariumReaderActiveCount).toBe(2);
    r1.unmount();
    expect(globalThis.__librariumReaderActiveCount).toBe(1);
    r2.unmount();
    expect(globalThis.__librariumReaderActiveCount).toBe(0);
  });

  it("clamps counter at 0 on unexpected over-decrement", () => {
    globalThis.__librariumReaderActiveCount = 0;
    const { unmount } = renderHook(() => useReaderSessionFlag());
    // mount → 1
    unmount();
    // unmount → 0 (not negative)
    expect(globalThis.__librariumReaderActiveCount).toBe(0);
  });
});
