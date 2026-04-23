// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useRef } from "react";
import type { EbookReaderHandle } from "../types/reader-handle";
import { useReaderLifecycle } from "./useReaderLifecycle";

function makeReader(): EbookReaderHandle {
  return {
    performNavigation: vi.fn().mockResolvedValue(undefined),
    hasRenderer: vi.fn().mockReturnValue(true),
  } as unknown as EbookReaderHandle;
}

describe("useReaderLifecycle", () => {
  beforeEach(() => {
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });

  it("no-op when resumePosition is null", () => {
    const reader = makeReader();
    const clearResume = vi.fn();
    renderHook(() => {
      const ref = useRef<EbookReaderHandle | null>(reader);
      return useReaderLifecycle(ref, true, null, clearResume);
    });
    expect(reader.performNavigation).not.toHaveBeenCalled();
    expect(clearResume).not.toHaveBeenCalled();
  });

  it("no-op when bookReady is false", () => {
    const reader = makeReader();
    const clearResume = vi.fn();
    renderHook(() => {
      const ref = useRef<EbookReaderHandle | null>(reader);
      return useReaderLifecycle(ref, false, "cfi:/6/4!/4/1:0", clearResume);
    });
    expect(reader.performNavigation).not.toHaveBeenCalled();
  });

  it("calls performNavigation + clearResumePosition when ready + resumePosition set", async () => {
    const reader = makeReader();
    const clearResume = vi.fn();
    renderHook(() => {
      const ref = useRef<EbookReaderHandle | null>(reader);
      return useReaderLifecycle(ref, true, "cfi:/6/4!/4/1:0", clearResume);
    });
    await waitFor(() => {
      expect(reader.performNavigation).toHaveBeenCalledWith({ type: "goTo", target: "cfi:/6/4!/4/1:0" });
    });
    await waitFor(() => {
      expect(clearResume).toHaveBeenCalled();
    });
  });

  it("visibilitychange reloads when renderer is gone", () => {
    const reloadSpy = vi.fn();
    const originalLocation = globalThis.location;
    Object.defineProperty(globalThis, "location", {
      value: { ...originalLocation, reload: reloadSpy },
      configurable: true,
    });
    try {
      const reader = makeReader();
      vi.mocked(reader.hasRenderer).mockReturnValue(false);
      renderHook(() => {
        const ref = useRef<EbookReaderHandle | null>(reader);
        return useReaderLifecycle(ref, true, null, vi.fn());
      });
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      expect(reloadSpy).toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, "location", { value: originalLocation, configurable: true });
    }
  });

  it("visibilitychange no-op when renderer is present", () => {
    const reloadSpy = vi.fn();
    const originalLocation = globalThis.location;
    Object.defineProperty(globalThis, "location", {
      value: { ...originalLocation, reload: reloadSpy },
      configurable: true,
    });
    try {
      const reader = makeReader();
      renderHook(() => {
        const ref = useRef<EbookReaderHandle | null>(reader);
        return useReaderLifecycle(ref, true, null, vi.fn());
      });
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      expect(reloadSpy).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, "location", { value: originalLocation, configurable: true });
    }
  });
});
