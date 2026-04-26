import { colors } from "../../theme";
import type { BookGroup, UploadDuplicateAction } from "../upload-form.types";
import UploadFileBadge from "./UploadFileBadge";
import DuplicateActionPicker from "./DuplicateActionPicker";
import UploadGroupMetadata from "./UploadGroupMetadata";

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
}: Props) {
  return (
    <div
      data-testid="upload-group"
      onClick={() => isMergeTarget ? onPickAsTarget() : undefined}
      style={{
        border: `1px solid ${isMergeSource ? "rgba(249, 190, 3, 0.6)"
          : isMergeTarget ? "rgba(249, 190, 3, 0.4)"
          : group.duplicate ? "rgba(249, 190, 3, 0.4)"
          : group.hasDuplicateFormat ? "rgba(239, 68, 68, 0.4)" : colors.border}`,
        borderRadius: 8, padding: 16,
        backgroundColor: isMergeSource ? "rgba(249, 190, 3, 0.04)"
          : isMergeTarget ? "rgba(249, 190, 3, 0.02)"
          : "rgba(255, 255, 255, 0.02)",
        borderStyle: isMergeTarget ? "dashed" : "solid",
        cursor: isMergeTarget ? "pointer" : "default",
        transition: "all 0.15s",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 4 }}>
        {isMergeSource ? (
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
        ) : isMergeTarget ? (
          <span style={{ fontSize: 12, color: colors.accent }}>Нажмите для объединения</span>
        ) : (
          <>
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
          </>
        )}
      </div>

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
            showRemove={group.files.length > 1}
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

      {/* DB duplicate — user chooses action */}
      {group.duplicate && (
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
    </div>
  );
}
