import { colors } from "../../theme";
import type { UploadEntry } from "../upload-form.types";

interface Props {
  file: UploadEntry;
  showRemove: boolean;
  onRemove: () => void;
}

export default function UploadFileBadge({ file, showRemove, onRemove }: Readonly<Props>) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 4, backgroundColor: "rgba(255, 255, 255, 0.06)" }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: colors.accent }}>{file.format}</span>
      <span style={{ fontSize: 12, color: colors.textDim }}>{file.size}</span>
      {file.status === "uploading" && (
        file.progress >= 99 ? (
          <span style={{ fontSize: 11, color: colors.textDim, display: "inline-flex", alignItems: "center", gap: 4 }}>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <span style={{
              width: 10, height: 10,
              border: `1.5px solid ${colors.border}`,
              borderTopColor: colors.accent,
              borderRadius: "50%",
              display: "inline-block",
              animation: "spin 0.8s linear infinite",
            }} />
            {" "}обработка…
          </span>
        ) : (
          <span style={{ fontSize: 11, color: colors.textDim }}>{file.progress}%</span>
        )
      )}
      {file.status === "error" && <span style={{ fontSize: 11, color: "#ef4444" }}>{file.error}</span>}
      {showRemove && (
        <button onClick={onRemove} style={{ background: "none", border: "none", color: colors.textDim, cursor: "pointer", fontSize: 12, padding: 0, marginLeft: 2 }}>✕</button>
      )}
    </div>
  );
}
