import { useState } from "react";
import { colors, fonts, layout } from "../../theme";
import { ReaderToolbarProps, ReaderSettings, FONT_OPTIONS } from "../reader-toolbar";

export default function MobileReaderToolbar({
  bookTitle,
  fraction,
  tocItems,
  settings,
  onSettingsChange,
  onTocSelect,
  onClose,
}: ReaderToolbarProps) {
  const [panel, setPanel] = useState<null | "toc" | "settings">(null);

  function update(patch: Partial<ReaderSettings>) {
    onSettingsChange({ ...settings, ...patch });
  }

  const progressPct = Math.round(fraction * 100);

  const headerStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "0 16px",
    minHeight: layout.mobileHeaderMinHeight,
    background: colors.sidebar,
    borderBottom: `1px solid ${colors.border}`,
  };

  const btnStyle: React.CSSProperties = {
    background: "none",
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    padding: "10px 12px",
    fontSize: 14,
    fontFamily: "inherit",
    color: colors.textSecondary,
    cursor: "pointer",
    flexShrink: 0,
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
      {/* Header */}
      <div style={headerStyle}>
        <button onClick={onClose} style={btnStyle}>
          ✕
        </button>

        <span
          style={{
            flex: 1,
            fontSize: 15,
            fontFamily: fonts.display,
            color: colors.text,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {bookTitle}
        </span>

        <span style={{ fontSize: 13, color: colors.textDim, whiteSpace: "nowrap" }}>
          {progressPct}%
        </span>

        <button
          onClick={() => {
            if (document.fullscreenElement) document.exitFullscreen();
            else document.documentElement.requestFullscreen();
          }}
          style={btnStyle}
        >
          ⛶
        </button>

        <button
          onClick={() => setPanel(panel === "toc" ? null : "toc")}
          style={{ ...btnStyle, background: panel === "toc" ? colors.border : "none" }}
        >
          ☰
        </button>

        <button
          onClick={() => setPanel(panel === "settings" ? null : "settings")}
          style={{ ...btnStyle, background: panel === "settings" ? colors.border : "none" }}
        >
          ⚙
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
            <div>
              <span style={{ ...labelStyle, marginBottom: 12 }}>Содержание</span>
              {tocItems.length === 0 && (
                <span style={{ color: colors.textDim, fontSize: 14 }}>Нет содержания</span>
              )}
              {tocItems.map((item: any, i: number) => (
                <div
                  key={i}
                  onClick={() => { onTocSelect(item.href); setPanel(null); }}
                  style={{
                    padding: "12px 4px",
                    fontSize: 14,
                    color: colors.textSecondary,
                    cursor: "pointer",
                    borderBottom: `1px solid ${colors.border}`,
                    paddingLeft: (item.depth ?? 0) * 16 + 4,
                  }}
                >
                  {item.label}
                </div>
              ))}
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
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 6,
                  marginBottom: 20,
                }}
              >
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
                min={14}
                max={32}
                step={1}
                value={settings.fontSize}
                onChange={(e) => update({ fontSize: Number(e.target.value) })}
                style={{ width: "100%", marginBottom: 20, accentColor: colors.accent }}
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

              {/* Toggles row */}
              <div style={{ display: "flex", gap: 6, paddingBottom: 8 }}>
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

              {/* Margins */}
              <span style={labelStyle}>Поля</span>
              <div style={{ display: "flex", gap: 6, paddingBottom: 8 }}>
                {(["small", "medium", "large"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => update({ margins: m })}
                    style={{
                      ...toggleBtnStyle,
                      flex: 1,
                      background: settings.margins === m ? "rgba(249,190,3,0.12)" : "none",
                      color: settings.margins === m ? colors.accent : colors.textSecondary,
                      borderColor: settings.margins === m ? colors.accent : colors.border,
                    }}
                  >
                    {m === "small" ? "Мин" : m === "medium" ? "Сред" : "Макс"}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
