import { colors } from "../../theme";
import type { UploadDuplicate } from "@/api/endpoints/upload";
import type { UploadDuplicateAction } from "../upload-form.types";

interface Props {
  duplicate: UploadDuplicate;
  duplicateAction: UploadDuplicateAction | null;
  onAction: (action: UploadDuplicateAction) => void;
}

export default function DuplicateActionPicker({ duplicate, duplicateAction, onAction }: Readonly<Props>) {
  const buttonStyle = (active: boolean) => ({
    padding: "4px 10px", fontSize: 12, borderRadius: 4,
    border: "1px solid " + colors.accent,
    background: active ? colors.accent : "transparent",
    color: active ? "#fff" : colors.accent,
    cursor: "pointer",
  });
  return (
    <div style={{ padding: "8px 12px", borderRadius: 6, backgroundColor: "rgba(249, 190, 3, 0.08)", border: "1px solid rgba(249, 190, 3, 0.2)", fontSize: 13, color: colors.accent, marginBottom: 8 }}>
      <div style={{ marginBottom: 6 }}>
        Похожая книга: {duplicate.title} ({duplicate.authors.map((a) => a.name).join(", ")})
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button style={buttonStyle(duplicateAction === "add-format")} onClick={() => onAction("add-format")}>
          Добавить как формат
        </button>
        <button style={buttonStyle(duplicateAction === "new-book")} onClick={() => onAction("new-book")}>
          Сохранить как отдельную
        </button>
      </div>
    </div>
  );
}
