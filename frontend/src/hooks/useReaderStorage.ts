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
import { pushProgressToServerCAS } from "../utils/reader-sync";
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
  loading: boolean;
  loadProgress: number;
  error: string | null;
  flushProgress: () => void;
  clearResumePosition: () => void;
  handleRelocate: (position: string | number, fraction: number) => void;
  handleSettingsChange: (newSettings: ReaderSettings) => void;
}

const readerWindow = window as Window & { __librariumReaderActiveCount?: number };

export function useReaderStorage({ bookId: id, format, positionKind }: UseReaderStorageOptions): UseReaderStorageResult {
  const [bookBlob, setBookBlob] = useState<Blob | null>(null);
  const [bookTitle, setBookTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_SETTINGS);
  const [initialPosition, setInitialPosition] = useState<string | number | null>(null);
  const [resumePosition, setResumePosition] = useState<string | number | null>(null);

  const deviceName = getDeviceName();
  const isPwa = useIsPwa();

  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const settingsTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastPositionRef = useRef<{ value: string | number; fraction: number } | null>(null);
  // Serializes PUT /api/reader/progress calls: each new PUT awaits the
  // previous one so the server can't see requests reordered by the network.
  const inFlightPutRef = useRef<Promise<void>>(Promise.resolve());
  // Blocks debounced server pushes from handleRelocate while resume() is
  // reconciling with the server. IDB writes still happen.
  const resumeGateRef = useRef(false);
  const flushRef = useRef<() => void>(() => {});
  const applyPositionRef = useRef<(raw: string) => void>(() => {});
  const pushProgressToServerRef = useRef<(progress: LocalProgress, keepalive?: boolean) => Promise<boolean>>(async () => false);
  const adoptServerProgressRef = useRef<(
    bookId: number,
    server: { position: string; fraction?: number | null; last_format?: string | null; last_read_at?: string | null; version?: number },
    options?: { resume?: boolean },
  ) => Promise<void>>(async () => {});

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

  const pushProgressToServer = useCallback(async (progress: LocalProgress, keepalive = false): Promise<boolean> => {
    // Chain onto the previous in-flight PUT so PUTs always land in order.
    let handled = false;
    const next = inFlightPutRef.current.then(async () => {
      const ctl = keepalive ? null : new AbortController();
      const timer = ctl ? setTimeout(() => ctl.abort(), 10_000) : null;
      try {
        const result = await pushProgressToServerCAS(progress, {
          deviceName,
          keepalive,
          signal: ctl?.signal,
        });
        if (result.status === "adopted" && result.adoptedPosition) {
          const parsed = parsePositionValue(result.adoptedPosition);
          if (parsed != null) setResumePosition(parsed);
          handled = true;
        } else if (result.status === "accepted" || result.status === "rebased") {
          handled = true;
        }
      } finally {
        if (timer) clearTimeout(timer);
      }
    });
    inFlightPutRef.current = next.catch(() => {});
    await next;
    return handled;
  }, [deviceName, parsePositionValue]);

  const adoptServerProgress = useCallback(async (
    bookId: number,
    server: { position: string; fraction?: number | null; last_format?: string | null; last_read_at?: string | null; version?: number },
    options?: { resume?: boolean },
  ) => {
    const parsed = parsePositionValue(server.position);
    if (parsed == null) return;
    await saveLocalProgress(bookId, {
      position: server.position,
      fraction: server.fraction || 0,
      lastFormat: server.last_format || format || "",
      lastReadAt: server.last_read_at ? new Date(server.last_read_at).getTime() : Date.now(),
      serverVersion: server.version ?? 0,
    });
    await markProgressSynced(bookId);
    if (options?.resume) {
      setResumePosition(parsed);
    } else {
      setInitialPosition(parsed);
    }
  }, [format, parsePositionValue]);

  applyPositionRef.current = applyPosition;
  pushProgressToServerRef.current = pushProgressToServer;
  adoptServerProgressRef.current = adoptServerProgress;

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
          applyPositionRef.current(localProgress.position);
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

      // Version-based reconciliation (no timestamps):
      //   - unsynced local → push via CAS; server decides accept / rebase / reject-adopt
      //   - synced local + server version ahead → another device wrote, adopt
      //   - otherwise → nothing
      const hasUnsyncedLocal = Boolean(localProgress && !localProgress.synced);
      const serverPosition = serverProgress?.position ?? null;
      const serverVersion = serverProgress?.version ?? 0;
      const localServerVersion = localProgress?.serverVersion ?? 0;

      if (hasUnsyncedLocal && localProgress) {
        await pushProgressToServerRef.current(localProgress);
      } else if (serverPosition && serverVersion > localServerVersion) {
        await adoptServerProgressRef.current(bookId, serverProgress, { resume: false });
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
  }, [deviceName, format, id, isPwa, positionKind]);

  // Save progress (local-first, debounced). All network PUTs go through
  // pushProgressToServer so they land on the server in FIFO order.
  //
  // Read-back pattern: after saving to IDB we re-read the row so the push
  // gets the current serverVersion (which was preserved from the last sync,
  // not mutated by the relocate-driven IDB write).
  const flushProgress = useCallback(() => {
    clearTimeout(saveTimerRef.current);
    const pos = lastPositionRef.current;
    if (!pos || !id) return;
    const bookId = Number(id);
    const position = JSON.stringify({ kind: positionKind, value: pos.value });
    const fraction = Math.min(1, Math.max(0, pos.fraction || 0));
    const localData = { position, fraction, lastFormat: format || "", lastReadAt: Date.now() };

    lastPositionRef.current = null;

    (async () => {
      try {
        await saveLocalProgress(bookId, localData);
      } catch (err) {
        console.warn("Failed to save local progress:", err);
        return;
      }
      if (!navigator.onLine) return;
      // Read back to get the fresh row with serverVersion preserved.
      const fresh = await getProgress(bookId).catch(() => null);
      if (!fresh) return;
      // keepalive: true so the request survives pagehide / visibilitychange(hidden)
      void pushProgressToServerRef.current(fresh, true);
    })();
  }, [id, format, positionKind]);

  // Keep flushRef in sync for beforeunload
  flushRef.current = flushProgress;

  useEffect(() => () => flushProgress(), [flushProgress]);

  useEffect(() => {
    const onBeforeUnload = () => flushRef.current();
    const onVisibilityChange = () => {
      if (document.hidden) {
        flushRef.current();
      }
    };
    const onPageHide = () => {
      flushRef.current();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, []);

  useEffect(() => {
    if (!id) return;

    const bookId = Number(id);
    const resume = async () => {
      if (document.visibilityState === "hidden" || !navigator.onLine) return;

      // Gate debounced pushes from handleRelocate while we're reconciling.
      resumeGateRef.current = true;
      try {
        // 1. Pending in-memory position (not yet flushed) → flush first. It
        //    goes through the CAS chain and wins whatever is needed.
        if (lastPositionRef.current) {
          flushRef.current();
          return;
        }

        // 2. Unsynced local → push via CAS. Server decides accept/rebase/reject.
        const localProgress = await getProgress(bookId).catch(() => null);
        if (localProgress && !localProgress.synced) {
          await pushProgressToServer(localProgress);
          return;
        }

        // 3. Synced local + server ahead by version → another device wrote, adopt.
        const resp = await fetch(`/api/reader/progress/${id}`, { credentials: "include" });
        if (!resp.ok) return;
        const server = await resp.json();
        if (!server?.position) return;
        const serverVersion = server.version ?? 0;
        const localServerVersion = localProgress?.serverVersion ?? 0;
        if (serverVersion > localServerVersion) {
          await adoptServerProgress(bookId, server, { resume: true });
        }
      } catch (err) {
        console.warn("Failed to refresh progress on resume:", err);
      } finally {
        resumeGateRef.current = false;
        // If user relocated during the gate window, flush now.
        if (lastPositionRef.current) flushRef.current();
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void resume();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [adoptServerProgress, id, positionKind, pushProgressToServer]);

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
    // During resume reconciliation, IDB is updated but server push is deferred.
    // resume() will call flushProgress() in its finally block if lastPositionRef
    // has anything pending.
    if (resumeGateRef.current) return;
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
    loading,
    loadProgress,
    error,
    flushProgress,
    clearResumePosition,
    handleRelocate,
    handleSettingsChange,
  };
}
