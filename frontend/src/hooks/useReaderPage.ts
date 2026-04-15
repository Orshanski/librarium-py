import { useState, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { TocItem } from "../components/reader-toolbar";
import { useReaderStorage } from "./useReaderStorage";
import { useReaderLifecycle } from "./useReaderLifecycle";
import type { EbookReaderHandle, ReaderRelocateDetail } from "../types/reader";

export function useReaderPage() {
  const { id, format } = useParams();
  const readerRef = useRef<EbookReaderHandle | null>(null);

  const {
    bookBlob, bookTitle, settings, initialPosition, resumePosition,
    loading, loadProgress, error,
    clearResumePosition, handleSavePosition, handleSettingsChange,
  } = useReaderStorage({ bookId: id, format, positionKind: "cfi" });

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
    // Route params
    id, format,
    // Refs
    readerRef,
    // Storage
    bookBlob, bookTitle, settings, initialPosition,
    loading, loadProgress, error,
    handleSavePosition, handleSettingsChange,
    // UI state
    fraction, tocItems, currentTocHref, bookReady, toolbarVisible,
    // Callbacks
    handleRelocate, handleTocSelect, handleReady, toggleToolbar,
  };
}
