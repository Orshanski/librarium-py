import { useState, useRef, useCallback, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { colors } from "../../theme";
import PdfReader from "../../components/pdf-reader";
import ReaderLoadingScreen from "../../components/ReaderLoadingScreen";
import ReaderErrorScreen from "../../components/ReaderErrorScreen";
import PdfNavBar from "../../components/pdf-nav-bar";
import ReaderToolbar, { TocItem, TapAction } from "../../components/reader-toolbar";
import { useReaderStorage } from "../../hooks/useReaderStorage";
import { exitReader } from "../../utils/readerFlag";

const PDF_AVAILABLE_ACTIONS: TapAction[] = ["prev", "next", "zoom_in", "zoom_out"];

export default function DesktopPdfReaderPage() {
  const { id, format } = useParams();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    bookBlob, bookTitle, settings, initialPosition, resumePosition,
    loading, loadProgress, error,
    clearResumePosition,
    handleSavePosition, handleSettingsChange,
  } = useReaderStorage({ bookId: id, format, positionKind: "page" });

  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const [currentTocHref, setCurrentTocHref] = useState("");
  const [bookReady, setBookReady] = useState(false);
  const [toolbarVisible, setToolbarVisible] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const viewApiRef = useRef<{ goTo: (href: string) => void; goToPage: (index: number) => void } | null>(null);

  const handleRelocate = useCallback(
    (detail: { index: number; total: number; fraction: number; tocItem?: { label: string; href: string } }) => {
      if (detail.tocItem?.href) setCurrentTocHref(detail.tocItem.href);
      setCurrentPage(detail.index);
      setTotalPages(detail.total);
      // Skip initial-load relocate (before book is ready); save only on user navigation.
      if (bookReady) handleSavePosition(detail.index, detail.fraction);
    },
    [bookReady, handleSavePosition],
  );

  const handleTocSelect = useCallback((href: string) => {
    viewApiRef.current?.goTo(href);
  }, []);

  const handleGoToPage = useCallback((index: number) => {
    viewApiRef.current?.goToPage(index);
  }, []);

  const handleLoad = useCallback((api: { goTo: (href: string) => void; goToPage: (index: number) => void; getToc: () => unknown }) => {
    viewApiRef.current = api;
    const toc = api.getToc();
    setTocItems((Array.isArray(toc) ? toc : []) as TocItem[]);
    setBookReady(true);
  }, []);

  // Adopt on mid-session reconcile: when another device wrote a newer
  // position and useReaderStorage's resume() / CAS reject-adopt path sets
  // resumePosition, jump the PDF viewer to that page. Initial mount is
  // handled via initialPage, not this effect.
  useEffect(() => {
    if (!bookReady || resumePosition == null) return;
    if (typeof resumePosition !== "number") return;
    viewApiRef.current?.goToPage(resumePosition);
    clearResumePosition();
  }, [bookReady, resumePosition, clearResumePosition]);

  if (loading && !bookBlob) return <ReaderLoadingScreen loadProgress={loadProgress} />;
  if (error || !bookBlob) return <ReaderErrorScreen error={error} onBack={() => exitReader(navigate)} />;

  return (
    <div ref={containerRef} style={{ position: "relative", height: "100dvh", paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)", backgroundColor: "#2a2a2a" }}>
      {bookReady && toolbarVisible && (
        <>
          <ReaderToolbar
            bookTitle={bookTitle}
            fraction={0}
            tocItems={tocItems}
            currentTocHref={currentTocHref}
            settings={settings}
            onSettingsChange={handleSettingsChange}
            onTocSelect={handleTocSelect}
            onClose={() => exitReader(navigate)}
            maxTocDepth={3}
            hideStyles
            tapZonesKey="pdfTapZones"
            availableActions={PDF_AVAILABLE_ACTIONS}
          />
          <PdfNavBar
            currentPage={currentPage}
            totalPages={totalPages}
            onGoToPage={handleGoToPage}
          />
        </>
      )}
      {!bookReady && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: colors.textDim, gap: 16, zIndex: 40 }}>
          <div style={{ width: 32, height: 32, border: `3px solid ${colors.border}`, borderTopColor: colors.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          Открытие книги...
        </div>
      )}
      <div style={{ width: "100%", height: "100%", visibility: bookReady ? "visible" : "hidden" }}>
        <PdfReader
          bookBlob={bookBlob}
          initialPage={typeof initialPosition === "number" ? initialPosition : undefined}
          pdfTapZones={settings.pdfTapZones}
          onCenterTap={() => setToolbarVisible((v) => !v)}
          callbacks={{ onRelocate: handleRelocate, onLoad: handleLoad }}
        />
      </div>
    </div>
  );
}
