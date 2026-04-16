import { useState, useRef, useEffect } from "react";
import { colors } from "../theme";
import type { ReaderSettings } from "../types/reader-settings";
import { FONT_OPTIONS } from "../constants/reader-defaults";

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

interface ReaderGeneralSettingsProps {
  settings: ReaderSettings;
  onChange: (s: ReaderSettings) => void;
}

export default function ReaderGeneralSettings({ settings, onChange }: ReaderGeneralSettingsProps) {
  const [localFontSize, setLocalFontSize] = useState(settings.fontSize);
  const [localLineSpacing, setLocalLineSpacing] = useState(settings.lineSpacing);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => { setLocalFontSize(settings.fontSize); }, [settings.fontSize]);
  useEffect(() => { setLocalLineSpacing(settings.lineSpacing); }, [settings.lineSpacing]);
  useEffect(() => () => clearTimeout(debounceRef.current), []);

  function update(patch: Partial<ReaderSettings>) {
    onChange({ ...settings, ...patch });
  }

  function debouncedUpdate(patch: Partial<ReaderSettings>) {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => update(patch), 150);
  }

  return (
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
  );
}
