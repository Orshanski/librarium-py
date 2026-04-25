import { useState, useRef, useEffect, useCallback } from "react";
import {
  LocalProgress,
  getProgress, saveProgress as saveLocalProgress,
  adoptServerProgressLocal,
} from "../utils/offline-storage";
import { pushProgressToServerCAS } from "../utils/reader-sync";
import { getProgress as apiGetProgress } from "../api/endpoints/reader";

type PositionKind = "cfi" | "page";

interface UseReaderPositionOptions {
  bookId: string | undefined;
  format: string | undefined;
  positionKind: PositionKind;
  deviceName: string;
}

export interface UseReaderPositionResult {
  initialPosition: string | number | null;
  resumePosition: string | number | null;
  clearResumePosition: () => void;
  handleSavePosition: (position: string | number, fraction: number) => void;
  /** Apply local progress during initial load — called by book loader */
  applyLocalProgress: (localProgress: LocalProgress | null) => void;
  /** Sync progress with server during initial load — called by book loader */
  syncProgressWithServer: (bookId: number, localProgress: LocalProgress | null) => Promise<void>;
}

export function useReaderPosition({ bookId: id, format, positionKind, deviceName }: UseReaderPositionOptions): UseReaderPositionResult {
  const [initialPosition, setInitialPosition] = useState<string | number | null>(null);
  const [resumePosition, setResumePosition] = useState<string | number | null>(null);

  // Reset position state when book changes
  useEffect(() => {
    setInitialPosition(null);
    setResumePosition(null);
  }, [id]);

  const inFlightPutRef = useRef<Promise<void>>(Promise.resolve());
  const pushProgressToServerRef = useRef<(progress: LocalProgress) => Promise<boolean>>(async () => false);
  const adoptServerProgressRef = useRef<(
    bookId: number,
    server: { position: string; fraction?: number | null; lastFormat?: string | null; lastReadAt?: string | null; version?: number },
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

  const applyLocalProgress = useCallback((localProgress: LocalProgress | null) => {
    if (localProgress?.position) {
      const parsed = parsePositionValue(localProgress.position);
      if (parsed != null) {
        setInitialPosition(parsed);
      }
    }
  }, [parsePositionValue]);

  const pushProgressToServer = useCallback(async (progress: LocalProgress): Promise<boolean> => {
    let handled = false;
    const next = inFlightPutRef.current.then(async () => {
      const result = await pushProgressToServerCAS(progress, {
        deviceName,
        keepalive: true,
      });
      if (result.status === "adopted" && result.adoptedPosition) {
        const parsed = parsePositionValue(result.adoptedPosition);
        if (parsed != null) {
          setResumePosition(parsed);
        }
        handled = true;
      } else if (result.status === "accepted" || result.status === "rebased") {
        handled = true;
      }
    });
    inFlightPutRef.current = next.catch(() => {});
    await next;
    return handled;
  }, [deviceName, parsePositionValue]);

  const adoptServerProgress = useCallback(async (
    bookId: number,
    server: { position: string; fraction?: number | null; lastFormat?: string | null; lastReadAt?: string | null; version?: number },
    options?: { resume?: boolean },
  ) => {
    const parsed = parsePositionValue(server.position);
    if (parsed == null) return;
    await adoptServerProgressLocal(bookId, server, format || "");
    if (options?.resume) {
      setResumePosition(parsed);
    } else {
      setInitialPosition(parsed);
    }
  }, [format, parsePositionValue]);

  pushProgressToServerRef.current = pushProgressToServer;
  adoptServerProgressRef.current = adoptServerProgress;

  const syncProgressWithServer = useCallback(async (bookId: number, localProgress: LocalProgress | null) => {
    const serverProgress = await apiGetProgress(bookId).catch(() => null);

    const hasUnsyncedLocal = Boolean(localProgress && !localProgress.synced);
    const serverPosition = serverProgress?.position ?? null;
    const serverVersion = serverProgress?.version ?? 0;
    const localServerVersion = localProgress?.serverVersion ?? 0;

    if (hasUnsyncedLocal && localProgress) {
      await pushProgressToServerRef.current(localProgress);
    } else if (serverPosition && serverVersion > localServerVersion) {
      if (typeof serverProgress?.position !== "string") return;
      const narrowed = { ...serverProgress, position: serverProgress.position };
      await adoptServerProgressRef.current(bookId, narrowed, { resume: false });
    }
  }, []);

  // Visibility change: re-sync when tab becomes visible
  useEffect(() => {
    if (!id) return;

    const bookId = Number(id);
    const resume = async () => {
      if (document.visibilityState === "hidden" || !navigator.onLine) return;
      try {
        const localProgress = await getProgress(bookId).catch(() => null);
        if (localProgress && !localProgress.synced) {
          await pushProgressToServer(localProgress);
          return;
        }

        const server = await apiGetProgress(bookId).catch(() => null);
        if (!server?.position) return;
        const serverVersion = server.version ?? 0;
        const localServerVersion = localProgress?.serverVersion ?? 0;
        if (serverVersion > localServerVersion) {
          if (typeof server.position !== "string") return;
          const narrowed = { ...server, position: server.position };
          await adoptServerProgress(bookId, narrowed, { resume: true });
        }
      } catch (err) {
        console.warn("Failed to refresh progress on resume:", err);
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

  const handleSavePosition = useCallback((positionValue: string | number, fraction: number) => {
    if (!id) return;
    const bookId = Number(id);
    const position = JSON.stringify({ kind: positionKind, value: positionValue });
    const localData = { position, fraction: Math.min(1, Math.max(0, fraction || 0)), lastFormat: format || "", lastReadAt: Date.now() };
    (async () => {
      try {
        await saveLocalProgress(bookId, localData);
      } catch (err) {
        console.warn("Failed to save local progress:", err);
        return;
      }
      if (!navigator.onLine) return;
      const fresh = await getProgress(bookId).catch(() => null);
      if (!fresh) return;
      void pushProgressToServerRef.current(fresh);
    })();
  }, [format, id, positionKind]);

  const clearResumePosition = useCallback(() => {
    setResumePosition(null);
  }, []);

  return {
    initialPosition, resumePosition, clearResumePosition,
    handleSavePosition, applyLocalProgress, syncProgressWithServer,
  };
}
