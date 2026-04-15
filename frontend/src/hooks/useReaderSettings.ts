import { useState, useRef, useEffect, useCallback } from "react";
import { ReaderSettings, DEFAULT_SETTINGS } from "../components/reader-toolbar";
import {
  LocalSettings,
  getSettings as getLocalSettings, saveSettings as saveLocalSettings, markSettingsSynced,
} from "../utils/offline-storage";

interface UseReaderSettingsOptions {
  deviceName: string;
}

export interface UseReaderSettingsResult {
  settings: ReaderSettings;
  handleSettingsChange: (newSettings: ReaderSettings) => void;
  /** Load local settings on mount — called by useBookLoader during initial load */
  applyLocalSettings: (localSettings: LocalSettings | null) => void;
  /** Sync with server during initial load — called by useBookLoader */
  syncSettingsWithServer: (localSettings: LocalSettings | null) => Promise<void>;
}

export function useReaderSettings({ deviceName }: UseReaderSettingsOptions): UseReaderSettingsResult {
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_SETTINGS);
  const settingsTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const applyLocalSettings = useCallback((localSettings: LocalSettings | null) => {
    if (localSettings?.settings && Object.keys(localSettings.settings).length > 0) {
      setSettings({ ...DEFAULT_SETTINGS, ...localSettings.settings } as ReaderSettings);
    }
  }, []);

  const syncSettingsWithServer = useCallback(async (localSettings: LocalSettings | null) => {
    const serverSettings = await fetch("/api/reader/settings", { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .catch(() => null);

    if (serverSettings?.settings && Object.keys(serverSettings.settings).length > 0) {
      if (!localSettings || !localSettings.settings || Object.keys(localSettings.settings).length === 0) {
        // No local settings — seed from server
        const merged = { ...DEFAULT_SETTINGS, ...serverSettings.settings } as ReaderSettings;
        setSettings(merged);
        await saveLocalSettings(deviceName, serverSettings.settings);
        await markSettingsSynced(deviceName);
      } else if (localSettings && !localSettings.synced) {
        // Unsynced local settings — push to server
        const resp = await fetch("/api/reader/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ settings: localSettings.settings }),
        }).catch(() => null);
        if (resp && resp.ok) await markSettingsSynced(deviceName);
      }
    }
  }, [deviceName]);

  // Save settings (local-first, debounced)
  const handleSettingsChange = useCallback((newSettings: ReaderSettings) => {
    setSettings(newSettings);
    clearTimeout(settingsTimerRef.current);
    settingsTimerRef.current = setTimeout(() => {
      const settingsRecord: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(newSettings)) {
        settingsRecord[key] = value;
      }
      saveLocalSettings(deviceName, settingsRecord).catch((err) => console.warn("Failed to save local settings:", err));
      if (navigator.onLine) {
        fetch("/api/reader/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ settings: newSettings }),
        }).then((r) => { if (r.ok) markSettingsSynced(deviceName); }).catch((err) => console.warn("Failed to sync settings:", err));
      }
    }, 1500);
  }, [deviceName]);

  useEffect(() => () => clearTimeout(settingsTimerRef.current), []);

  return { settings, handleSettingsChange, applyLocalSettings, syncSettingsWithServer };
}
