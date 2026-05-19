import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRefreshOnReadingNowOnline } from "../useRefreshOnReadingNowOnline";
import * as refreshModule from "../../utils/offline-metadata-refresh";

describe("useRefreshOnReadingNowOnline", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calls refreshOfflineSnapshots when enabled becomes true", async () => {
    const spy = vi.spyOn(refreshModule, "refreshOfflineSnapshots").mockResolvedValue();
    renderHook(({ enabled }: { enabled: boolean }) => useRefreshOnReadingNowOnline(enabled), {
      initialProps: { enabled: true },
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("does not call refresh when enabled is false", async () => {
    const spy = vi.spyOn(refreshModule, "refreshOfflineSnapshots").mockResolvedValue();
    renderHook(({ enabled }: { enabled: boolean }) => useRefreshOnReadingNowOnline(enabled), {
      initialProps: { enabled: false },
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("re-fires on enabled transition false → true", async () => {
    const spy = vi.spyOn(refreshModule, "refreshOfflineSnapshots").mockResolvedValue();
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useRefreshOnReadingNowOnline(enabled),
      { initialProps: { enabled: false } },
    );
    expect(spy).not.toHaveBeenCalled();
    rerender({ enabled: true });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
