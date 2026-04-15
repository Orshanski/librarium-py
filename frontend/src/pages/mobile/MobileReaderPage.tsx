import { useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { colors } from "../../theme";
import EbookReader from "../../components/ebook-reader";
import ReaderLoadingScreen from "../../components/ReaderLoadingScreen";
import ReaderErrorScreen from "../../components/ReaderErrorScreen";
import MobileReaderToolbar from "../../components/mobile/mobile-reader-toolbar";
import { THEME_STYLES, TocItem } from "../../components/reader-toolbar";
import { useReaderStorage } from "../../hooks/useReaderStorage";
import { useReaderLifecycle } from "../../hooks/useReaderLifecycle";
import type { EbookReaderHandle, ReaderRelocateDetail } from "../../types/reader";
import { exitReader } from "../../utils/readerFlag";

export default function MobileReaderPage() {
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

  if (loading && !bookBlob) return <ReaderLoadingScreen loadProgress={loadProgress} />;
  if (error || !bookBlob) return <ReaderErrorScreen error={error} onBack={() => exitReader(navigate)} />;

  return (
    <div style={{ position: "relative", height: "100dvh", paddingTop: "var(--sat)", paddingBottom: "var(--sab)", backgroundColor: THEME_STYLES[settings.theme].bg }}>
      {bookReady && toolbarVisible && (
        <MobileReaderToolbar
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
          maxInlineSize="1200px"
          gap="5%"
          margin="5px"
          showFooter={false}
          isMobile={true}
          onCenterTap={() => setToolbarVisible((v) => !v)}
          callbacks={{ onRelocate: handleRelocate, onReady: handleReady, onSavePosition: handleSavePosition }}
        />
      </div>
    </div>
  );
}
