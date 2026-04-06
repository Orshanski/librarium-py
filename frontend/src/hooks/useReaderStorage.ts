import { useState, useEffect, useRef, useCallback } from "react";
import { ReaderSettings, DEFAULT_SETTINGS } from "../components/reader-toolbar";
import { getDeviceName } from "../utils/device-info";
import {
  LocalProgress, LocalSettings,
  getProgress, saveProgress as saveLocalProgress, markProgressSynced,
  getSettings as getLocalSettings, saveSettings as saveLocalSettings, markSettingsSynced,
  cacheBook, touchBook, getCachedBook, evictLRU,
} from "../utils/offline-storage";
import { useIsPwa } from "./useIsPwa";

type PositionKind = "cfi" | "page";

interface BookApiResponse {
  book: {
    title: string;
    authors_csv: string;
    id: number;
    [key: string]: unknown;
  };
  files: { format: string; file_size: number }[];
  [key: string]: unknown;
}

interface UseReaderStorageOptions {
  bookId: string | undefined;
  format: string | undefined;
  positionKind: PositionKind;
}

interface UseReaderStorageResult {
  bookBlob: Blob | null;
  bookTitle: string;
  settings: ReaderSettings;
  initialPosition: string | number | null;
  loading: boolean;
  loadProgress: number;
  error: string | null;
  flushProgress: () => void;
  handleRelocate: (position: string | number, fraction: number) => void;
  handleSettingsChange: (newSettings: ReaderSettings) => void;
}

export function useReaderStorage({ bookId: id, format, positionKind }: UseReaderStorageOptions): UseReaderStorageResult {
  const [bookBlob, setBookBlob] = useState<Blob | null>(null);
  const [bookTitle, setBookTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_SETTINGS);
  const [initialPosition, setInitialPosition] = useState<string | number | null>(null);

  const deviceName = getDeviceName();
  const isPwa = useIsPwa();

  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const settingsTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastPositionRef = useRef<{ value: string | number; fraction: number } | null>(null);
  const flushRef = useRef<() => void>(() => {});

  // Load book, settings, progress
  useEffect(() => {
    if (!id || !format) return;
    const bookId = Number(id);

    const downloadBlob = async (): Promise<File> => {
      const r = await fetch(`/api/books/${id}/download?format=${format}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to download book");
      if (!r.body) {
        const b = await r.blob();
        return new File([b], `book.${format}`, { type: b.type });
      }
      const total = Number(r.headers.get("content-length")) || 0;
      const reader = r.body.getReader();
      let received = 0;
      const chunks: BlobPart[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (total) {
          setLoadProgress(Math.round((received / total) * 100));
        } else {
          setLoadProgress(-(received));
        }
      }
      const blob = new Blob(chunks);
      return new File([blob], `book.${format}`, { type: r.headers.get("content-type") || "" });
    };

    (async () => {
      try {
        // 1. Local progress + settings (instant)
        const [localProgress, localSettings] = await Promise.all([
          getProgress(bookId),
          getLocalSettings(deviceName),
        ]);

        if (localSettings?.settings && Object.keys(localSettings.settings).length > 0) {
          setSettings({ ...DEFAULT_SETTINGS, ...localSettings.settings } as ReaderSettings);
        }
        if (localProgress?.position) {
          applyPosition(localProgress.position);
        }

        // 2. Book blob (cache or network)
        let blob: File;
        let title = "";
        let fromCache = false;
        let bookData: BookApiResponse | null = null;

        if (isPwa) {
          const cached = await getCachedBook(bookId);
          if (cached) {
            await touchBook(bookId);
            const fmt = cached.formats.find((f) => f.format.toLowerCase() === format!.toLowerCase());
            if (fmt) {
              blob = new File([fmt.fileBlob], `book.${format}`, { type: "" });
              title = cached.title;
              fromCache = true;
            } else if (navigator.onLine) {
              blob = await downloadBlob();
            } else {
              throw new Error("Формат не найден в кэше");
            }
          } else if (navigator.onLine) {
            blob = await downloadBlob();
          } else {
            throw new Error("Книга не сохранена для оффлайн-чтения");
          }
        } else {
          blob = await downloadBlob();
        }

        if (!fromCache) {
          const resp = await fetch(`/api/books/${id}`, { credentials: "include" });
          bookData = await resp.json() as BookApiResponse;
          title = bookData.book?.title || "";
        }

        setBookTitle(title);
        setBookBlob(blob);
        setLoading(false);

        // 3. Background sync with server
        if (navigator.onLine) {
          await syncWithServer(bookId, localProgress, localSettings, blob, bookData, fromCache);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Ошибка загрузки");
        setLoading(false);
      }
    })();

    function applyPosition(raw: string) {
      try {
        const parsed = JSON.parse(raw);
        if (positionKind === "cfi" && parsed?.kind === "cfi" && typeof parsed.value === "string") {
          setInitialPosition(parsed.value);
        } else if (positionKind === "page" && parsed?.kind === "page" && typeof parsed.value === "number") {
          setInitialPosition(parsed.value);
        } else if (positionKind === "cfi" && typeof raw === "string") {
          setInitialPosition(raw); // legacy CFI
        }
      } catch {
        if (positionKind === "cfi") setInitialPosition(raw); // legacy CFI
      }
    }

    async function syncWithServer(bookId: number, localProgress: LocalProgress | null, localSettings: LocalSettings | null, blob: Blob, bookData: BookApiResponse | null, fromCache: boolean) {
      const [serverSettings, serverProgress] = await Promise.all([
        fetch("/api/reader/settings", { credentials: "include" }).then((r) => r.json()).catch(() => null),
        fetch(`/api/reader/progress/${id}`, { credentials: "include" }).then((r) => r.json()).catch(() => null),
      ]);

      // Settings: compare timestamps, server wins if newer or no local
      if (serverSettings?.settings && Object.keys(serverSettings.settings).length > 0) {
        const serverSettingsTime = serverSettings.updated_at ? new Date(serverSettings.updated_at).getTime() : 0;
        const localSettingsTime = localSettings?.updatedAt || 0;
        if (!localSettings || !localSettings.settings || Object.keys(localSettings.settings).length === 0 || serverSettingsTime > localSettingsTime) {
          const merged = { ...DEFAULT_SETTINGS, ...serverSettings.settings } as ReaderSettings;
          setSettings(merged);
          await saveLocalSettings(deviceName, serverSettings.settings);
          await markSettingsSynced(deviceName);
        } else if (localSettingsTime > serverSettingsTime && localSettings && !localSettings.synced) {
          // Local is newer - push to server
          fetch("/api/reader/settings", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ settings: localSettings.settings }),
          }).then(() => markSettingsSynced(deviceName)).catch((err) => console.warn("Failed to push settings to server:", err));
        }
      }

      // Progress: compare timestamps
      if (serverProgress?.position) {
        const serverTime = serverProgress.last_read_at ? new Date(serverProgress.last_read_at).getTime() : 0;
        const localTime = localProgress?.lastReadAt || 0;
        if (serverTime > localTime) {
          applyPosition(serverProgress.position);
          await saveLocalProgress(bookId, {
            position: serverProgress.position,
            fraction: serverProgress.fraction || 0,
            lastFormat: serverProgress.last_format || format!,
            lastReadAt: serverTime,
          });
          await markProgressSynced(bookId);
        } else if (localTime > serverTime && localProgress) {
          pushProgressToServer(bookId, localProgress);
        }
      } else if (localProgress && !localProgress.synced) {
        pushProgressToServer(bookId, localProgress);
      }

      // Auto-cache in PWA
      if (isPwa && !fromCache && bookData) {
        const bk = bookData.book;
        const allFiles = bookData.files || [];
        try {
          const results = await Promise.all([
            ...allFiles.map(async (f: { format: string; file_size: number }) => {
              if (f.format.toLowerCase() === format!.toLowerCase()) {
                return { format: f.format, fileBlob: blob, fileSize: f.file_size };
              }
              const resp = await fetch(`/api/books/${id}/download?format=${f.format}`, { credentials: "include" });
              return { format: f.format, fileBlob: await resp.blob(), fileSize: f.file_size };
            }),
            fetch(`/api/covers/${id}?full=1`, { credentials: "include" }).then((r) => r.blob()),
          ]);
          const cover = results.pop() as Blob;
          const files = results as { format: string; fileBlob: Blob; fileSize: number }[];
          const authors = (bk.authors_csv || "").split(",").map((a: string) => a.trim()).filter(Boolean);
          try {
            await cacheBook({ bookId, title: bk.title, authors, manuallyAdded: false }, files, cover);
          } catch (cacheErr: unknown) {
            if (cacheErr instanceof DOMException && cacheErr.name === "QuotaExceededError") {
              const totalSize = files.reduce((sum, f) => sum + f.fileSize, 0);
              await evictLRU(totalSize);
              await cacheBook({ bookId, title: bk.title, authors, manuallyAdded: false }, files, cover);
            } else {
              console.warn("Failed to cache book:", cacheErr);
            }
          }
        } catch (err) {
          console.warn("Failed to auto-cache book:", err);
        }
      }
    }

    function pushProgressToServer(bookId: number, progress: LocalProgress) {
      fetch(`/api/reader/progress/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          position: progress.position,
          last_device: deviceName,
          last_format: progress.lastFormat,
          fraction: progress.fraction,
        }),
      }).then(() => markProgressSynced(bookId)).catch((err) => console.warn("Failed to push progress:", err));
    }
  }, [id, format, isPwa, deviceName, positionKind]);

  // Save progress (local-first, debounced)
  const flushProgress = useCallback(() => {
    clearTimeout(saveTimerRef.current);
    const pos = lastPositionRef.current;
    if (!pos || !id) return;
    const bookId = Number(id);
    const position = JSON.stringify({ kind: positionKind, value: pos.value });
    const fraction = Math.min(1, Math.max(0, pos.fraction || 0));
    const progressData = { position, fraction, lastFormat: format || "", lastReadAt: Date.now() };

    saveLocalProgress(bookId, progressData).catch((err) => console.warn("Failed to save local progress:", err));
    if (navigator.onLine) {
      fetch(`/api/reader/progress/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ position, last_device: deviceName, last_format: format || "", fraction }),
      }).then(() => markProgressSynced(bookId)).catch((err) => console.warn("Failed to sync progress:", err));
    }
    lastPositionRef.current = null;
  }, [id, format, deviceName, positionKind]);

  // Keep flushRef in sync for beforeunload
  flushRef.current = flushProgress;

  useEffect(() => () => flushProgress(), [flushProgress]);

  // S2: flush progress on beforeunload
  useEffect(() => {
    const handler = () => flushRef.current();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const handleRelocate = useCallback((positionValue: string | number, fraction: number) => {
    lastPositionRef.current = { value: positionValue, fraction };
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(flushProgress, 3000);
  }, [flushProgress]);

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
        }).then(() => markSettingsSynced(deviceName)).catch((err) => console.warn("Failed to sync settings:", err));
      }
    }, 1500);
  }, [deviceName]);

  useEffect(() => () => clearTimeout(settingsTimerRef.current), []);

  return {
    bookBlob,
    bookTitle,
    settings,
    initialPosition,
    loading,
    loadProgress,
    error,
    flushProgress,
    handleRelocate,
    handleSettingsChange,
  };
}
