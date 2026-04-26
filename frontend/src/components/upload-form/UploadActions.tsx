import { useNavigate } from "react-router-dom";
import { colors } from "../../theme";

interface Props {
  saved: boolean;
  saving: boolean;
  uploading: boolean;
  readyCount: number;
  saveDisabledExtra: boolean;
  onSave: () => void;
  onCancel: () => void;
  onResetSaved: () => void;
}

export default function UploadActions({
  saved, saving, uploading, readyCount, saveDisabledExtra,
  onSave, onCancel, onResetSaved,
}: Props) {
  const navigate = useNavigate();
  const secondaryButtonStyle = {
    padding: "8px 20px", fontSize: 13, fontFamily: "inherit", borderRadius: 6,
    border: `1px solid ${colors.border}`, backgroundColor: "transparent",
    color: colors.textSecondary, cursor: "pointer",
  } as const;

  if (saved) {
    return (
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 8 }}>
        <span style={{ fontSize: 14, color: colors.success }}>Сохранено!</span>
        <button onClick={() => navigate("/")} style={secondaryButtonStyle}>В каталог</button>
        <button onClick={onResetSaved} style={secondaryButtonStyle}>Загрузить ещё</button>
      </div>
    );
  }

  const disabled = readyCount === 0 || uploading || saving || saveDisabledExtra;
  return (
    <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
      <button
        onClick={onSave}
        disabled={disabled}
        style={{
          padding: "10px 28px", fontSize: 14, fontFamily: "inherit", borderRadius: 6,
          border: "none",
          backgroundColor: readyCount > 0 && !uploading ? colors.accent : colors.border,
          color: readyCount > 0 && !uploading ? colors.sidebar : colors.textDim,
          cursor: readyCount > 0 && !uploading && !saving ? "pointer" : "default",
          fontWeight: 600, opacity: saving ? 0.7 : 1,
        }}
      >
        {saving ? "Сохранение..." : `Сохранить всё (${readyCount})`}
      </button>
      <button
        onClick={onCancel}
        disabled={saving}
        style={{
          padding: "10px 28px", fontSize: 14, fontFamily: "inherit", borderRadius: 6,
          border: `1px solid ${colors.border}`, backgroundColor: "transparent",
          color: colors.textSecondary, cursor: saving ? "default" : "pointer",
        }}
      >
        Отменить всё
      </button>
    </div>
  );
}
