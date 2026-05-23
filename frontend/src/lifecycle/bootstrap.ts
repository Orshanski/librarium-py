import { saveSettings as defaultSaveSettings } from "@/api/endpoints/reader";
import { getDeviceName as defaultGetDeviceName } from "@/utils/device-info";
import {
  evictExpired as defaultEvictExpired,
  getUnsyncedProgress as defaultGetUnsyncedProgress,
  getUnsyncedSettings as defaultGetUnsyncedSettings,
  markSettingsSynced as defaultMarkSettingsSynced,
  type LocalProgress,
  type LocalSettings,
} from "@/utils/offline-storage";
import {
  pushProgressToServerCAS as defaultPushProgressToServerCAS,
  type PushResult,
} from "@/utils/reader-sync";

interface LifecycleWindow {
  __librariumReaderActiveCount?: number;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
}
type ServiceWorkerNavigator = Navigator & {
  serviceWorker?: {
    register(scriptURL: string | URL, options?: RegistrationOptions): Promise<ServiceWorkerRegistration>;
  };
};

export interface AppLifecycleDeps {
  window?: LifecycleWindow;
  document?: Document;
  navigator?: ServiceWorkerNavigator;
  isProd?: boolean;
  evictExpired?: () => Promise<number>;
  getUnsyncedProgress?: () => Promise<LocalProgress[]>;
  getDeviceName?: () => string;
  pushProgressToServerCAS?: (
    progress: LocalProgress,
    opts: { deviceName: string },
  ) => Promise<PushResult>;
  getUnsyncedSettings?: () => Promise<LocalSettings[]>;
  saveSettings?: (settings: Record<string, unknown>) => Promise<unknown>;
  markSettingsSynced?: (deviceType: string) => Promise<void>;
  warn?: (...args: unknown[]) => void;
}

let cleanupInstalled: (() => void) | null = null;

function isReaderActive(win: LifecycleWindow): boolean {
  return (win.__librariumReaderActiveCount ?? 0) > 0;
}

export function installAppLifecycleForApp(deps: AppLifecycleDeps = {}): () => void {
  if (cleanupInstalled) return cleanupInstalled;

  const win = deps.window ?? globalThis;
  const doc = deps.document ?? document;
  const nav = deps.navigator ?? navigator;
  const isProd = deps.isProd ?? import.meta.env.PROD;
  const evictExpired = deps.evictExpired ?? defaultEvictExpired;
  const getUnsyncedProgress = deps.getUnsyncedProgress ?? defaultGetUnsyncedProgress;
  const getDeviceName = deps.getDeviceName ?? defaultGetDeviceName;
  const pushProgressToServerCAS = deps.pushProgressToServerCAS ?? defaultPushProgressToServerCAS;
  const getUnsyncedSettings = deps.getUnsyncedSettings ?? defaultGetUnsyncedSettings;
  const saveSettings = deps.saveSettings ?? defaultSaveSettings;
  const markSettingsSynced = deps.markSettingsSynced ?? defaultMarkSettingsSynced;
  const warn = deps.warn ?? console.warn;
  const cleanup: Array<() => void> = [];

  async function syncUnsyncedProgress(): Promise<void> {
    try {
      const unsynced = await getUnsyncedProgress();
      const deviceName = getDeviceName();
      for (const progress of unsynced) {
        await pushProgressToServerCAS(progress, { deviceName });
      }
    } catch (err) {
      warn("Failed to sync progress:", err);
    }
  }

  async function syncUnsyncedSettings(): Promise<void> {
    try {
      const unsyncedSettings = await getUnsyncedSettings();
      for (const settings of unsyncedSettings) {
        try {
          await saveSettings(settings.settings);
          await markSettingsSynced(settings.deviceType);
        } catch (err) {
          warn("Failed to sync settings entry:", err);
        }
      }
    } catch (err) {
      warn("Failed to sync settings:", err);
    }
  }

  void evictExpired().catch((err) => warn("Failed to evict expired books:", err));

  const onOnline = async (): Promise<void> => {
    if (!isReaderActive(win)) {
      await syncUnsyncedProgress();
    }
    await syncUnsyncedSettings();
  };
  win.addEventListener("online", onOnline);
  cleanup.push(() => win.removeEventListener("online", onOnline));

  const onVisibilityChange = async (): Promise<void> => {
    if (doc.visibilityState !== "visible" || !nav.onLine) return;
    if (!isReaderActive(win)) {
      await syncUnsyncedProgress();
    }
    await syncUnsyncedSettings();
  };
  doc.addEventListener("visibilitychange", onVisibilityChange);
  cleanup.push(() => doc.removeEventListener("visibilitychange", onVisibilityChange));

  const onOffline = (): void => {
    void evictExpired().catch((err) => warn("Failed to evict expired books on offline:", err));
  };
  win.addEventListener("offline", onOffline);
  cleanup.push(() => win.removeEventListener("offline", onOffline));

  if ("serviceWorker" in nav && isProd) {
    const onLoad = (): void => {
      void nav.serviceWorker
        ?.register("/sw.js")
        .catch((err) => warn("SW registration failed:", err));
    };
    win.addEventListener("load", onLoad);
    cleanup.push(() => win.removeEventListener("load", onLoad));
  }

  cleanupInstalled = () => {
    for (const remove of cleanup) {
      remove();
    }
    cleanupInstalled = null;
  };
  return cleanupInstalled;
}
