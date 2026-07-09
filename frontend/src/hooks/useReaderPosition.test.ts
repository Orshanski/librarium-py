// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../test/msw/server";
import { useReaderPosition } from "./useReaderPosition";
import type { LocalProgress } from "../utils/offline-storage";
import type { PushResult } from "../utils/reader-sync";

// Mock offline-storage to avoid real IDB
vi.mock("../utils/offline-storage", () => ({
  getProgress: vi.fn().mockResolvedValue(null),
  saveProgress: vi.fn().mockResolvedValue(undefined),
  removeProgress: vi.fn().mockResolvedValue(undefined),
  markProgressSynced: vi.fn().mockResolvedValue(undefined),
  adoptServerProgressLocal: vi.fn().mockResolvedValue(undefined),
}));

// Mock reader-sync CAS helper to control its behavior in tests
vi.mock("../utils/reader-sync", () => ({
  pushProgressToServerCAS: vi.fn().mockResolvedValue({ status: "accepted", serverVersion: 2 }),
}));

import { pushProgressToServerCAS as mockPushCAS } from "../utils/reader-sync";
import {
  adoptServerProgressLocal as mockAdoptLocal,
  getProgress as mockGetProgress,
  removeProgress as mockRemoveProgress,
  saveProgress as mockSaveProgress,
} from "../utils/offline-storage";

afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
  vi.mocked(mockGetProgress).mockReset().mockResolvedValue(null);
  vi.mocked(mockSaveProgress).mockReset().mockResolvedValue(undefined);
  vi.mocked(mockPushCAS).mockReset().mockResolvedValue({ status: "accepted", serverVersion: 2 });
});

const hookOptions = {
  bookId: "42",
  format: "epub",
  positionKind: "cfi" as const,
  deviceName: "desktop",
};

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function installProgressStore(): {
  current: () => LocalProgress | null;
  reconcile: (sent: LocalProgress, serverVersion: number) => void;
  remove: () => void;
} {
  let stored: LocalProgress | null = {
    bookId: 42,
    position: JSON.stringify({ kind: "cfi", value: "start" }),
    fraction: 0.8,
    lastFormat: "epub",
    lastReadAt: 0,
    serverVersion: 4,
    synced: true,
  };

  vi.mocked(mockGetProgress).mockImplementation(async () => stored ? { ...stored } : null);
  vi.mocked(mockSaveProgress).mockImplementation(async (bookId, data) => {
    stored = {
      bookId,
      ...data,
      serverVersion: data.serverVersion ?? stored?.serverVersion ?? 0,
      synced: false,
    };
  });

  return {
    current: () => stored ? { ...stored } : null,
    reconcile: (sent, serverVersion) => {
      if (!stored) return;
      const matches = stored.position === sent.position
        && stored.fraction === sent.fraction
        && stored.lastFormat === sent.lastFormat
        && stored.lastReadAt === sent.lastReadAt
        && stored.serverVersion === sent.serverVersion;
      stored = { ...stored, serverVersion, synced: matches };
    },
    remove: () => {
      stored = null;
    },
  };
}

function installDeferredPush(
  pending: ReturnType<typeof deferred<PushResult>>,
  store: ReturnType<typeof installProgressStore>,
): (progress: LocalProgress) => Promise<PushResult> {
  return async (progress) => {
    const result = await pending.promise;
    if ((result.status === "accepted" || result.status === "rebased") && result.serverVersion != null) {
      store.reconcile(progress, result.serverVersion);
    } else if (result.status === "dropped") {
      store.remove();
    }
    return result;
  };
}

describe("useReaderPosition — syncProgressWithServer", () => {
  it("calls pushProgressToServer when local is unsynced and server has same version", async () => {
    const serverState = {
      position: '{"kind":"cfi","value":"epubcfi(/6/2!/4/2/2:0)"}',
      fraction: 0.3,
      lastDevice: "desktop",
      lastFormat: "epub",
      version: 1,
    };

    server.use(
      http.get("/api/reader/progress/42", () => HttpResponse.json(serverState)),
    );

    const localProgress: LocalProgress = {
      bookId: 42,
      position: '{"kind":"cfi","value":"epubcfi(/6/4!/4/2/2:0)"}',
      fraction: 0.5,
      lastFormat: "epub",
      lastReadAt: Date.now(),
      serverVersion: 1,
      synced: false,
    };
    vi.mocked(mockGetProgress).mockResolvedValue(localProgress);

    const { result } = renderHook(() => useReaderPosition(hookOptions));

    await act(async () => {
      await result.current.syncProgressWithServer(42, localProgress);
    });

    // Unsynced local — should push to server via CAS
    expect(mockPushCAS).toHaveBeenCalledOnce();
    expect(mockPushCAS).toHaveBeenCalledWith(
      localProgress,
      expect.objectContaining({ deviceName: "desktop" }),
    );
  });

  it("adopts server progress when no local and server has newer version", async () => {
    const serverState = {
      position: '{"kind":"cfi","value":"epubcfi(/6/8!/4/2/2:0)"}',
      fraction: 0.9,
      lastDevice: "mobile",
      lastFormat: "epub",
      version: 5,
    };

    server.use(
      http.get("/api/reader/progress/42", () => HttpResponse.json(serverState)),
    );

    // No local progress (null) — localServerVersion = 0, server version = 5 > 0
    const localProgress: LocalProgress | null = null;

    const { result } = renderHook(() => useReaderPosition(hookOptions));

    await act(async () => {
      await result.current.syncProgressWithServer(42, localProgress);
    });

    // Should adopt server state (no local → adopt)
    expect(mockPushCAS).not.toHaveBeenCalled();
    expect(mockAdoptLocal).toHaveBeenCalledOnce();
    // initialPosition should be set from server
    expect(result.current.initialPosition).not.toBeNull();
  });

  it("clears synced local progress when server has no position", async () => {
    server.use(
      http.get("/api/reader/progress/42", () => HttpResponse.json({
        position: null,
        fraction: null,
        lastDevice: null,
        lastFormat: null,
        version: 0,
      })),
    );

    const localProgress: LocalProgress = {
      bookId: 42,
      position: '{"kind":"cfi","value":"epubcfi(/6/4!/4/2/2:0)"}',
      fraction: 0.5,
      lastFormat: "epub",
      lastReadAt: Date.now(),
      serverVersion: 1,
      synced: true,
    };

    const { result } = renderHook(() => useReaderPosition(hookOptions));

    act(() => {
      result.current.applyLocalProgress(localProgress);
    });
    expect(result.current.initialPosition).toBe("epubcfi(/6/4!/4/2/2:0)");

    await act(async () => {
      await result.current.syncProgressWithServer(42, localProgress);
    });

    expect(mockRemoveProgress).toHaveBeenCalledWith(42);
    expect(result.current.initialPosition).toBeNull();
  });

  it("clears unsynced local progress with a prior server version when server has no position", async () => {
    server.use(
      http.get("/api/reader/progress/42", () => HttpResponse.json({
        position: null,
        fraction: null,
        lastDevice: null,
        lastFormat: null,
        version: 0,
      })),
    );

    const localProgress: LocalProgress = {
      bookId: 42,
      position: '{"kind":"cfi","value":"epubcfi(/6/4!/4/2/2:0)"}',
      fraction: 0.5,
      lastFormat: "epub",
      lastReadAt: Date.now(),
      serverVersion: 1,
      synced: false,
    };

    const { result } = renderHook(() => useReaderPosition(hookOptions));

    act(() => {
      result.current.applyLocalProgress(localProgress);
    });

    await act(async () => {
      await result.current.syncProgressWithServer(42, localProgress);
    });

    expect(mockPushCAS).not.toHaveBeenCalled();
    expect(mockRemoveProgress).toHaveBeenCalledWith(42);
    expect(result.current.initialPosition).toBeNull();
  });
});

describe("useReaderPosition — rapid progress pushes", () => {
  it("coalesces positions saved during P1 into one fresh P6 push", async () => {
    const store = installProgressStore();
    const firstPush = deferred<PushResult>();
    const secondPush = deferred<PushResult>();
    vi.mocked(mockPushCAS)
      .mockImplementationOnce(installDeferredPush(firstPush, store))
      .mockImplementationOnce(installDeferredPush(secondPush, store))
      .mockImplementation(async (progress) => {
        store.reconcile(progress, 99);
        return { status: "accepted", serverVersion: 99 };
      });
    const { result } = renderHook(() => useReaderPosition(hookOptions));

    act(() => result.current.handleSavePosition("p1", 0.6));
    await waitFor(() => expect(mockPushCAS).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.handleSavePosition("p2", 0.5);
      result.current.handleSavePosition("p3", 0.4);
      result.current.handleSavePosition("p4", 0.3);
      result.current.handleSavePosition("p5", 0.25);
      result.current.handleSavePosition("p6", 0.2);
    });
    await waitFor(() => expect(mockSaveProgress).toHaveBeenCalledTimes(6));
    expect(mockPushCAS).toHaveBeenCalledTimes(1);
    expect(mockPushCAS).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        position: JSON.stringify({ kind: "cfi", value: "p1" }),
        serverVersion: 4,
      }),
      expect.objectContaining({ deviceName: "desktop", keepalive: true }),
    );

    act(() => firstPush.resolve({ status: "accepted", serverVersion: 5 }));
    await waitFor(() => expect(mockPushCAS).toHaveBeenCalledTimes(2));
    expect(mockPushCAS).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        position: JSON.stringify({ kind: "cfi", value: "p6" }),
        serverVersion: 5,
      }),
      expect.objectContaining({ deviceName: "desktop", keepalive: true }),
    );

    await act(async () => {
      secondPush.resolve({ status: "accepted", serverVersion: 6 });
      await secondPush.promise;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    expect(mockPushCAS).toHaveBeenCalledTimes(2);
    expect(store.current()).toMatchObject({
      position: JSON.stringify({ kind: "cfi", value: "p6" }),
      serverVersion: 6,
      synced: true,
    });
  });

  it("does not immediately retry positions queued before a failed push", async () => {
    const store = installProgressStore();
    const firstPush = deferred<PushResult>();
    vi.mocked(mockPushCAS)
      .mockImplementationOnce(installDeferredPush(firstPush, store))
      .mockImplementation(async (progress) => {
        store.reconcile(progress, 5);
        return { status: "accepted", serverVersion: 5 };
      });
    const { result } = renderHook(() => useReaderPosition(hookOptions));

    act(() => result.current.handleSavePosition("p1", 0.6));
    await waitFor(() => expect(mockPushCAS).toHaveBeenCalledTimes(1));
    act(() => {
      result.current.handleSavePosition("p2", 0.5);
      result.current.handleSavePosition("p3", 0.4);
      result.current.handleSavePosition("p4", 0.3);
      result.current.handleSavePosition("p5", 0.25);
      result.current.handleSavePosition("p6", 0.2);
    });
    await waitFor(() => expect(mockSaveProgress).toHaveBeenCalledTimes(6));

    await act(async () => {
      firstPush.resolve({ status: "failed" });
      await firstPush.promise;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    expect(mockPushCAS).toHaveBeenCalledTimes(1);

    act(() => result.current.handleSavePosition("p7", 0.1));
    await waitFor(() => expect(mockPushCAS).toHaveBeenCalledTimes(2));
    expect(mockPushCAS).toHaveBeenLastCalledWith(
      expect.objectContaining({ position: JSON.stringify({ kind: "cfi", value: "p7" }) }),
      expect.objectContaining({ deviceName: "desktop", keepalive: true }),
    );
  });

  it("does not push queued positions after the first push is dropped", async () => {
    const store = installProgressStore();
    const firstPush = deferred<PushResult>();
    vi.mocked(mockPushCAS)
      .mockImplementationOnce(installDeferredPush(firstPush, store))
      .mockResolvedValue({ status: "accepted", serverVersion: 5 });
    const { result } = renderHook(() => useReaderPosition(hookOptions));

    act(() => result.current.handleSavePosition("p1", 0.6));
    await waitFor(() => expect(mockPushCAS).toHaveBeenCalledTimes(1));
    act(() => {
      result.current.handleSavePosition("p2", 0.5);
      result.current.handleSavePosition("p3", 0.4);
      result.current.handleSavePosition("p4", 0.3);
      result.current.handleSavePosition("p5", 0.25);
      result.current.handleSavePosition("p6", 0.2);
    });
    await waitFor(() => expect(mockSaveProgress).toHaveBeenCalledTimes(6));

    await act(async () => {
      firstPush.resolve({ status: "dropped" });
      await firstPush.promise;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    expect(mockPushCAS).toHaveBeenCalledTimes(1);
    expect(store.current()).toBeNull();
  });
});
