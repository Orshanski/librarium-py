import { useState, useRef, useEffect } from "react";
import { colors, fonts, layout } from "../../theme";
import type { ReaderToolbarProps } from "../../types/reader-toolbar";
import type { ReaderSettings } from "../../types/reader-settings";
import { FONT_OPTIONS } from "../../constants/reader-defaults";
import { flattenToc } from "../../utils/reader-toc";

export default function MobileReaderToolbar({
  bookTitle,
  fraction,
  tocItems,
  currentTocHref,
  settings,
  onSettingsChange,
  onTocSelect,
  onClose,
  maxTocDepth,
}: ReaderToolbarProps) {
  const [panel, setPanel] = useState<null | "toc" | "settings">(null);
  const [localFontSize, setLocalFontSize] = useState(settings.fontSize);
  const [localLineSpacing, setLocalLineSpacing] = useState(settings.lineSpacing);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const tocListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (panel === "toc" && tocListRef.current) {
      const active = tocListRef.current.querySelector('[data-active="true"]') as HTMLElement | null;
      if (active) active.scrollIntoView({ block: "center" });
    }
  }, [panel]);

  useEffect(() => { setLocalFontSize(settings.fontSize); }, [settings.fontSize]);
  useEffect(() => { setLocalLineSpacing(settings.lineSpacing); }, [settings.lineSpacing]);
  useEffect(() => () => clearTimeout(debounceRef.current), []);

  function update(patch: Partial<ReaderSettings>) {
    onSettingsChange({ ...settings, ...patch });
  }

  function debouncedUpdate(patch: Partial<ReaderSettings>) {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => update(patch), 150);
  }

  const progressPct = Math.round(fraction * 100);

  const btnStyle: React.CSSProperties = {
    background: "none",
    border: "none",
    padding: "12px 16px",
    fontSize: 21,
    fontFamily: "inherit",
    color: colors.textSecondary,
    cursor: "pointer",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 1,
  };

  const toggleBtnStyle: React.CSSProperties = {
    background: "none",
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    padding: "12px 16px",
    fontSize: 14,
    fontFamily: "inherit",
    color: colors.textSecondary,
    cursor: "pointer",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: colors.textDim,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginBottom: 8,
    display: "block",
  };

  return (
    <>
      {/* Fixed top header bar */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 200,
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "0 12px 4px",
          paddingTop: "env(safe-area-inset-top)",
          minHeight: 44,
          background: colors.sidebar,
          borderBottom: `1px solid ${colors.border}`,
        }}
      >
        <button onClick={onClose} style={btnStyle}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>

        {/* Title — tap to open TOC */}
        <span
          onClick={() => setPanel(panel === "toc" ? null : "toc")}
          style={{
            flex: 1,
            fontSize: 20,
            fontFamily: fonts.display,
            color: colors.text,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            cursor: "pointer",
          }}
        >
          {bookTitle}
        </span>

        <span style={{ fontSize: 17, color: colors.textDim, whiteSpace: "nowrap" }}>
          {progressPct}%
        </span>

        <button
          onClick={() => setPanel(panel === "settings" ? null : "settings")}
          style={btnStyle}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
      </div>

      {/* Bottom sheet overlay */}
      {panel !== null && (
        <div
          onClick={() => setPanel(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            zIndex: 300,
          }}
        />
      )}

      {/* Bottom sheet panel */}
      {panel !== null && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            background: colors.sidebar,
            borderRadius: "12px 12px 0 0",
            maxHeight: "70vh",
            overflowY: "auto",
            zIndex: 301,
            padding: "16px",
            borderTop: `1px solid ${colors.border}`,
          }}
        >
          {/* Drag handle */}
          <div
            style={{
              width: 40,
              height: 4,
              borderRadius: 2,
              background: colors.border,
              margin: "0 auto 16px",
            }}
          />

          {panel === "toc" && (
            <div ref={tocListRef}>
              <span style={{ ...labelStyle, marginBottom: 12 }}>Содержание</span>
              {tocItems.length === 0 && (
                <span style={{ color: colors.textDim, fontSize: 14 }}>Нет содержания</span>
              )}
              {flattenToc(tocItems, 0, maxTocDepth).map((item, i) => {
                const isActive = item.href === currentTocHref;
                return (
                  <div
                    key={i}
                    data-active={isActive || undefined}
                    onClick={() => { onTocSelect(item.href); setPanel(null); }}
                    style={{
                      padding: "12px 4px",
                      fontSize: 14,
                      color: isActive ? colors.accent : colors.textSecondary,
                      fontWeight: isActive ? 600 : 400,
                      cursor: "pointer",
                      borderBottom: `1px solid ${colors.border}`,
                      paddingLeft: (item.depth ?? 0) * 16 + 4,
                    }}
                  >
                    {item.label}
                  </div>
                );
              })}
            </div>
          )}

          {panel === "settings" && (
            <div>
              {/* Theme */}
              <span style={labelStyle}>Тема</span>
              <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
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
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 20 }}>
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
                type="range" min={14} max={32} step={1}
                value={localFontSize}
                onChange={(e) => { const v = Number(e.target.value); setLocalFontSize(v); debouncedUpdate({ fontSize: v }); }}
                style={{ width: "100%", marginBottom: 20, accentColor: colors.accent }}
              />

              {/* Line spacing */}
              <span style={labelStyle}>Межстрочный интервал: {localLineSpacing.toFixed(1)}</span>
              <input
                type="range" min={1} max={2.5} step={0.1}
                value={localLineSpacing}
                onChange={(e) => { const v = Number(e.target.value); setLocalLineSpacing(v); debouncedUpdate({ lineSpacing: v }); }}
                style={{ width: "100%", marginBottom: 20, accentColor: colors.accent }}
              />

              {/* Flow mode */}
              <span style={labelStyle}>Режим</span>
              <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
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
              <div style={{ display: "flex", gap: 6, paddingBottom: 8 }}>
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
            </div>
          )}
        </div>
      )}
    </>
  );
}
