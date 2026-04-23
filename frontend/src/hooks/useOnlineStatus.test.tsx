// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useOnlineStatus } from "./useOnlineStatus";

describe("useOnlineStatus", () => {
  it("returns navigator.onLine as initial value", () => {
    // jsdom defaults navigator.onLine to true
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(navigator.onLine);
  });

  it("flips to false on 'offline' event", () => {
    const { result } = renderHook(() => useOnlineStatus());
    act(() => {
      globalThis.dispatchEvent(new Event("offline"));
    });
    expect(result.current).toBe(false);
  });

  it("flips to true on 'online' event after offline", () => {
    const { result } = renderHook(() => useOnlineStatus());
    act(() => {
      globalThis.dispatchEvent(new Event("offline"));
    });
    expect(result.current).toBe(false);
    act(() => {
      globalThis.dispatchEvent(new Event("online"));
    });
    expect(result.current).toBe(true);
  });

  it("unsubscribes listeners on unmount (no leak)", () => {
    const addSpy = vi.spyOn(globalThis, "addEventListener");
    const removeSpy = vi.spyOn(globalThis, "removeEventListener");
    const { unmount } = renderHook(() => useOnlineStatus());
    const addedOnline = addSpy.mock.calls.filter(([t]) => t === "online").length;
    const addedOffline = addSpy.mock.calls.filter(([t]) => t === "offline").length;
    unmount();
    const removedOnline = removeSpy.mock.calls.filter(([t]) => t === "online").length;
    const removedOffline = removeSpy.mock.calls.filter(([t]) => t === "offline").length;
    expect(removedOnline).toBe(addedOnline);
    expect(removedOffline).toBe(addedOffline);
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
