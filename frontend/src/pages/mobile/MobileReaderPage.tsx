import { useState, useRef, useCallback, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { colors } from "../../theme";
import EbookReader from "../../components/ebook-reader";
import MobileReaderToolbar from "../../components/mobile/mobile-reader-toolbar";
import { THEME_STYLES, TocItem } from "../../components/reader-toolbar";
import { useReaderStorage } from "../../hooks/useReaderStorage";

export default function MobileReaderPage() {
  const { id, format } = useParams();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    bookBlob, bookTitle, settings, initialPosition, resumePosition, debugLines,
    loading, loadProgress, error,
    clearResumePosition, handleRelocate: onStorageRelocate, handleSettingsChange,
  } = useReaderStorage({ bookId: id, format, positionKind: "cfi" });

  const [fraction, setFraction] = useState(0);
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const [currentTocHref, setCurrentTocHref] = useState("");
  const [bookReady, setBookReady] = useState(false);
  const [toolbarVisible, setToolbarVisible] = useState(false);

  const handleRelocate = useCallback(
    (detail: { fraction: number; cfi: string; tocItem?: { label: string; href: string } }) => {
      setFraction(detail.fraction);
      if (detail.tocItem?.href) setCurrentTocHref(detail.tocItem.href);
      onStorageRelocate(detail.cfi, detail.fraction);
    },
    [onStorageRelocate],
  );

  const handleTocSelect = useCallback((href: string) => {
    const view = containerRef.current?.querySelector("foliate-view") as HTMLElement & { goTo: (h: string) => void };
    view?.goTo(href);
  }, []);

  const handleLoad = useCallback(() => {
    const view = containerRef.current?.querySelector("foliate-view") as HTMLElement & { book?: { toc?: TocItem[] } };
    setTocItems((view?.book?.toc ?? []) as TocItem[]);
    setBookReady(true);
  }, []);

  useEffect(() => {
    if (resumePosition == null) return;
    if (!bookReady) return;
    const view = containerRef.current?.querySelector("foliate-view") as HTMLElement & { goTo: (target: string | number) => void };
    if (view) {
      view.goTo(resumePosition);
      clearResumePosition();
    }
  }, [bookReady, clearResumePosition, resumePosition]);

  useEffect(() => {
    const handler = () => {
      if (document.visibilityState !== "visible") return;
      const view = containerRef.current?.querySelector("foliate-view") as HTMLElement & { renderer?: unknown };
      if (!view || !view.renderer) {
        window.location.reload();
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
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
        <button onClick={() => navigate(-1)} style={{ color: colors.accent, background: "none", border: "none", cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>
          Назад
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ position: "relative", height: "100dvh", paddingTop: "var(--sat)", paddingBottom: "var(--sab)", backgroundColor: THEME_STYLES[settings.theme].bg }}>
      {bookReady && toolbarVisible && (
        <MobileReaderToolbar
          bookTitle={bookTitle}
          fraction={fraction}
          tocItems={tocItems}
          currentTocHref={currentTocHref}
          settings={settings}
          onSettingsChange={handleSettingsChange}
          onTocSelect={handleTocSelect}
          onClose={() => navigate(-1)}
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
          bookBlob={bookBlob}
          initialPosition={initialPosition as string | null}
          settings={settings}
          maxInlineSize="1200px"
          gap="5%"
          margin="5px"
          showFooter={false}
          isMobile={true}
          onCenterTap={() => setToolbarVisible((v) => !v)}
          callbacks={{ onRelocate: handleRelocate, onLoad: handleLoad }}
        />
      </div>
      {debugLines.length > 0 && (
        <div style={{
          position: "fixed",
          left: 8,
          right: 8,
          bottom: "calc(var(--sab) + 8px)",
          zIndex: 500,
          padding: "8px 10px",
          borderRadius: 10,
          background: "rgba(0,0,0,0.82)",
          color: "#b7ffb7",
          fontSize: 10,
          lineHeight: 1.35,
          fontFamily: "monospace",
          whiteSpace: "pre-wrap",
          pointerEvents: "none",
        }}>
          {debugLines.join("\n")}
        </div>
      )}
    </div>
  );
}
