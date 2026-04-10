import { useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { colors } from "../../theme";
import PdfReader from "../../components/pdf-reader";
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
    bookBlob, bookTitle, settings, initialPosition,
    loading, loadProgress, error,
    handleRelocate: onStorageRelocate, handleSettingsChange,
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
      onStorageRelocate(detail.index, detail.fraction);
    },
    [onStorageRelocate],
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
