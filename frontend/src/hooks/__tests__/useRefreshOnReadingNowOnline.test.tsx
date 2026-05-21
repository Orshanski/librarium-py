import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useRefreshOnReadingNowOnline } from "../useRefreshOnReadingNowOnline";
import * as refreshModule from "../../utils/offline-metadata-refresh";

function setOnline(value: boolean): void {
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => value });
}

function fireOnlineEvent(event: "online" | "offline"): void {
  globalThis.dispatchEvent(new Event(event));
}

describe("useRefreshOnReadingNowOnline", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setOnline(true);
  });

  afterEach(() => {
    setOnline(true);
  });

  it("вызывает refreshOfflineSnapshots когда isReadingNow=true и online=true", () => {
    const spy = vi.spyOn(refreshModule, "refreshOfflineSnapshots").mockResolvedValue();
    renderHook(({ on }: { on: boolean }) => useRefreshOnReadingNowOnline(on), {
      initialProps: { on: true },
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("не вызывает refresh при isReadingNow=false", () => {
    const spy = vi.spyOn(refreshModule, "refreshOfflineSnapshots").mockResolvedValue();
    renderHook(({ on }: { on: boolean }) => useRefreshOnReadingNowOnline(on), {
      initialProps: { on: false },
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("не вызывает refresh когда оффлайн даже если isReadingNow=true", () => {
    setOnline(false);
    const spy = vi.spyOn(refreshModule, "refreshOfflineSnapshots").mockResolvedValue();
    renderHook(({ on }: { on: boolean }) => useRefreshOnReadingNowOnline(on), {
      initialProps: { on: true },
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("срабатывает при isReadingNow false→true", () => {
    const spy = vi.spyOn(refreshModule, "refreshOfflineSnapshots").mockResolvedValue();
    const { rerender } = renderHook(
      ({ on }: { on: boolean }) => useRefreshOnReadingNowOnline(on),
      { initialProps: { on: false } },
    );
    expect(spy).not.toHaveBeenCalled();
    rerender({ on: true });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("реагирует на переход offline→online при isReadingNow=true", () => {
    setOnline(false);
    const spy = vi.spyOn(refreshModule, "refreshOfflineSnapshots").mockResolvedValue();
    renderHook(({ on }: { on: boolean }) => useRefreshOnReadingNowOnline(on), {
      initialProps: { on: true },
    });
    expect(spy).not.toHaveBeenCalled();

    act(() => {
      setOnline(true);
      fireOnlineEvent("online");
    });

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("вызывается повторно при цикле online→offline→online (нестабильное соединение)", () => {
    setOnline(true);
    const spy = vi.spyOn(refreshModule, "refreshOfflineSnapshots").mockResolvedValue();
    renderHook(({ on }: { on: boolean }) => useRefreshOnReadingNowOnline(on), {
      initialProps: { on: true },
    });
    expect(spy).toHaveBeenCalledTimes(1);

    act(() => {
      setOnline(false);
      fireOnlineEvent("offline");
    });
    expect(spy).toHaveBeenCalledTimes(1);

    act(() => {
      setOnline(true);
      fireOnlineEvent("online");
    });
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
