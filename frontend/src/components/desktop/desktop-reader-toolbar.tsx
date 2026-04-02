import { useState, useRef, useEffect } from "react";
import { colors, fonts } from "../../theme";
import { ReaderToolbarProps, ReaderSettings, FONT_OPTIONS, THEME_STYLES } from "../reader-toolbar";

const btnStyle: React.CSSProperties = {
  background: "none",
  border: `1px solid ${colors.border}`,
  borderRadius: 6,
  padding: "6px 14px",
  fontSize: 13,
  fontFamily: fonts.display,
  color: colors.textSecondary,
  cursor: "pointer",
};

const dropdownStyle: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  right: 0,
  marginTop: 4,
  background: colors.sidebar,
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  padding: "16px",
  zIndex: 200,
  minWidth: 260,
  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
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

export default function DesktopReaderToolbar({
  bookTitle,
  fraction,
  tocItems,
  settings,
  onSettingsChange,
  onTocSelect,
  onClose,
}: ReaderToolbarProps) {
  const [showToc, setShowToc] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

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

  const progressPct = Math.round(fraction * 100);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "0 16px",
        height: 48,
        background: colors.sidebar,
        borderBottom: `1px solid ${colors.border}`,
        position: "relative",
      }}
    >
      {/* Close button */}
      <button onClick={onClose} style={{ ...btnStyle, marginRight: 4 }}>
        ✕
      </button>

      {/* Book title */}
      <span
        style={{
          flex: 1,
          fontSize: 14,
          fontFamily: fonts.display,
          color: colors.text,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {bookTitle}
      </span>

      {/* Progress */}
      <span style={{ fontSize: 13, color: colors.textDim, whiteSpace: "nowrap" }}>
        {progressPct}%
      </span>

      {/* TOC button */}
      <div ref={tocRef} style={{ position: "relative" }}>
        <button
          onClick={() => { setShowToc((v) => !v); setShowSettings(false); }}
          style={{ ...btnStyle, background: showToc ? colors.border : "none" }}
        >
          Содержание
        </button>
        {showToc && (
          <div style={{ ...dropdownStyle, minWidth: 300, maxHeight: 400, overflowY: "auto" }}>
            {tocItems.length === 0 && (
              <span style={{ color: colors.textDim, fontSize: 13 }}>Нет содержания</span>
            )}
            {tocItems.map((item: any, i: number) => (
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

      {/* Settings button */}
      <div ref={settingsRef} style={{ position: "relative" }}>
        <button
          onClick={() => { setShowSettings((v) => !v); setShowToc(false); }}
          style={{ ...btnStyle, background: showSettings ? colors.border : "none" }}
        >
          Настройки
        </button>
        {showSettings && (
          <div style={dropdownStyle}>
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
            <span style={labelStyle}>Размер шрифта: {settings.fontSize}px</span>
            <input
              type="range"
              min={12}
              max={28}
              step={1}
              value={settings.fontSize}
              onChange={(e) => update({ fontSize: Number(e.target.value) })}
              style={{ width: "100%", marginBottom: 16, accentColor: colors.accent }}
            />

            {/* Line spacing */}
            <span style={labelStyle}>Межстрочный интервал: {settings.lineSpacing.toFixed(1)}</span>
            <input
              type="range"
              min={1}
              max={2.5}
              step={0.1}
              value={settings.lineSpacing}
              onChange={(e) => update({ lineSpacing: Number(e.target.value) })}
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

            {/* Toggles row */}
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => update({ hyphenate: !settings.hyphenate })}
                style={{
                  ...toggleBtnStyle,
                  flex: 1,
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
                  ...toggleBtnStyle,
                  flex: 1,
                  background: settings.justify ? "rgba(249,190,3,0.12)" : "none",
                  color: settings.justify ? colors.accent : colors.textSecondary,
                  borderColor: settings.justify ? colors.accent : colors.border,
                }}
              >
                По ширине
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
