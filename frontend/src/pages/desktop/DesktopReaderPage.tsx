import { useNavigate } from "react-router-dom";
import { colors } from "../../theme";
import EbookReader from "../../components/ebook-reader";
import ReaderLoadingScreen from "../../components/ReaderLoadingScreen";
import ReaderErrorScreen from "../../components/ReaderErrorScreen";
import ReaderToolbar, { THEME_STYLES } from "../../components/reader-toolbar";
import { useReaderPage } from "../../hooks/useReaderPage";
import { exitReader } from "../../utils/readerFlag";

export default function DesktopReaderPage() {
  const navigate = useNavigate();
  const r = useReaderPage();

  if (r.loading && !r.bookBlob) return <ReaderLoadingScreen loadProgress={r.loadProgress} />;
  if (r.error || !r.bookBlob) return <ReaderErrorScreen error={r.error} onBack={() => exitReader(navigate)} />;

  return (
    <div style={{ position: "relative", height: "100dvh", backgroundColor: THEME_STYLES[r.settings.theme].bg }}>
      {r.bookReady && r.toolbarVisible && (
        <ReaderToolbar
          bookTitle={r.bookTitle}
          fraction={r.fraction}
          tocItems={r.tocItems}
          currentTocHref={r.currentTocHref}
          settings={r.settings}
          onSettingsChange={r.handleSettingsChange}
          onTocSelect={r.handleTocSelect}
          onClose={() => exitReader(navigate)}
        />
      )}
      {!r.bookReady && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: colors.textDim, gap: 16, zIndex: 40 }}>
          <div style={{ width: 32, height: 32, border: `3px solid ${colors.border}`, borderTopColor: colors.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          Открытие книги...
        </div>
      )}
      <div style={{ width: "100%", height: "100%", visibility: r.bookReady ? "visible" : "hidden" }}>
        <EbookReader
          ref={r.readerRef}
          bookBlob={r.bookBlob}
          initialPosition={r.initialPosition as string | null}
          settings={r.settings}
          maxInlineSize="1100px"
          gap="3%"
          margin="48px"
          onCenterTap={r.toggleToolbar}
          callbacks={{ onRelocate: r.handleRelocate, onReady: r.handleReady, onSavePosition: r.handleSavePosition }}
        />
      </div>
    </div>
  );
}
