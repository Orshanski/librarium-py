import { useState } from "react";
import { colors } from "../theme";
import { ReaderSettings, DEFAULT_DESKTOP_TAP_ZONES, DEFAULT_PDF_TAP_ZONES, TapAction } from "./reader-toolbar";
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
  hideStyles?: boolean;
  tapZonesKey?: "desktopTapZones" | "pdfTapZones";
  availableActions?: TapAction[];
}

export default function ReaderSettingsPanel({ settings, onChange, hideStyles = false, tapZonesKey = "desktopTapZones", availableActions }: ReaderSettingsPanelProps) {
  const [userTab, setUserTab] = useState<"general" | "zones">("general");
  const tab = hideStyles ? "zones" : userTab;
  const setTab = setUserTab;

  const defaultZones = tapZonesKey === "pdfTapZones" ? DEFAULT_PDF_TAP_ZONES : DEFAULT_DESKTOP_TAP_ZONES;
  const zones = settings[tapZonesKey] ?? defaultZones;

  return (
    <>
      {/* Tab switcher — скрывается, если одна доступная вкладка */}
      {!hideStyles && (
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
      )}

      {!hideStyles && tab === "general" && (
        <ReaderGeneralSettings settings={settings} onChange={onChange} />
      )}

      {(hideStyles || tab === "zones") && (
        <DesktopTapZoneEditor
          zones={zones}
          onChange={(newZones) => onChange({ ...settings, [tapZonesKey]: newZones })}
          availableActions={availableActions}
          defaultZones={defaultZones}
        />
      )}
    </>
  );
}
