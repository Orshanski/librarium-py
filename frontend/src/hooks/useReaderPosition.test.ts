// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../test/msw/server";
import { useReaderPosition } from "./useReaderPosition";
import type { LocalProgress } from "../utils/offline-storage";

// Mock offline-storage to avoid real IDB
vi.mock("../utils/offline-storage", () => ({
  getProgress: vi.fn().mockResolvedValue(null),
  saveProgress: vi.fn().mockResolvedValue(undefined),
  markProgressSynced: vi.fn().mockResolvedValue(undefined),
  adoptServerProgressLocal: vi.fn().mockResolvedValue(undefined),
}));

// Mock reader-sync CAS helper to control its behavior in tests
vi.mock("../utils/reader-sync", () => ({
  pushProgressToServerCAS: vi.fn().mockResolvedValue({ status: "accepted", serverVersion: 2 }),
}));

import { pushProgressToServerCAS as mockPushCAS } from "../utils/reader-sync";
import { adoptServerProgressLocal as mockAdoptLocal } from "../utils/offline-storage";

afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
});

const hookOptions = {
  bookId: "42",
  format: "epub",
  positionKind: "cfi" as const,
  deviceName: "desktop",
};

describe("useReaderPosition — syncProgressWithServer", () => {
  it("calls pushProgressToServer when local is unsynced and server has same version", async () => {
    const serverState = {
      position: '{"kind":"cfi","value":"epubcfi(/6/2!/4/2/2:0)"}',
      fraction: 0.3,
      last_device: "desktop",
      last_format: "epub",
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
      last_device: "mobile",
      last_format: "epub",
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
});
