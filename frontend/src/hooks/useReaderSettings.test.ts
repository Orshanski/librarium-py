// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../test/msw/server";
import { useReaderSettings } from "./useReaderSettings";
import type { LocalSettings } from "../utils/offline-storage";
import type { ReaderSettings } from "@/types/reader-settings";

// Mock offline-storage to avoid real IDB in hook tests
vi.mock("../utils/offline-storage", () => ({
  getSettings: vi.fn().mockResolvedValue(null),
  saveSettings: vi.fn().mockResolvedValue(undefined),
  markSettingsSynced: vi.fn().mockResolvedValue(undefined),
}));

import {
  saveSettings as mockSaveLocalSettings,
  markSettingsSynced as mockMarkSettingsSynced,
} from "../utils/offline-storage";

afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
  vi.useRealTimers();
});

const deviceName = "desktop";

describe("useReaderSettings — fresh device (no local settings)", () => {
  it("seeds state from server when no local settings exist", async () => {
    const serverSettingsResponse = {
      settings: { fontSize: 18, theme: "dark" },
    };

    server.use(
      http.get("/api/reader/settings", () =>
        HttpResponse.json(serverSettingsResponse),
      ),
    );

    const localSettings: LocalSettings | null = null;
    const { result } = renderHook(() => useReaderSettings({ deviceName }));

    await act(async () => {
      await result.current.syncSettingsWithServer(localSettings);
    });

    // After sync with no local settings, hook should adopt server settings
    expect(result.current.settings).toMatchObject({ fontSize: 18, theme: "dark" });
    expect(mockSaveLocalSettings).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(mockMarkSettingsSynced).toHaveBeenCalledOnce();
    });
  });
});

describe("useReaderSettings — unsynced local settings", () => {
  it("pushes local settings to server when localSettings.synced=false", async () => {
    let capturedBody: unknown = null;
    server.use(
      http.get("/api/reader/settings", () =>
        HttpResponse.json({ settings: { fontSize: 16 } }),
      ),
      http.put("/api/reader/settings", async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ ok: true });
      }),
    );

    const localSettings: LocalSettings = {
      deviceType: deviceName,
      settings: { fontSize: 20, theme: "sepia" },
      updatedAt: Date.now(),
      synced: false,
    };

    const { result } = renderHook(() => useReaderSettings({ deviceName }));

    await act(async () => {
      await result.current.syncSettingsWithServer(localSettings);
    });

    // Should have pushed local settings to server
    expect(capturedBody).toEqual({ settings: { fontSize: 20, theme: "sepia" } });
    expect(mockMarkSettingsSynced).toHaveBeenCalledOnce();
  });
});

describe("useReaderSettings — debounced save on handleSettingsChange", () => {
  it("calls saveSettings after 1500ms debounce", async () => {
    vi.useFakeTimers();

    server.use(
      http.put("/api/reader/settings", () => HttpResponse.json({ ok: true })),
    );

    const { result } = renderHook(() => useReaderSettings({ deviceName }));

    act(() => {
      const newSettings: ReaderSettings = { ...result.current.settings, fontSize: 22 };
      result.current.handleSettingsChange(newSettings);
    });

    // Should not have saved yet (debounce pending)
    expect(mockSaveLocalSettings).not.toHaveBeenCalled();

    // Advance timer past debounce threshold and flush promises
    await act(async () => {
      vi.advanceTimersByTime(1600);
    });

    expect(mockSaveLocalSettings).toHaveBeenCalledOnce();
  });
});
