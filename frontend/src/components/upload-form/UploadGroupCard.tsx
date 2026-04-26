import { colors } from "../../theme";
import type { BookGroup, UploadDuplicateAction } from "../upload-form.types";
import UploadFileBadge from "./UploadFileBadge";
import DuplicateActionPicker from "./DuplicateActionPicker";
import UploadGroupMetadata from "./UploadGroupMetadata";
import UploadGroupHeader from "./UploadGroupHeader";

function cardStyle(group: BookGroup, isMergeSource: boolean, isMergeTarget: boolean): React.CSSProperties {
  const accentSoft = "rgba(249, 190, 3, 0.4)";
  let borderColor: string;
  if (isMergeSource) borderColor = "rgba(249, 190, 3, 0.6)";
  else if (isMergeTarget) borderColor = accentSoft;
  else if (group.duplicate) borderColor = accentSoft;
  else if (group.hasDuplicateFormat) borderColor = "rgba(239, 68, 68, 0.4)";
  else borderColor = colors.border;

  let backgroundColor: string;
  if (isMergeSource) backgroundColor = "rgba(249, 190, 3, 0.04)";
  else if (isMergeTarget) backgroundColor = "rgba(249, 190, 3, 0.02)";
  else backgroundColor = "rgba(255, 255, 255, 0.02)";

  return {
    border: `1px solid ${borderColor}`,
    borderRadius: 8, padding: 16,
    backgroundColor,
    borderStyle: isMergeTarget ? "dashed" : "solid",
    cursor: isMergeTarget ? "pointer" : "default",
    transition: "all 0.15s",
  };
}

interface Props {
  group: BookGroup;
  isMergeSource: boolean;
  isMergeTarget: boolean;
  showMergeButton: boolean;
  onStartMerge: () => void;
  onCancelMerge: () => void;
  onPickAsTarget: () => void;
  onRemoveGroup: () => void;
  onRemoveFile: (fileId: string) => void;
  onSetDuplicateAction: (action: UploadDuplicateAction) => void;
}

export default function UploadGroupCard({
  group, isMergeSource, isMergeTarget, showMergeButton,
  onStartMerge, onCancelMerge, onPickAsTarget,
  onRemoveGroup, onRemoveFile, onSetDuplicateAction,
}: Readonly<Props>) {
  // In merge-target mode the whole card is a single big button — no nested
  // buttons allowed (HTML forbids button-in-button), so file ✕ and the
  // duplicate-action picker are hidden until the user finishes merge selection.
  const cardChildren = (
    <>
      <UploadGroupHeader
        isMergeSource={isMergeSource}
        isMergeTarget={isMergeTarget}
        showMergeButton={showMergeButton}
        onStartMerge={onStartMerge}
        onCancelMerge={onCancelMerge}
        onRemoveGroup={onRemoveGroup}
      />

      {isMergeSource && (
        <div style={{
          padding: "8px 12px", borderRadius: 6,
          background: "rgba(249, 190, 3, 0.08)",
          border: "1px solid rgba(249, 190, 3, 0.2)",
          fontSize: 13, color: colors.accent, marginBottom: 12,
        }}>
          Выберите карточку для объединения ↓
        </div>
      )}

      {/* Files list */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {group.files.map((f) => (
          <UploadFileBadge
            key={f.id}
            file={f}
            showRemove={!isMergeTarget && group.files.length > 1}
            onRemove={() => onRemoveFile(f.id)}
          />
        ))}
      </div>

      {/* Duplicate format warning */}
      {group.hasDuplicateFormat && (
        <div style={{
          padding: "8px 12px", borderRadius: 6,
          backgroundColor: "rgba(239, 68, 68, 0.08)",
          border: "1px solid rgba(239, 68, 68, 0.2)",
          fontSize: 13, color: "#ef4444", marginBottom: 8,
        }}>
          Одинаковый формат — дубликат будет пропущен
        </div>
      )}

      {/* DB duplicate — user chooses action (hidden in merge-target mode) */}
      {!isMergeTarget && group.duplicate && (
        <DuplicateActionPicker
          duplicate={group.duplicate}
          duplicateAction={group.duplicateAction}
          onAction={onSetDuplicateAction}
        />
      )}

      {/* Metadata + cover */}
      {group.metadata && group.files.some((f) => f.status === "ready") && (
        <UploadGroupMetadata metadata={group.metadata} />
      )}
    </>
  );

  if (isMergeTarget) {
    return (
      <button
        type="button"
        data-testid="upload-group"
        onClick={onPickAsTarget}
        style={{
          ...cardStyle(group, isMergeSource, isMergeTarget),
          // Reset native <button> defaults so the card looks identical to <div>:
          font: "inherit", color: "inherit", textAlign: "left",
          width: "100%", display: "block",
        }}
      >
        {cardChildren}
      </button>
    );
  }

  return (
    <div data-testid="upload-group" style={cardStyle(group, isMergeSource, isMergeTarget)}>
      {cardChildren}
    </div>
  );
}
