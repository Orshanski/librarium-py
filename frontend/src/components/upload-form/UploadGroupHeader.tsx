import { colors } from "../../theme";

interface Props {
  isMergeSource: boolean;
  isMergeTarget: boolean;
  showMergeButton: boolean;
  onStartMerge: () => void;
  onCancelMerge: () => void;
  onRemoveGroup: () => void;
}

export default function UploadGroupHeader({
  isMergeSource, isMergeTarget, showMergeButton,
  onStartMerge, onCancelMerge, onRemoveGroup,
}: Readonly<Props>) {
  if (isMergeSource) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 4 }}>
        <button
          onClick={(e) => { e.stopPropagation(); onCancelMerge(); }}
          style={{
            padding: "3px 10px", fontSize: 12, fontFamily: "inherit", borderRadius: 4,
            border: `1px solid rgba(255,255,255,0.15)`,
            background: "rgba(255,255,255,0.05)",
            color: colors.textSecondary, cursor: "pointer",
          }}
        >
          Отмена
        </button>
      </div>
    );
  }

  if (isMergeTarget) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: colors.accent }}>Нажмите для объединения</span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 4 }}>
      {showMergeButton && (
        <button
          onClick={(e) => { e.stopPropagation(); onStartMerge(); }}
          style={{
            padding: "3px 10px", fontSize: 12, fontFamily: "inherit", borderRadius: 4,
            border: `1px solid rgba(249, 190, 3, 0.3)`,
            background: "rgba(249, 190, 3, 0.08)",
            color: colors.accent, cursor: "pointer",
          }}
        >
          ⊕ Объединить
        </button>
      )}
      <button
        onClick={onRemoveGroup}
        style={{
          background: "none", border: "none", color: colors.textDim,
          cursor: "pointer", fontSize: 16, padding: 4,
        }}
      >
        ✕
      </button>
    </div>
  );
}
