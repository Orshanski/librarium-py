import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { colors } from "../../theme";
import { getDeviceName } from "../../utils/device-info";
import EbookReader from "../../components/ebook-reader";
import MobileReaderToolbar from "../../components/mobile/mobile-reader-toolbar";
import { ReaderSettings, DEFAULT_SETTINGS, THEME_STYLES } from "../../components/reader-toolbar";

export default function MobileReaderPage() {
  const { id, format } = useParams();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  const [bookBlob, setBookBlob] = useState<Blob | null>(null);
  const [bookTitle, setBookTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_SETTINGS);
  const [initialPosition, setInitialPosition] = useState<string | null>(null);
  const [fraction, setFraction] = useState(0);
  const [tocItems, setTocItems] = useState<any[]>([]);
  const [currentTocHref, setCurrentTocHref] = useState("");
  const [bookReady, setBookReady] = useState(false);
  const [toolbarVisible, setToolbarVisible] = useState(false);

  const deviceName = getDeviceName();

  // Load book data, settings, progress
  useEffect(() => {
    if (!id || !format) return;

    Promise.all([
      fetch(`/api/books/${id}`, { credentials: "include" }).then((r) => r.json()),
      fetch(`/api/books/${id}/download?format=${format}`, { credentials: "include" }).then(async (r) => {
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
      }),
      fetch("/api/reader/settings", { credentials: "include" }).then((r) => r.json()),
      fetch(`/api/reader/progress/${id}`, { credentials: "include" }).then((r) => r.json()),
    ])
      .then(([bookData, blob, settingsData, progressData]) => {
        setBookTitle(bookData.book?.title || "");
        setBookBlob(blob);
        if (settingsData.settings && Object.keys(settingsData.settings).length > 0) {
          setSettings({ ...DEFAULT_SETTINGS, ...settingsData.settings });
        }
        if (progressData.position) {
          setInitialPosition(progressData.position);
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [id, format]);

  // Save progress on relocate (debounced 3s, flush on unmount)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastPositionRef = useRef<{ cfi: string; device: string; fraction: number } | null>(null);

  const flushProgress = useCallback(() => {
    clearTimeout(saveTimerRef.current);
    const pos = lastPositionRef.current;
    if (!pos || !id) return;
    fetch(`/api/reader/progress/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ position: pos.cfi, last_device: pos.device, last_format: format || "", fraction: Math.min(1, Math.max(0, pos.fraction || 0)) }),
    }).catch(() => {});
    lastPositionRef.current = null;
  }, [id, format]);

  useEffect(() => () => flushProgress(), [flushProgress]);

  const handleRelocate = useCallback(
    (detail: { fraction: number; cfi: string; tocItem?: { label: string; href: string } }) => {
      setFraction(detail.fraction);
      if (detail.tocItem?.href) setCurrentTocHref(detail.tocItem.href);
      lastPositionRef.current = { cfi: detail.cfi, device: deviceName, fraction: detail.fraction };
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        flushProgress();
      }, 3000);
    },
    [deviceName, flushProgress],
  );

  // Save settings on change (debounced 1.5s)
  const settingsTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const handleSettingsChange = useCallback(
    (newSettings: ReaderSettings) => {
      setSettings(newSettings);
      clearTimeout(settingsTimerRef.current);
      settingsTimerRef.current = setTimeout(() => {
        fetch("/api/reader/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ settings: newSettings }),
        }).catch(() => {});
      }, 1500);
    },
    [],
  );

  useEffect(() => () => clearTimeout(settingsTimerRef.current), []);

  const handleTocSelect = useCallback((href: string) => {
    const view = containerRef.current?.querySelector("foliate-view") as any;
    view?.goTo(href);
  }, []);

  const handleLoad = useCallback(() => {
    const view = containerRef.current?.querySelector("foliate-view") as any;
    setTocItems(view?.book?.toc ?? []);
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
        <button onClick={() => navigate(-1)} style={{ color: colors.accent, background: "none", border: "none", cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>
          Назад
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ position: "relative", height: "100dvh", paddingTop: "var(--sat)", paddingBottom: "var(--sab)", backgroundColor: THEME_STYLES[settings.theme].bg }}>
      {/* Mobile toolbar: header + bottom sheets, visibility controlled directly */}
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
          initialPosition={initialPosition}
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
    </div>
  );
}
