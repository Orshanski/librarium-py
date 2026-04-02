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

  // Save progress on relocate (debounced 3s)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const handleRelocate = useCallback(
    (detail: { fraction: number; cfi: string }) => {
      setFraction(detail.fraction);
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        fetch(`/api/reader/progress/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            position: detail.cfi,
            last_device: deviceName,
          }),
        }).catch(() => {});
      }, 3000);
    },
    [id, deviceName],
  );

  // Save settings on change
  const handleSettingsChange = useCallback(
    (newSettings: ReaderSettings) => {
      setSettings(newSettings);
      fetch("/api/reader/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ device_type: deviceType, settings: newSettings }),
      }).catch(() => {});
    },
    [deviceType],
  );

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
    <div ref={containerRef} style={{ display: "flex", flexDirection: "column", height: "100vh", backgroundColor: THEME_STYLES[settings.theme].bg }}>
      {bookReady && (
        <ReaderToolbar
          bookTitle={bookTitle}
          fraction={fraction}
          tocItems={tocItems}
          settings={settings}
          onSettingsChange={handleSettingsChange}
          onTocSelect={handleTocSelect}
          onClose={() => navigate(`/book/${id}`)}
        />
      )}
      {!bookReady && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, color: colors.textDim }}>
          Загрузка книги...
        </div>
      )}
      <div style={{ flex: 1, overflow: "hidden", visibility: bookReady ? "visible" : "hidden" }}>
        <EbookReader
          bookBlob={bookBlob}
          initialPosition={initialPosition}
          settings={settings}
          callbacks={{ onRelocate: handleRelocate, onLoad: handleLoad }}
        />
      </div>
    </div>
  );
}
