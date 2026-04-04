import { useState } from "react";
import { colors } from "../theme";
import { ReaderSettings, DEFAULT_DESKTOP_TAP_ZONES } from "./reader-toolbar";
import ReaderGeneralSettings from "./reader-general-settings";
import { DesktopTapZoneEditor } from "./tap-zone-editor";

const tabBtnStyle: React.CSSProperties = {
  background: "none",
  border: `1px solid ${colors.border}`,
  borderRadius: 6,
  padding: "6px 12px",
  fontSize: 13,
  fontFamily: "inherit",
  color: colors.textSecondary,
  cursor: "pointer",
  flex: 1,
};

interface ReaderSettingsPanelProps {
  settings: ReaderSettings;
  onChange: (s: ReaderSettings) => void;
}

export default function ReaderSettingsPanel({ settings, onChange }: ReaderSettingsPanelProps) {
  const [tab, setTab] = useState<"general" | "zones">("general");

  return (
    <>
      {/* Tab switcher */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: `1px solid ${colors.border}`, paddingBottom: 8 }}>
        <button
          onClick={() => setTab("general")}
          style={{
            ...tabBtnStyle,
            background: tab === "general" ? colors.accent : "none",
            color: tab === "general" ? colors.sidebar : colors.textSecondary,
            borderColor: tab === "general" ? colors.accent : colors.border,
          }}
        >
          Общие
        </button>
        <button
          onClick={() => setTab("zones")}
          style={{
            ...tabBtnStyle,
            background: tab === "zones" ? colors.accent : "none",
            color: tab === "zones" ? colors.sidebar : colors.textSecondary,
            borderColor: tab === "zones" ? colors.accent : colors.border,
          }}
        >
          Зоны тапа
        </button>
      </div>

      {tab === "general" && (
        <ReaderGeneralSettings settings={settings} onChange={onChange} />
      )}

      {tab === "zones" && (
        <DesktopTapZoneEditor
          zones={settings.desktopTapZones ?? DEFAULT_DESKTOP_TAP_ZONES}
          onChange={(desktopTapZones) => onChange({ ...settings, desktopTapZones })}
        />
      )}
    </>
  );
}
