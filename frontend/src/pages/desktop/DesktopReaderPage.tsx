import { useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { colors } from "../../theme";
import EbookReader from "../../components/ebook-reader";
import ReaderToolbar, { THEME_STYLES, TocItem } from "../../components/reader-toolbar";
import { useReaderStorage } from "../../hooks/useReaderStorage";
import { useReaderLifecycle } from "../../hooks/useReaderLifecycle";
import type { EbookReaderHandle, ReaderRelocateDetail } from "../../types/reader";
import { exitReader } from "../../utils/readerFlag";

export default function DesktopReaderPage() {
  const { id, format } = useParams();
  const navigate = useNavigate();
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

  useReaderLifecycle(readerRef, bookReady, resumePosition, clearResumePosition);

  if (loading && !bookBlob) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", backgroundColor: colors.bg, color: colors.textDim, gap: 16 }}>
        <div>Загрузка книги...{loadProgress > 0 ? ` ${loadProgress}%` : loadProgress < 0 ? ` ${(-loadProgress / 1048576).toFixed(1)} МБ` : ""}</div>
        <div style={{ width: 200, height: 4, backgroundColor: colors.border, borderRadius: 2 }}>
          <div style={{ width: loadProgress > 0 ? `${loadProgress}%` : "0%", height: "100%", backgroundColor: colors.accent, borderRadius: 2, transition: "width 0.2s" }} />
        </div>
      </div>
    );
  }

  if (error || !bookBlob) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", backgroundColor: colors.bg, color: colors.danger, gap: 16 }}>
        <div>{error || "Не удалось загрузить книгу"}</div>
        <button onClick={() => exitReader(navigate)} style={{ color: colors.accent, background: "none", border: "none", cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>
          Назад
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", height: "100dvh", backgroundColor: THEME_STYLES[settings.theme].bg }}>
      {bookReady && toolbarVisible && (
        <ReaderToolbar
          bookTitle={bookTitle}
          fraction={fraction}
          tocItems={tocItems}
          currentTocHref={currentTocHref}
          settings={settings}
          onSettingsChange={handleSettingsChange}
          onTocSelect={handleTocSelect}
          onClose={() => exitReader(navigate)}
        />
      )}
      {!bookReady && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: colors.textDim, gap: 16, zIndex: 40 }}>
          <div style={{ width: 32, height: 32, border: `3px solid ${colors.border}`, borderTopColor: colors.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          Открытие книги...
        </div>
      )}
      <div style={{ width: "100%", height: "100%", visibility: bookReady ? "visible" : "hidden" }}>
        <EbookReader
          ref={readerRef}
          bookBlob={bookBlob}
          initialPosition={initialPosition as string | null}
          settings={settings}
          maxInlineSize="1100px"
          gap="3%"
          margin="48px"
          onCenterTap={() => setToolbarVisible((v) => !v)}
          callbacks={{ onRelocate: handleRelocate, onReady: handleReady, onSavePosition: handleSavePosition }}
        />
      </div>
    </div>
  );
}
