import { useState, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { TocItem } from "../components/reader-toolbar";
import { useReaderSettings } from "./useReaderSettings";
import { useReaderPosition } from "./useReaderPosition";
import { useBookLoader } from "./useBookLoader";
import { usePwaBookLoader } from "./usePwaBookLoader";
import { useReaderSessionFlag } from "./useReaderSessionFlag";
import { useReaderLifecycle } from "./useReaderLifecycle";
import { useIsPwa } from "./useIsPwa";
import { getDeviceName } from "../utils/device-info";
import type { BookLoaderResult } from "./useBookLoader";
import type { EbookReaderHandle, ReaderRelocateDetail } from "../types/reader";

function useBookLoaderSwitch(isPwa: boolean, options: Parameters<typeof useBookLoader>[0]): BookLoaderResult {
  // Both hooks are always called (rules of hooks), but only one is "active".
  // The inactive one receives an undefined bookId, so its effect is a no-op.
  const browserResult = useBookLoader({
    ...options,
    bookId: isPwa ? undefined : options.bookId,
  });
  const pwaResult = usePwaBookLoader({
    ...options,
    bookId: isPwa ? options.bookId : undefined,
  });
  return isPwa ? pwaResult : browserResult;
}

export function useReaderPage() {
  const { id, format } = useParams();
  const readerRef = useRef<EbookReaderHandle | null>(null);
  const deviceName = getDeviceName();
  const isPwa = useIsPwa();

  const { settings, handleSettingsChange, applyLocalSettings, syncSettingsWithServer } = useReaderSettings({ deviceName });
  const {
    initialPosition, resumePosition, clearResumePosition,
    handleSavePosition, applyLocalProgress, syncProgressWithServer,
  } = useReaderPosition({ bookId: id, format, positionKind: "cfi", deviceName });

  const onLocalDataLoaded = useCallback((localProgress: Parameters<typeof applyLocalProgress>[0], localSettings: Parameters<typeof applyLocalSettings>[0]) => {
    applyLocalProgress(localProgress);
    applyLocalSettings(localSettings);
  }, [applyLocalProgress, applyLocalSettings]);

  const onSyncNeeded = useCallback(async (bookId: number, localProgress: Parameters<typeof syncProgressWithServer>[1], localSettings: Parameters<typeof syncSettingsWithServer>[0]) => {
    await Promise.all([
      syncProgressWithServer(bookId, localProgress),
      syncSettingsWithServer(localSettings),
    ]);
  }, [syncProgressWithServer, syncSettingsWithServer]);

  const { bookBlob, bookTitle, loading, loadProgress, error } = useBookLoaderSwitch(isPwa, {
    bookId: id, format, deviceName, onLocalDataLoaded, onSyncNeeded,
  });

  useReaderSessionFlag();

  const [fraction, setFraction] = useState(0);
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const [currentTocHref, setCurrentTocHref] = useState("");
  const [bookReady, setBookReady] = useState(false);
  const [toolbarVisible, setToolbarVisible] = useState(false);

  const handleRelocate = useCallback(
    (detail: ReaderRelocateDetail) => {
      setFraction(detail.fraction);
      if (detail.tocItem?.href) setCurrentTocHref(detail.tocItem.href);
    },
    [],
  );

  const handleTocSelect = useCallback(async (href: string) => {
    await readerRef.current?.performNavigation({ type: "goTo", target: href });
  }, [readerRef]);

  const handleReady = useCallback(() => {
    setTocItems((readerRef.current?.getToc() ?? []) as TocItem[]);
    setBookReady(true);
  }, []);

  const toggleToolbar = useCallback(() => {
    setToolbarVisible((v) => !v);
  }, []);

  useReaderLifecycle(readerRef, bookReady, resumePosition, clearResumePosition);

  return {
    id, format,
    readerRef,
    bookBlob, bookTitle, settings, initialPosition,
    loading, loadProgress, error,
    handleSavePosition, handleSettingsChange,
    fraction, tocItems, currentTocHref, bookReady, toolbarVisible,
    handleRelocate, handleTocSelect, handleReady, toggleToolbar,
  };
}
