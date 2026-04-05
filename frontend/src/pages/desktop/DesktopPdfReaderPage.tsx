import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { colors } from "../../theme";
import { getDeviceName } from "../../utils/device-info";
import PdfReader from "../../components/pdf-reader";
import PdfNavBar from "../../components/pdf-nav-bar";
import ReaderToolbar, { ReaderSettings, DEFAULT_SETTINGS, TocItem, TapAction } from "../../components/reader-toolbar";

const PDF_AVAILABLE_ACTIONS: TapAction[] = ["prev", "next", "zoom_in", "zoom_out"];

export default function DesktopPdfReaderPage() {
  const { id, format } = useParams();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  const [bookBlob, setBookBlob] = useState<Blob | null>(null);
  const [bookTitle, setBookTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_SETTINGS);
  const [initialPage, setInitialPage] = useState<number | undefined>(undefined);
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const [currentTocHref, setCurrentTocHref] = useState("");
  const [bookReady, setBookReady] = useState(false);
  const [toolbarVisible, setToolbarVisible] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

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
          try {
            const parsed = JSON.parse(progressData.position);
            if (parsed?.kind === "page" && typeof parsed.value === "number") {
              setInitialPage(parsed.value);
            }
            // CFI из flow-ридера игнорируем — для PDF не применимо
          } catch {
            // legacy CFI — игнор
          }
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
  const lastPositionRef = useRef<{ page: number; fraction: number; device: string } | null>(null);

  const flushProgress = useCallback(() => {
    clearTimeout(saveTimerRef.current);
    const pos = lastPositionRef.current;
    if (!pos || !id) return;
    const page = Number.isFinite(pos.page) ? pos.page : 0;
    const fraction = Number.isFinite(pos.fraction) ? Math.min(1, Math.max(0, pos.fraction)) : 0;
    fetch(`/api/reader/progress/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        position: JSON.stringify({ kind: "page", value: page }),
        last_device: pos.device,
        last_format: format || "",
        fraction,
      }),
    }).catch(() => {});
    lastPositionRef.current = null;
  }, [id, format]);

  useEffect(() => () => flushProgress(), [flushProgress]);

  const handleRelocate = useCallback(
    (detail: { index: number; total: number; fraction: number; tocItem?: { label: string; href: string } }) => {
      if (detail.tocItem?.href) setCurrentTocHref(detail.tocItem.href);
      setCurrentPage(detail.index);
      setTotalPages(detail.total);
      lastPositionRef.current = { page: detail.index, fraction: detail.fraction, device: deviceName };
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

  const viewApiRef = useRef<{ goTo: (href: string) => void; goToPage: (index: number) => void } | null>(null);

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
        <button onClick={() => navigate(-1)} style={{ color: colors.accent, background: "none", border: "none", cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>
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
            onClose={() => navigate(-1)}
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
          initialPage={initialPage}
          pdfTapZones={settings.pdfTapZones}
          onCenterTap={() => setToolbarVisible((v) => !v)}
          callbacks={{ onRelocate: handleRelocate, onLoad: handleLoad }}
        />
      </div>
    </div>
  );
}
