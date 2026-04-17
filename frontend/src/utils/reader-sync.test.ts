// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/msw/server";
import { pushProgressToServerCAS } from "./reader-sync";
import type { LocalProgress } from "./offline-storage";

// Mock offline-storage so CAS side-effects (IDB writes) don't hit real IndexedDB
vi.mock("./offline-storage", () => ({
  saveProgress: vi.fn().mockResolvedValue(undefined),
  markProgressSynced: vi.fn().mockResolvedValue(undefined),
  adoptServerProgressLocal: vi.fn().mockResolvedValue(undefined),
}));

import {
  saveProgress as mockSaveProgress,
  markProgressSynced as mockMarkProgressSynced,
  adoptServerProgressLocal as mockAdoptServerProgressLocal,
} from "./offline-storage";

const baseProgress: LocalProgress = {
  bookId: 42,
  position: '{"kind":"cfi","value":"epubcfi(/6/2!/4/2/2:0)"}',
  fraction: 0.5,
  lastFormat: "epub",
  lastReadAt: Date.now(),
  serverVersion: 3,
  synced: false,
};

afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
});

describe("pushProgressToServerCAS — accept path", () => {
  it("returns {status: 'accepted', serverVersion: N} and updates local state", async () => {
    server.use(
      http.put("/api/reader/progress/42", () =>
        HttpResponse.json({ accepted: true, version: 4, rebased: false }),
      ),
    );

    const result = await pushProgressToServerCAS(baseProgress, { deviceName: "desktop" });

    expect(result.status).toBe("accepted");
    expect(result.serverVersion).toBe(4);
    expect(mockSaveProgress).toHaveBeenCalledOnce();
    expect(mockMarkProgressSynced).toHaveBeenCalledOnce();
    expect(mockAdoptServerProgressLocal).not.toHaveBeenCalled();
  });
});

describe("pushProgressToServerCAS — rebase path", () => {
  it("returns {status: 'rebased'} when server accepted with rebased: true", async () => {
    server.use(
      http.put("/api/reader/progress/42", () =>
        HttpResponse.json({ accepted: true, version: 5, rebased: true }),
      ),
    );

    const result = await pushProgressToServerCAS(baseProgress, { deviceName: "desktop" });

    expect(result.status).toBe("rebased");
    expect(result.serverVersion).toBe(5);
    expect(mockSaveProgress).toHaveBeenCalledOnce();
    expect(mockMarkProgressSynced).toHaveBeenCalledOnce();
  });
});

describe("pushProgressToServerCAS — adopt (conflict) path", () => {
  it("returns {status: 'adopted', adoptedPosition} and adopts server state locally", async () => {
    const serverState = {
      position: '{"kind":"cfi","value":"epubcfi(/6/4!/4/2/2:0)"}',
      fraction: 0.8,
      last_device: "mobile",
      last_format: "epub",
      last_read_at: new Date().toISOString(),
      version: 7,
    };

    server.use(
      http.put("/api/reader/progress/42", () =>
        HttpResponse.json({ accepted: false, current: serverState }),
      ),
    );

    const result = await pushProgressToServerCAS(baseProgress, { deviceName: "desktop" });

    expect(result.status).toBe("adopted");
    expect(result.adoptedPosition).toBe(serverState.position);
    expect(result.serverVersion).toBe(serverState.version);
    expect(mockAdoptServerProgressLocal).toHaveBeenCalledOnce();
    expect(mockSaveProgress).not.toHaveBeenCalled();
  });
});

describe("pushProgressToServerCAS — failed path", () => {
  it("returns {status: 'failed'} on HTTP 500 error", async () => {
    server.use(
      http.put("/api/reader/progress/42", () =>
        HttpResponse.json({ detail: "Internal Server Error" }, { status: 500 }),
      ),
    );

    const result = await pushProgressToServerCAS(baseProgress, { deviceName: "desktop" });

    expect(result.status).toBe("failed");
    expect(mockSaveProgress).not.toHaveBeenCalled();
    expect(mockAdoptServerProgressLocal).not.toHaveBeenCalled();
  });

  it("returns {status: 'failed'} on network error", async () => {
    server.use(
      http.put("/api/reader/progress/42", () => HttpResponse.error()),
    );

    const result = await pushProgressToServerCAS(baseProgress, { deviceName: "desktop" });

    expect(result.status).toBe("failed");
  });
});

describe("pushProgressToServerCAS — keepalive option", () => {
  it("passes keepalive: true to fetch when specified", async () => {
    let capturedKeepalive: boolean | undefined;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      capturedKeepalive = init?.keepalive;
      return originalFetch(url, init);
    });

    server.use(
      http.put("/api/reader/progress/42", () =>
        HttpResponse.json({ accepted: true, version: 4, rebased: false }),
      ),
    );

    await pushProgressToServerCAS(baseProgress, { deviceName: "desktop", keepalive: true });

    expect(capturedKeepalive).toBe(true);
    globalThis.fetch = originalFetch;
  });
});
