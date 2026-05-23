import { waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalProgress, LocalSettings } from "@/utils/offline-storage";
import { installAppLifecycleForApp, type AppLifecycleDeps } from "../bootstrap";

type MutableNavigator = Navigator & {
  serviceWorker?: {
    register: ReturnType<typeof vi.fn>;
  };
};

const originalVisibilityState = Object.getOwnPropertyDescriptor(Document.prototype, "visibilityState");
const originalNavigatorOnLine = Object.getOwnPropertyDescriptor(Navigator.prototype, "onLine");
const originalServiceWorker = Object.getOwnPropertyDescriptor(Navigator.prototype, "serviceWorker");

const progressRow: LocalProgress = {
  bookId: 7,
  position: "pos",
  fraction: 0.5,
  lastFormat: "epub",
  lastReadAt: 1,
  serverVersion: 2,
  synced: false,
};

const settingsRow: LocalSettings = {
  deviceType: "desktop",
  settings: { theme: "dark" },
  updatedAt: 1,
  synced: false,
};

function setVisibilityState(value: DocumentVisibilityState): void {
  Object.defineProperty(document, "visibilityState", { value, configurable: true });
}

function setOnline(value: boolean): void {
  Object.defineProperty(navigator, "onLine", { value, configurable: true });
}

function createDeps(overrides: Partial<AppLifecycleDeps> = {}): AppLifecycleDeps {
  return {
    window,
    document,
    navigator,
    isProd: false,
    evictExpired: vi.fn().mockResolvedValue(0),
    getUnsyncedProgress: vi.fn().mockResolvedValue([progressRow]),
    getDeviceName: vi.fn(() => "test-device"),
    pushProgressToServerCAS: vi.fn().mockResolvedValue({ status: "accepted", serverVersion: 3 }),
    getUnsyncedSettings: vi.fn().mockResolvedValue([settingsRow]),
    saveSettings: vi.fn().mockResolvedValue({ ok: true }),
    markSettingsSynced: vi.fn().mockResolvedValue(undefined),
    warn: vi.fn(),
    ...overrides,
  };
}

describe("installAppLifecycleForApp", () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    cleanup = undefined;
    setVisibilityState("visible");
    setOnline(true);
    delete (window as Window & { __librariumReaderActiveCount?: number }).__librariumReaderActiveCount;
  });

  afterEach(() => {
    cleanup?.();
    vi.restoreAllMocks();
    if (originalVisibilityState) Object.defineProperty(Document.prototype, "visibilityState", originalVisibilityState);
    if (originalNavigatorOnLine) Object.defineProperty(Navigator.prototype, "onLine", originalNavigatorOnLine);
    if (originalServiceWorker) Object.defineProperty(Navigator.prototype, "serviceWorker", originalServiceWorker);
  });

  it("evicts expired offline books on startup and when going offline", async () => {
    const deps = createDeps();

    cleanup = installAppLifecycleForApp(deps);

    await waitFor(() => expect(deps.evictExpired).toHaveBeenCalledTimes(1));
    window.dispatchEvent(new Event("offline"));
    await waitFor(() => expect(deps.evictExpired).toHaveBeenCalledTimes(2));

    cleanup();
    cleanup = undefined;
    window.dispatchEvent(new Event("offline"));
    await Promise.resolve();
    expect(deps.evictExpired).toHaveBeenCalledTimes(2);
  });

  it("installs lifecycle listeners and startup eviction only once", async () => {
    const deps = createDeps();

    cleanup = installAppLifecycleForApp(deps);
    const secondCleanup = installAppLifecycleForApp(deps);

    await waitFor(() => expect(deps.evictExpired).toHaveBeenCalledTimes(1));
    window.dispatchEvent(new Event("online"));
    await waitFor(() => expect(deps.saveSettings).toHaveBeenCalledTimes(1));

    secondCleanup();
    cleanup = undefined;
    window.dispatchEvent(new Event("online"));
    await Promise.resolve();
    expect(deps.saveSettings).toHaveBeenCalledTimes(1);
  });

  it("syncs progress and settings when the app comes online", async () => {
    const deps = createDeps();

    cleanup = installAppLifecycleForApp(deps);
    window.dispatchEvent(new Event("online"));

    await waitFor(() => expect(deps.pushProgressToServerCAS).toHaveBeenCalledWith(progressRow, { deviceName: "test-device" }));
    expect(deps.saveSettings).toHaveBeenCalledWith(settingsRow.settings);
    expect(deps.markSettingsSynced).toHaveBeenCalledWith("desktop");
  });

  it("skips background progress sync while the reader is active but still syncs settings", async () => {
    const deps = createDeps();
    (window as Window & { __librariumReaderActiveCount?: number }).__librariumReaderActiveCount = 1;

    cleanup = installAppLifecycleForApp(deps);
    window.dispatchEvent(new Event("online"));

    await waitFor(() => expect(deps.saveSettings).toHaveBeenCalledWith(settingsRow.settings));
    expect(deps.pushProgressToServerCAS).not.toHaveBeenCalled();
  });

  it("syncs on visible online tab resume only", async () => {
    const deps = createDeps();

    cleanup = installAppLifecycleForApp(deps);
    setVisibilityState("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    await Promise.resolve();
    expect(deps.getUnsyncedProgress).not.toHaveBeenCalled();

    setVisibilityState("visible");
    setOnline(false);
    document.dispatchEvent(new Event("visibilitychange"));
    await Promise.resolve();
    expect(deps.getUnsyncedProgress).not.toHaveBeenCalled();

    setOnline(true);
    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => expect(deps.pushProgressToServerCAS).toHaveBeenCalledWith(progressRow, { deviceName: "test-device" }));
  });

  it("continues syncing settings entries after one entry fails", async () => {
    const secondSettingsRow: LocalSettings = {
      ...settingsRow,
      deviceType: "mobile",
      settings: { fontSize: 18 },
    };
    const deps = createDeps({
      getUnsyncedProgress: vi.fn().mockResolvedValue([]),
      getUnsyncedSettings: vi.fn().mockResolvedValue([settingsRow, secondSettingsRow]),
      saveSettings: vi.fn()
        .mockRejectedValueOnce(new Error("network"))
        .mockResolvedValueOnce({ ok: true }),
    });

    cleanup = installAppLifecycleForApp(deps);
    window.dispatchEvent(new Event("online"));

    await waitFor(() => expect(deps.markSettingsSynced).toHaveBeenCalledWith("mobile"));
    expect(deps.markSettingsSynced).not.toHaveBeenCalledWith("desktop");
    expect(deps.warn).toHaveBeenCalledWith("Failed to sync settings entry:", expect.any(Error));
  });

  it("registers the service worker only in production", async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "serviceWorker", {
      value: { register },
      configurable: true,
    });
    const deps = createDeps({ isProd: true, navigator: navigator as MutableNavigator });

    cleanup = installAppLifecycleForApp(deps);
    window.dispatchEvent(new Event("load"));

    await waitFor(() => expect(register).toHaveBeenCalledWith("/sw.js"));

    cleanup();
    cleanup = undefined;
    register.mockClear();

    cleanup = installAppLifecycleForApp(createDeps({ isProd: false, navigator: navigator as MutableNavigator }));
    window.dispatchEvent(new Event("load"));
    await Promise.resolve();
    expect(register).not.toHaveBeenCalled();
  });
});
