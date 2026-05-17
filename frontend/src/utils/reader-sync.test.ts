// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/msw/server";
import { pushProgressToServerCAS } from "./reader-sync";
import type { LocalProgress } from "./offline-storage";
import { domainEvents } from "@/domain/events";

// Mock offline-storage so CAS side-effects (IDB writes) don't hit real IndexedDB
vi.mock("./offline-storage", () => ({
  saveProgress: vi.fn().mockResolvedValue(undefined),
  markProgressSynced: vi.fn().mockResolvedValue(undefined),
  adoptServerProgressLocal: vi.fn().mockResolvedValue(undefined),
  removeProgress: vi.fn().mockResolvedValue(undefined),
}));

import {
  saveProgress as mockSaveProgress,
  markProgressSynced as mockMarkProgressSynced,
  adoptServerProgressLocal as mockAdoptServerProgressLocal,
  removeProgress as mockRemoveProgress,
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
  domainEvents.clear();
  server.resetHandlers();
  vi.clearAllMocks();
});

describe("pushProgressToServerCAS — accept path", () => {
  it("returns {status: 'accepted', serverVersion: N} and updates local state", async () => {
    const events: Array<{ bookId: number; hadPosition: boolean; hasPosition: boolean; lastReadAtChanged: boolean }> = [];
    domainEvents.subscribe("readingProgressChanged", (payload) => events.push(payload));

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
    expect(events).toEqual([
      { bookId: 42, hadPosition: true, hasPosition: true, lastReadAtChanged: true },
    ]);
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
      lastDevice: "mobile",
      lastFormat: "epub",
      lastReadAt: new Date().toISOString(),
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

describe("pushProgressToServerCAS — failed path (accepted:false, current:null)", () => {
  it("returns {status: 'failed'} when server returns accepted:false but no current state", async () => {
    server.use(
      http.put("/api/reader/progress/42", () =>
        HttpResponse.json({ accepted: false, current: null }),
      ),
    );

    const result = await pushProgressToServerCAS(baseProgress, { deviceName: "test" });

    expect(result.status).toBe("failed");
    expect(mockSaveProgress).not.toHaveBeenCalled();
    expect(mockAdoptServerProgressLocal).not.toHaveBeenCalled();
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

describe("pushProgressToServerCAS — dropped path (book deleted on server)", () => {
  it("returns {status: 'dropped'} on HTTP 404 and removes local IDB entry", async () => {
    server.use(
      http.put("/api/reader/progress/42", () =>
        HttpResponse.json({ detail: "Book not found" }, { status: 404 }),
      ),
    );

    const result = await pushProgressToServerCAS(baseProgress, { deviceName: "desktop" });

    expect(result.status).toBe("dropped");
    expect(mockRemoveProgress).toHaveBeenCalledOnce();
    expect(mockRemoveProgress).toHaveBeenCalledWith(42);
    // Не трогает остальное: книги нет — нечего marked synced или adopted.
    expect(mockSaveProgress).not.toHaveBeenCalled();
    expect(mockMarkProgressSynced).not.toHaveBeenCalled();
    expect(mockAdoptServerProgressLocal).not.toHaveBeenCalled();
  });
});

describe("pushProgressToServerCAS — keepalive option", () => {
  it("passes keepalive: true to fetch when specified", async () => {
    let capturedKeepalive: boolean | undefined;
    const originalFetch = globalThis.fetch;
    try {
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
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
