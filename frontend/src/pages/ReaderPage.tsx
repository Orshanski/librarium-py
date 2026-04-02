import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { colors } from "../theme";
import { getDeviceName, getDeviceType } from "../utils/device-info";
import EbookReader from "../components/ebook-reader";
import ReaderToolbar, { ReaderSettings, DEFAULT_SETTINGS, THEME_STYLES } from "../components/reader-toolbar";

export default function ReaderPage() {
  const { id, format } = useParams();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  const [bookBlob, setBookBlob] = useState<Blob | null>(null);
  const [bookTitle, setBookTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_SETTINGS);
  const [initialPosition, setInitialPosition] = useState<string | null>(null);
  const [fraction, setFraction] = useState(0);
  const [tocItems, setTocItems] = useState<any[]>([]);
  const [bookReady, setBookReady] = useState(false);
  const [toolbarVisible, setToolbarVisible] = useState(false);

  const deviceType = getDeviceType();
  const deviceName = getDeviceName();

  // Load book data, settings, progress
  useEffect(() => {
    if (!id || !format) return;

    Promise.all([
      fetch(`/api/books/${id}`, { credentials: "include" }).then((r) => r.json()),
      fetch(`/api/books/${id}/download?format=${format}`, { credentials: "include" }).then((r) => {
        if (!r.ok) throw new Error("Failed to download book");
        return r.blob().then((b) => new File([b], `book.${format}`, { type: b.type }));
      }),
      fetch(`/api/reader/settings?device_type=${deviceType}`, { credentials: "include" }).then((r) => r.json()),
      fetch(`/api/reader/progress/${id}`, { credentials: "include" }).then((r) => r.json()),
    ])
      .then(([bookData, blob, settingsData, progressData]) => {
        setBookTitle(bookData.book?.title || "");
        setBookBlob(blob);
        if (settingsData.settings && Object.keys(settingsData.settings).length > 0) {
          setSettings(settingsData.settings);
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
  }, [id, format, deviceType]);

  // Save progress on relocate (debounced 3s, flush on unmount)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const lastPositionRef = useRef<{ cfi: string; device: string } | null>(null);

  const flushProgress = useCallback(() => {
    clearTimeout(saveTimerRef.current);
    const pos = lastPositionRef.current;
    if (!pos || !id) return;
    fetch(`/api/reader/progress/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ position: pos.cfi, last_device: pos.device }),
    }).catch(() => {});
    lastPositionRef.current = null;
  }, [id]);

  useEffect(() => () => flushProgress(), [flushProgress]);

  const handleRelocate = useCallback(
    (detail: { fraction: number; cfi: string }) => {
      setFraction(detail.fraction);
      lastPositionRef.current = { cfi: detail.cfi, device: deviceName };
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        flushProgress();
      }, 3000);
    },
    [deviceName, flushProgress],
  );

  // Save settings on change (debounced 1.5s)
  const settingsTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const handleSettingsChange = useCallback(
    (newSettings: ReaderSettings) => {
      setSettings(newSettings);
      clearTimeout(settingsTimerRef.current);
      settingsTimerRef.current = setTimeout(() => {
        fetch("/api/reader/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ device_type: deviceType, settings: newSettings }),
        }).catch(() => {});
      }, 1500);
    },
    [deviceType],
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

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", backgroundColor: colors.bg, color: colors.textDim }}>
        Загрузка книги...
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
    <div ref={containerRef} style={{ position: "relative", height: "100dvh", backgroundColor: THEME_STYLES[settings.theme].bg }}>
      {bookReady && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 50,
            transform: toolbarVisible ? "translateY(0)" : "translateY(-100%)",
            transition: "transform 0.3s ease",
          }}
        >
          <ReaderToolbar
            bookTitle={bookTitle}
            fraction={fraction}
            tocItems={tocItems}
            settings={settings}
            onSettingsChange={handleSettingsChange}
            onTocSelect={handleTocSelect}
            onClose={() => navigate(`/book/${id}`)}
          />
        </div>
      )}
      {!bookReady && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: colors.textDim }}>
          Загрузка книги...
        </div>
      )}
      <div style={{ width: "100%", height: "100%", visibility: bookReady ? "visible" : "hidden" }}>
        <EbookReader
          bookBlob={bookBlob}
          initialPosition={initialPosition}
          settings={settings}
          onCenterTap={() => setToolbarVisible((v) => !v)}
          callbacks={{ onRelocate: handleRelocate, onLoad: handleLoad }}
        />
      </div>
    </div>
  );
}
