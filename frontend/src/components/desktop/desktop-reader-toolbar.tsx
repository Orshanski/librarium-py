import { useState, useRef, useEffect } from "react";
import { colors, fonts } from "../../theme";
import { ReaderToolbarProps, ReaderSettings, FONT_OPTIONS, THEME_STYLES, DEFAULT_DESKTOP_TAP_ZONES, flattenToc } from "../reader-toolbar";
import { DesktopTapZoneEditor } from "../tap-zone-editor";

const btnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: "12px 16px",
  fontSize: 17,
  fontFamily: fonts.display,
  color: colors.text,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  lineHeight: 1,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: colors.textDim,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom: 8,
  display: "block",
};

const toggleBtnStyle: React.CSSProperties = {
  background: "none",
  border: `1px solid ${colors.border}`,
  borderRadius: 6,
  padding: "6px 12px",
  fontSize: 13,
  fontFamily: "inherit",
  color: colors.textSecondary,
  cursor: "pointer",
};

// Icon sizes: desktop 20-24px, mobile 18-22px (visually balanced per platform)
const isPWA = window.matchMedia("(display-mode: standalone)").matches
  || (navigator as { standalone?: boolean }).standalone === true;

export default function DesktopReaderToolbar({
  bookTitle,
  tocItems,
  settings,
  onSettingsChange,
  onTocSelect,
  onClose,
}: ReaderToolbarProps) {
  const [showToc, setShowToc] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"general" | "zones">("general");
  const [localFontSize, setLocalFontSize] = useState(settings.fontSize);
  const [localLineSpacing, setLocalLineSpacing] = useState(settings.lineSpacing);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Sync local state when settings load from server
  useEffect(() => { setLocalFontSize(settings.fontSize); }, [settings.fontSize]);
  useEffect(() => { setLocalLineSpacing(settings.lineSpacing); }, [settings.lineSpacing]);
  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const tocRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: PointerEvent) {
      if (tocRef.current && !tocRef.current.contains(e.target as Node)) {
        setShowToc(false);
      }
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    }
    if (showToc || showSettings) {
      document.addEventListener("pointerdown", handleClick);
      return () => document.removeEventListener("pointerdown", handleClick);
    }
  }, [showToc, showSettings]);

  function update(patch: Partial<ReaderSettings>) {
    onSettingsChange({ ...settings, ...patch });
  }

  function debouncedUpdate(patch: Partial<ReaderSettings>) {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => update(patch), 150);
  }

  return (
    <>
      {/* Top bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 8,
          padding: "env(safe-area-inset-top) 16px 8px",
          minHeight: 48,
          background: colors.sidebar,
          borderBottom: `1px solid ${colors.border}`,
        }}
      >
        {/* Fullscreen — only in browser, not PWA */}
        {!isPWA && (
          <button
            onClick={() => {
              if (document.fullscreenElement) document.exitFullscreen();
              else document.documentElement.requestFullscreen();
            }}
            style={btnStyle}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
          </button>
        )}

        {/* Book title — tap to open TOC */}
        <div ref={tocRef} style={{ position: "relative" }}>
          <span
            onClick={() => { setShowToc((v) => !v); setShowSettings(false); }}
            style={{
              display: "block",
              fontSize: 20,
              fontFamily: fonts.display,
              color: colors.text,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              cursor: "pointer",
              maxWidth: 400,
            }}
          >
            {bookTitle}
          </span>
          {showToc && (
            <div style={{
              position: "absolute", top: "100%", right: 0, marginTop: 4,
              background: colors.sidebar, border: `1px solid ${colors.border}`,
              borderRadius: 8, padding: "16px", zIndex: 200,
              width: "min(360px, 90vw)", maxHeight: 400, overflowY: "auto",
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            }}>
              {tocItems.length === 0 && (
                <span style={{ color: colors.textDim, fontSize: 13 }}>Нет содержания</span>
              )}
              {flattenToc(tocItems).map((item: { label: string; href: string; depth?: number }, i: number) => (
                <div
                  key={i}
                  onClick={() => { onTocSelect(item.href); setShowToc(false); }}
                  style={{
                    padding: "8px 4px",
                    fontSize: 13,
                    color: colors.textSecondary,
                    cursor: "pointer",
                    borderBottom: `1px solid ${colors.border}`,
                    paddingLeft: (item.depth ?? 0) * 16 + 4,
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.color = colors.text; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.color = colors.textSecondary; }}
                >
                  {item.label}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Close */}
        <button onClick={onClose} style={btnStyle}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      {/* Settings gear — fixed right side */}
      <div
        ref={settingsRef}
        style={{
          position: "absolute",
          right: 20,
          bottom: 20,
          zIndex: 200,
        }}
      >
        <button
          onClick={() => { setShowSettings((v) => !v); setShowToc(false); }}
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            border: `1px solid ${colors.border}`,
            background: showSettings ? colors.sidebar : "rgba(0,0,0,0.4)",
            color: colors.accent,
            fontSize: 26,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: showSettings ? 1 : 0.6,
            transition: "opacity 0.2s, background 0.2s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
          onMouseLeave={(e) => { if (!showSettings) e.currentTarget.style.opacity = "0.6"; }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
        {showSettings && (
          <div style={{
            position: "absolute", bottom: "100%", right: 0, marginBottom: 8,
            background: colors.sidebar, border: `1px solid ${colors.border}`,
            borderRadius: 8, padding: "16px", zIndex: 200,
            minWidth: 260, boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}>
            {/* Tab switcher */}
            <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: `1px solid ${colors.border}`, paddingBottom: 8 }}>
              <button
                onClick={() => setSettingsTab("general")}
                style={{
                  ...toggleBtnStyle,
                  flex: 1,
                  background: settingsTab === "general" ? colors.accent : "none",
                  color: settingsTab === "general" ? colors.sidebar : colors.textSecondary,
                  borderColor: settingsTab === "general" ? colors.accent : colors.border,
                }}
              >
                Общие
              </button>
              <button
                onClick={() => setSettingsTab("zones")}
                style={{
                  ...toggleBtnStyle,
                  flex: 1,
                  background: settingsTab === "zones" ? colors.accent : "none",
                  color: settingsTab === "zones" ? colors.sidebar : colors.textSecondary,
                  borderColor: settingsTab === "zones" ? colors.accent : colors.border,
                }}
              >
                Зоны тапа
              </button>
            </div>

            {settingsTab === "general" && (
              <>
                {/* Theme */}
                <span style={labelStyle}>Тема</span>
                <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
                  {(["dark", "warm", "light"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => update({ theme: t })}
                      style={{
                        ...toggleBtnStyle,
                        flex: 1,
                        background: settings.theme === t ? colors.accent : "none",
                        color: settings.theme === t ? colors.sidebar : colors.textSecondary,
                        borderColor: settings.theme === t ? colors.accent : colors.border,
                      }}
                    >
                      {t === "dark" ? "Тёмная" : t === "warm" ? "Тёплая" : "Светлая"}
                    </button>
                  ))}
                </div>

                {/* Font */}
                <span style={labelStyle}>Шрифт</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
                  {FONT_OPTIONS.map((f) => (
                    <button
                      key={f.value}
                      onClick={() => update({ fontFamily: f.value })}
                      style={{
                        ...toggleBtnStyle,
                        fontFamily: f.value,
                        textAlign: "left",
                        background: settings.fontFamily === f.value ? colors.accentBg : "none",
                        color: settings.fontFamily === f.value ? colors.accent : colors.textSecondary,
                        borderColor: settings.fontFamily === f.value ? colors.accent : colors.border,
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* Font size */}
                <span style={labelStyle}>Размер шрифта: {localFontSize}px</span>
                <input
                  type="range" min={12} max={28} step={1}
                  value={localFontSize}
                  onChange={(e) => { const v = Number(e.target.value); setLocalFontSize(v); debouncedUpdate({ fontSize: v }); }}
                  style={{ width: "100%", marginBottom: 16, accentColor: colors.accent }}
                />

                {/* Line spacing */}
                <span style={labelStyle}>Межстрочный интервал: {localLineSpacing.toFixed(1)}</span>
                <input
                  type="range" min={1} max={2.5} step={0.1}
                  value={localLineSpacing}
                  onChange={(e) => { const v = Number(e.target.value); setLocalLineSpacing(v); debouncedUpdate({ lineSpacing: v }); }}
                  style={{ width: "100%", marginBottom: 16, accentColor: colors.accent }}
                />

                {/* Flow mode */}
                <span style={labelStyle}>Режим</span>
                <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
                  {(["paginated", "scrolled"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => update({ flow: mode })}
                      style={{
                        ...toggleBtnStyle,
                        flex: 1,
                        background: settings.flow === mode ? colors.accent : "none",
                        color: settings.flow === mode ? colors.sidebar : colors.textSecondary,
                        borderColor: settings.flow === mode ? colors.accent : colors.border,
                      }}
                    >
                      {mode === "paginated" ? "Страницы" : "Скролл"}
                    </button>
                  ))}
                </div>

                {/* Toggles */}
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={() => update({ hyphenate: !settings.hyphenate })}
                    style={{
                      ...toggleBtnStyle, flex: 1,
                      background: settings.hyphenate ? "rgba(249,190,3,0.12)" : "none",
                      color: settings.hyphenate ? colors.accent : colors.textSecondary,
                      borderColor: settings.hyphenate ? colors.accent : colors.border,
                    }}
                  >
                    Переносы
                  </button>
                  <button
                    onClick={() => update({ justify: !settings.justify })}
                    style={{
                      ...toggleBtnStyle, flex: 1,
                      background: settings.justify ? "rgba(249,190,3,0.12)" : "none",
                      color: settings.justify ? colors.accent : colors.textSecondary,
                      borderColor: settings.justify ? colors.accent : colors.border,
                    }}
                  >
                    По ширине
                  </button>
                </div>
              </>
            )}

            {settingsTab === "zones" && (
              <DesktopTapZoneEditor
                zones={settings.desktopTapZones ?? DEFAULT_DESKTOP_TAP_ZONES}
                onChange={(desktopTapZones) => update({ desktopTapZones })}
              />
            )}
          </div>
        )}
      </div>
    </>
  );
}
