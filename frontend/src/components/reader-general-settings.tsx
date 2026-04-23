import { useState, useRef, useEffect, ReactNode } from "react";
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

type ActiveVariant = "solid" | "surface" | "subtle";

const SUBTLE_BG = "rgba(249,190,3,0.12)";

function activeColors(variant: ActiveVariant): Pick<React.CSSProperties, "background" | "color" | "borderColor"> {
  if (variant === "solid") {
    return { background: colors.accent, color: colors.sidebar, borderColor: colors.accent };
  }
  if (variant === "surface") {
    return { background: colors.accentBg, color: colors.accent, borderColor: colors.accent };
  }
  return { background: SUBTLE_BG, color: colors.accent, borderColor: colors.accent };
}

function ToggleBtn({
  active,
  onClick,
  children,
  variant,
  flex,
  style,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  variant: ActiveVariant;
  flex?: number;
  style?: React.CSSProperties;
}) {
  const activeStyle = active ? activeColors(variant) : { background: "none", color: colors.textSecondary, borderColor: colors.border };
  return (
    <button
      onClick={onClick}
      style={{
        ...toggleBtnStyle,
        ...(flex !== undefined ? { flex } : {}),
        ...activeStyle,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function DebouncedRange({
  label,
  value,
  onCommit,
  min,
  max,
  step,
  debounceRef,
}: {
  label: ReactNode;
  value: number;
  onCommit: (v: number) => void;
  min: number;
  max: number;
  step: number;
  debounceRef: React.MutableRefObject<ReturnType<typeof setTimeout> | undefined>;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);

  return (
    <>
      <span style={labelStyle}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={local}
        onChange={(e) => {
          const v = Number(e.target.value);
          setLocal(v);
          clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => onCommit(v), 150);
        }}
        style={{ width: "100%", marginBottom: 16, accentColor: colors.accent }}
      />
    </>
  );
}

interface ReaderGeneralSettingsProps {
  settings: ReaderSettings;
  onChange: (s: ReaderSettings) => void;
}

const THEME_LABELS: Record<string, string> = { dark: "Тёмная", warm: "Тёплая", light: "Светлая" };
const FLOW_LABELS: Record<string, string> = { paginated: "Страницы", scrolled: "Скролл" };

export default function ReaderGeneralSettings({ settings, onChange }: ReaderGeneralSettingsProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  function update(patch: Partial<ReaderSettings>) {
    onChange({ ...settings, ...patch });
  }

  return (
    <>
      {/* Theme */}
      <span style={labelStyle}>Тема</span>
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {(["dark", "warm", "light"] as const).map((t) => (
          <ToggleBtn
            key={t}
            active={settings.theme === t}
            onClick={() => update({ theme: t })}
            variant="solid"
            flex={1}
          >
            {THEME_LABELS[t]}
          </ToggleBtn>
        ))}
      </div>

      {/* Font */}
      <span style={labelStyle}>Шрифт</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
        {FONT_OPTIONS.map((f) => (
          <ToggleBtn
            key={f.value}
            active={settings.fontFamily === f.value}
            onClick={() => update({ fontFamily: f.value })}
            variant="surface"
            style={{ fontFamily: f.value, textAlign: "left" }}
          >
            {f.label}
          </ToggleBtn>
        ))}
      </div>

      <DebouncedRange
        label={`Размер шрифта: ${settings.fontSize}px`}
        value={settings.fontSize}
        onCommit={(v) => update({ fontSize: v })}
        min={12}
        max={28}
        step={1}
        debounceRef={debounceRef}
      />

      <DebouncedRange
        label={`Межстрочный интервал: ${settings.lineSpacing.toFixed(1)}`}
        value={settings.lineSpacing}
        onCommit={(v) => update({ lineSpacing: v })}
        min={1}
        max={2.5}
        step={0.1}
        debounceRef={debounceRef}
      />

      {/* Flow mode */}
      <span style={labelStyle}>Режим</span>
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {(["paginated", "scrolled"] as const).map((mode) => (
          <ToggleBtn
            key={mode}
            active={settings.flow === mode}
            onClick={() => update({ flow: mode })}
            variant="solid"
            flex={1}
          >
            {FLOW_LABELS[mode]}
          </ToggleBtn>
        ))}
      </div>

      {/* Toggles */}
      <div style={{ display: "flex", gap: 6 }}>
        <ToggleBtn
          active={settings.hyphenate}
          onClick={() => update({ hyphenate: !settings.hyphenate })}
          variant="subtle"
          flex={1}
        >
          Переносы
        </ToggleBtn>
        <ToggleBtn
          active={settings.justify}
          onClick={() => update({ justify: !settings.justify })}
          variant="subtle"
          flex={1}
        >
          По ширине
        </ToggleBtn>
      </div>
    </>
  );
}
