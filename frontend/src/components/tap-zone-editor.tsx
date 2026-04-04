import { colors } from "../theme";
import {
  TapAction,
  DesktopTapZones,
  DEFAULT_DESKTOP_TAP_ZONES,
} from "./reader-toolbar";

function cycleAction(current: TapAction): TapAction {
  return current === "next" ? "prev" : "next";
}

const ACTION_COLORS: Record<TapAction, string> = {
  next: "rgba(76, 175, 80, 0.25)",
  prev: "rgba(244, 67, 54, 0.25)",
};

const ACTION_LABELS: Record<TapAction, string> = {
  next: "\u2192",
  prev: "\u2190",
};

const TOOLBAR_COLOR = "rgba(158, 158, 158, 0.15)";

interface DesktopTapZoneEditorProps {
  zones: DesktopTapZones;
  onChange: (zones: DesktopTapZones) => void;
}

export function DesktopTapZoneEditor({ zones, onChange }: DesktopTapZoneEditorProps) {
  function toggle(key: keyof DesktopTapZones) {
    onChange({ ...zones, [key]: cycleAction(zones[key]) });
  }

  const cellStyle = (action: TapAction): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: ACTION_COLORS[action],
    border: `1px solid ${colors.border}`,
    cursor: "pointer",
    fontSize: 18,
    fontWeight: 600,
    color: colors.textSecondary,
    userSelect: "none",
  });

  const fixedStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: TOOLBAR_COLOR,
    border: `1px solid ${colors.border}`,
    fontSize: 11,
    color: colors.textDim,
    userSelect: "none",
  };

  return (
    <div>
      <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 8 }}>
        Тап по зоне меняет действие. Центр всегда открывает тулбар.
      </div>
      <div style={{ display: "flex", height: 160, borderRadius: 8, overflow: "hidden", gap: 2 }}>
        {/* Left column: 2 zones, split 50/50 */}
        <div style={{ width: "33%", display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ ...cellStyle(zones.topLeft), flex: 1 }} onClick={() => toggle("topLeft")}>
            {ACTION_LABELS[zones.topLeft]}
          </div>
          <div style={{ ...cellStyle(zones.bottomLeft), flex: 1 }} onClick={() => toggle("bottomLeft")}>
            {ACTION_LABELS[zones.bottomLeft]}
          </div>
        </div>
        {/* Center column: 3 zones (top / toolbar / bottom) */}
        <div style={{ width: "34%", display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ ...cellStyle(zones.topCenter), flex: 1 }} onClick={() => toggle("topCenter")}>
            {ACTION_LABELS[zones.topCenter]}
          </div>
          <div style={{ ...fixedStyle, flex: 1 }}>
            меню
          </div>
          <div style={{ ...cellStyle(zones.bottomCenter), flex: 1 }} onClick={() => toggle("bottomCenter")}>
            {ACTION_LABELS[zones.bottomCenter]}
          </div>
        </div>
        {/* Right column: 2 zones, split 50/50 */}
        <div style={{ width: "33%", display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ ...cellStyle(zones.topRight), flex: 1 }} onClick={() => toggle("topRight")}>
            {ACTION_LABELS[zones.topRight]}
          </div>
          <div style={{ ...cellStyle(zones.bottomRight), flex: 1 }} onClick={() => toggle("bottomRight")}>
            {ACTION_LABELS[zones.bottomRight]}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 10, display: "flex", gap: 12, justifyContent: "center", alignItems: "center" }}>
        <span style={{ fontSize: 10, color: colors.textDim }}>
          <span style={{ display: "inline-block", width: 10, height: 10, background: ACTION_COLORS.next, borderRadius: 2, verticalAlign: "middle", marginRight: 3 }} />
          Вперёд
        </span>
        <span style={{ fontSize: 10, color: colors.textDim }}>
          <span style={{ display: "inline-block", width: 10, height: 10, background: ACTION_COLORS.prev, borderRadius: 2, verticalAlign: "middle", marginRight: 3 }} />
          Назад
        </span>
        <button
          onClick={() => onChange({ ...DEFAULT_DESKTOP_TAP_ZONES })}
          style={{
            background: "none",
            border: `1px solid ${colors.border}`,
            borderRadius: 6,
            padding: "3px 10px",
            fontSize: 11,
            color: colors.textDim,
            cursor: "pointer",
            fontFamily: "inherit",
            marginLeft: 8,
          }}
        >
          Сбросить
        </button>
      </div>
    </div>
  );
}
