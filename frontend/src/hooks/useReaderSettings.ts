import { useState, useRef, useEffect, useCallback } from "react";
import type { ReaderSettings } from "../types/reader-settings";
import { DEFAULT_SETTINGS } from "../constants/reader-defaults";
import {
  LocalSettings,
  saveSettings as saveLocalSettings, markSettingsSynced,
} from "../utils/offline-storage";
import { getSettings, saveSettings } from "../api/endpoints/reader";

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
    const serverSettings = await getSettings().catch(() => null);

    if (serverSettings?.settings && Object.keys(serverSettings.settings).length > 0) {
      if (!localSettings || !localSettings.settings || Object.keys(localSettings.settings).length === 0) {
        // No local settings — seed from server
        const merged = { ...DEFAULT_SETTINGS, ...serverSettings.settings } as ReaderSettings;
        setSettings(merged);
        await saveLocalSettings(deviceName, serverSettings.settings);
        await markSettingsSynced(deviceName);
      } else if (localSettings && !localSettings.synced) {
        // Unsynced local settings — push to server
        try {
          await saveSettings(localSettings.settings);
          await markSettingsSynced(deviceName);
        } catch (err) {
          console.warn("Failed to sync settings with server:", err);
        }
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
        saveSettings(settingsRecord)
          .then(() => markSettingsSynced(deviceName))
          .catch((err) => console.warn("Failed to sync settings:", err));
      }
    }, 1500);
  }, [deviceName]);

  useEffect(() => () => clearTimeout(settingsTimerRef.current), []);

  return { settings, handleSettingsChange, applyLocalSettings, syncSettingsWithServer };
}
