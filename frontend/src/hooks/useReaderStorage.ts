// navigator.onLine is used directly (not useOnlineStatus hook) throughout this file
// because we need point-in-time checks inside useEffect callbacks and async functions,
// not reactive state. The hook would capture a stale closure value.
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
    authors: string;
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
  resumePosition: string | number | null;
  debugLines: string[];
  loading: boolean;
  loadProgress: number;
  error: string | null;
  flushProgress: () => void;
  clearResumePosition: () => void;
  handleRelocate: (position: string | number, fraction: number) => void;
  handleSettingsChange: (newSettings: ReaderSettings) => void;
}

const DEBUG_READER_LIFECYCLE = true;

export function useReaderStorage({ bookId: id, format, positionKind }: UseReaderStorageOptions): UseReaderStorageResult {
  const [bookBlob, setBookBlob] = useState<Blob | null>(null);
  const [bookTitle, setBookTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_SETTINGS);
  const [initialPosition, setInitialPosition] = useState<string | number | null>(null);
  const [resumePosition, setResumePosition] = useState<string | number | null>(null);
  const [debugLines, setDebugLines] = useState<string[]>([]);

  const deviceName = getDeviceName();
  const isPwa = useIsPwa();

  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const settingsTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastPositionRef = useRef<{ value: string | number; fraction: number } | null>(null);
  const lastSavedPositionRef = useRef<string | null>(null);
  const flushRef = useRef<() => void>(() => {});

  const readerWindow = window as Window & { __librariumReaderActiveCount?: number };

  const pushDebug = useCallback((line: string) => {
    if (!DEBUG_READER_LIFECYCLE) return;
    const stamp = new Date().toLocaleTimeString("en-GB", { hour12: false });
    setDebugLines((prev) => [`${stamp} ${line}`, ...prev].slice(0, 8));
  }, []);

  const shortPos = useCallback((value: string | null | undefined) => {
    if (!value) return "null";
    return value.length > 64 ? `${value.slice(0, 64)}...` : value;
  }, []);

  const parsePositionValue = useCallback((raw: string): string | number | null => {
    try {
      const parsed = JSON.parse(raw);
      if (positionKind === "cfi" && parsed?.kind === "cfi" && typeof parsed.value === "string") {
        return parsed.value;
      }
      if (positionKind === "page" && parsed?.kind === "page" && typeof parsed.value === "number") {
        return parsed.value;
      }
      if (positionKind === "cfi" && typeof raw === "string") {
        return raw;
      }
      return null;
    } catch {
      return positionKind === "cfi" ? raw : null;
    }
  }, [positionKind]);

  const applyPosition = useCallback((raw: string) => {
    const parsed = parsePositionValue(raw);
    if (parsed != null) {
      setInitialPosition(parsed);
    }
  }, [parsePositionValue]);

  const pushProgressToServer = useCallback(async (bookId: number, progress: LocalProgress, keepalive = false) => {
    try {
      pushDebug(`PUT start keepalive=${keepalive} pos=${shortPos(progress.position)}`);
      const resp = await fetch(`/api/reader/progress/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        keepalive,
        body: JSON.stringify({
          position: progress.position,
          last_device: deviceName,
          last_format: progress.lastFormat,
          fraction: progress.fraction,
        }),
      });
      if (resp.ok) {
        pushDebug("PUT ok");
        lastSavedPositionRef.current = progress.position;
        await markProgressSynced(bookId);
        return true;
      }
      pushDebug(`PUT fail status=${resp.status}`);
    } catch (err) {
      pushDebug(`PUT err=${err instanceof Error ? err.message : String(err)}`);
      console.warn("Failed to push progress:", err);
    }
    return false;
  }, [deviceName, id, pushDebug, shortPos]);

  const adoptServerProgress = useCallback(async (
    bookId: number,
    server: { position: string; fraction?: number | null; last_format?: string | null; last_read_at?: string | null },
    options?: { resume?: boolean },
  ) => {
    const parsed = parsePositionValue(server.position);
    if (parsed == null) return;
    lastSavedPositionRef.current = server.position;
    await saveLocalProgress(bookId, {
      position: server.position,
      fraction: server.fraction || 0,
      lastFormat: server.last_format || format || "",
      lastReadAt: server.last_read_at ? new Date(server.last_read_at).getTime() : Date.now(),
    });
    await markProgressSynced(bookId);
    pushDebug(`ADOPT server resume=${Boolean(options?.resume)} pos=${shortPos(server.position)}`);
    if (options?.resume) {
      setResumePosition(parsed);
    } else {
      setInitialPosition(parsed);
    }
  }, [format, parsePositionValue, pushDebug, shortPos]);

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
          lastSavedPositionRef.current = localProgress.position;
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

        if (navigator.onLine) {
          const resp = await fetch(`/api/books/${id}`, { credentials: "include" });
          if (resp.ok) {
            bookData = await resp.json() as BookApiResponse;
            if (!fromCache) title = bookData.book?.title || "";
          } else if (!fromCache) {
            throw new Error("Failed to fetch book data");
          }
        }

        // 3. Sync progress/settings with server BEFORE mounting reader
        // (reader reads initialPosition only once on mount)
        if (navigator.onLine) {
          await syncProgressAndSettings(bookId, localProgress, localSettings);
        }

        setBookTitle(title);
        setBookBlob(blob);
        setLoading(false);

        // 4. Background tasks (online only)
        if (navigator.onLine) {
          // Clear is_read if set — opening in reader means re-reading
          if (bookData?.book?.is_read) {
            fetch(`/api/books/${id}/read`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ isRead: false }),
            }).catch((err) => console.warn("Failed to clear is_read:", err));
          }
          autoCacheBook(bookId, blob, bookData, fromCache);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Ошибка загрузки");
        setLoading(false);
      }
    })();

    async function syncProgressAndSettings(bookId: number, localProgress: LocalProgress | null, localSettings: LocalSettings | null) {
      const [serverSettings, serverProgress] = await Promise.all([
        fetch("/api/reader/settings", { credentials: "include" }).then((r) => r.ok ? r.json() : null).catch(() => null),
        fetch(`/api/reader/progress/${id}`, { credentials: "include" }).then((r) => r.ok ? r.json() : null).catch(() => null),
      ]);

      // Settings: per-device, no cross-device sync.
      // If no local settings, seed from server; otherwise push local to server if not synced.
      if (serverSettings?.settings && Object.keys(serverSettings.settings).length > 0) {
        if (!localSettings || !localSettings.settings || Object.keys(localSettings.settings).length === 0) {
          const merged = { ...DEFAULT_SETTINGS, ...serverSettings.settings } as ReaderSettings;
          setSettings(merged);
          await saveLocalSettings(deviceName, serverSettings.settings);
          await markSettingsSynced(deviceName);
        } else if (localSettings && !localSettings.synced) {
          const resp = await fetch("/api/reader/settings", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ settings: localSettings.settings }),
          }).catch(() => null);
          if (resp && resp.ok) await markSettingsSynced(deviceName);
        }
      }

      const localPosition = localProgress?.position ?? null;
      const hasUnsyncedLocal = Boolean(localProgress && !localProgress.synced);
      const serverPosition = serverProgress?.position ?? null;
      const serverTime = serverProgress?.last_read_at ? new Date(serverProgress.last_read_at).getTime() : 0;
      const localTime = localProgress?.lastReadAt ?? 0;

      if (hasUnsyncedLocal && localProgress) {
        if (serverPosition && serverPosition !== localPosition && serverTime > localTime) {
          await adoptServerProgress(bookId, serverProgress, { resume: false });
        } else {
          await pushProgressToServer(bookId, localProgress);
        }
      } else if (serverPosition && serverPosition !== localPosition) {
        if (localProgress && !localProgress.synced) {
          return;
        }
        if (serverPosition) {
          await adoptServerProgress(bookId, serverProgress, { resume: false });
        }
      } else if (!serverProgress?.position && localProgress) {
        lastSavedPositionRef.current = localProgress.position;
      }
    }

    function autoCacheBook(bookId: number, blob: Blob, bookData: BookApiResponse | null, fromCache: boolean) {
      if (!isPwa || fromCache || !bookData) return;
      const bk = bookData.book;
      const allFiles = bookData.files || [];
      (async () => {
        const files = await Promise.all(
          allFiles.map(async (f: { format: string; file_size: number }) => {
            if (f.format.toLowerCase() === format!.toLowerCase()) {
              return { format: f.format, fileBlob: blob, fileSize: f.file_size };
            }
            const resp = await fetch(`/api/books/${id}/download?format=${f.format}`, { credentials: "include" });
            if (!resp.ok) { console.warn(`Failed to download format ${f.format}`); return null; }
            return { format: f.format, fileBlob: await resp.blob(), fileSize: f.file_size };
          }),
        );
        const validFiles = files.filter((f): f is { format: string; fileBlob: Blob; fileSize: number } => f !== null);
        if (validFiles.length === 0) return;
        const coverResp = await fetch(`/api/covers/${id}?full=1`, { credentials: "include" });
        if (!coverResp.ok) { console.warn("Failed to fetch cover for caching"); return; }
        const cover = await coverResp.blob();
        const authors = (bk.authors || "").split(",").map((a: string) => a.trim()).filter(Boolean);
        try {
          await cacheBook({ bookId, title: bk.title, authors, manuallyAdded: false }, validFiles, cover);
        } catch (cacheErr: unknown) {
          if (cacheErr instanceof DOMException && cacheErr.name === "QuotaExceededError") {
            const totalSize = validFiles.reduce((sum, f) => sum + f.fileSize, 0);
            await evictLRU(totalSize);
            try {
              await cacheBook({ bookId, title: bk.title, authors, manuallyAdded: false }, validFiles, cover);
            } catch (retryErr) {
              console.warn("Failed to cache book after eviction:", retryErr);
            }
          } else {
            console.warn("Failed to cache book:", cacheErr);
          }
        }
      })().catch((err) => console.warn("Failed to auto-cache book:", err));
    }
  }, [adoptServerProgress, applyPosition, deviceName, format, id, isPwa, parsePositionValue, positionKind, pushProgressToServer]);

  // Save progress (local-first, debounced)
  const flushProgress = useCallback(() => {
    clearTimeout(saveTimerRef.current);
    const pos = lastPositionRef.current;
    if (!pos || !id) return;
    const bookId = Number(id);
    const position = JSON.stringify({ kind: positionKind, value: pos.value });
    const fraction = Math.min(1, Math.max(0, pos.fraction || 0));
    const progressData = { position, fraction, lastFormat: format || "", lastReadAt: Date.now() };

    lastSavedPositionRef.current = position;
    saveLocalProgress(bookId, progressData).catch((err) => console.warn("Failed to save local progress:", err));
    if (navigator.onLine) {
      fetch(`/api/reader/progress/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        keepalive: true,
        body: JSON.stringify({ position, last_device: deviceName, last_format: format || "", fraction }),
      }).then((r) => { if (r.ok) markProgressSynced(bookId); }).catch((err) => console.warn("Failed to sync progress:", err));
    }
    lastPositionRef.current = null;
  }, [id, format, deviceName, positionKind]);

  // Keep flushRef in sync for beforeunload
  flushRef.current = flushProgress;

  useEffect(() => () => flushProgress(), [flushProgress]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) {
        pushDebug("EVENT hidden -> flush");
        flushRef.current();
      }
    };
    const onPageHide = () => {
      pushDebug("EVENT pagehide -> flush");
      flushRef.current();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [pushDebug]);

  useEffect(() => {
    if (!id) return;

    const bookId = Number(id);
    const resume = async () => {
      pushDebug(`RESUME state=${document.visibilityState} online=${navigator.onLine}`);
      if (document.visibilityState === "hidden" || !navigator.onLine) {
        pushDebug("RESUME blocked by guard");
        return;
      }

      const localProgress = await getProgress(bookId).catch(() => null);
      try {
        pushDebug("GET start");
        const resp = await fetch(`/api/reader/progress/${id}`, { credentials: "include" });
        if (!resp.ok) {
          pushDebug(`GET fail status=${resp.status}`);
          return;
        }
        const server = await resp.json();
        pushDebug(`GET ok serverPos=${server?.position ? "yes" : "no"} serverTime=${server?.last_read_at ?? "null"}`);

        const currentLocalPosition = lastPositionRef.current
          ? JSON.stringify({ kind: positionKind, value: lastPositionRef.current.value })
          : lastSavedPositionRef.current ?? localProgress?.position ?? null;
        const localTime = localProgress?.lastReadAt ?? 0;
        const serverTime = server?.last_read_at ? new Date(server.last_read_at).getTime() : 0;
        pushDebug(`CMP local=${shortPos(currentLocalPosition)} server=${shortPos(server?.position)}`);
        pushDebug(`META synced=${localProgress?.synced ?? "null"} localTime=${localTime} serverTime=${serverTime}`);

        if (!server?.position) {
          if (localProgress && !localProgress.synced) {
            pushDebug("GET no server pos -> push local");
            await pushProgressToServer(bookId, localProgress);
          }
          return;
        }

        if (server.position !== currentLocalPosition) {
          pushDebug("DIFF -> adopt server");
          await adoptServerProgress(bookId, server, { resume: true });
        } else if (localProgress && !localProgress.synced) {
          pushDebug("SAME -> push unsynced local");
          await pushProgressToServer(bookId, localProgress);
        } else {
          pushDebug("SAME -> no-op");
        }
      } catch (err) {
        pushDebug(`GET err=${err instanceof Error ? err.message : String(err)}`);
        console.warn("Failed to refresh progress on resume:", err);
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        pushDebug("EVENT visibilitychange visible");
        void resume();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [adoptServerProgress, id, positionKind, pushDebug, pushProgressToServer, shortPos]);

  const handleRelocate = useCallback((positionValue: string | number, fraction: number) => {
    lastPositionRef.current = { value: positionValue, fraction };
    const bookId = id ? Number(id) : 0;
    const position = JSON.stringify({ kind: positionKind, value: positionValue });
    if (bookId) {
      saveLocalProgress(bookId, {
        position,
        fraction: Math.min(1, Math.max(0, fraction || 0)),
        lastFormat: format || "",
        lastReadAt: Date.now(),
      }).catch((err) => console.warn("Failed to save local progress:", err));
    }
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(flushProgress, 1000);
  }, [flushProgress, format, id, positionKind]);

  const clearResumePosition = useCallback(() => {
    setResumePosition(null);
  }, []);

  useEffect(() => {
    readerWindow.__librariumReaderActiveCount = (readerWindow.__librariumReaderActiveCount ?? 0) + 1;
    return () => {
      const next = (readerWindow.__librariumReaderActiveCount ?? 1) - 1;
      readerWindow.__librariumReaderActiveCount = Math.max(0, next);
    };
  }, []);

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

  return {
    bookBlob,
    bookTitle,
    settings,
    initialPosition,
    resumePosition,
    debugLines,
    loading,
    loadProgress,
    error,
    flushProgress,
    clearResumePosition,
    handleRelocate,
    handleSettingsChange,
  };
}
