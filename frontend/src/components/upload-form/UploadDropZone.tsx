import { useRef, useState } from "react";
import { colors } from "../../theme";

interface Props {
  groupsCount: number;
  onFiles: (files: FileList) => void;
}

export default function UploadDropZone({ groupsCount, onFiles }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `2px dashed ${dragOver ? colors.accent : colors.border}`,
        borderRadius: 12,
        padding: groupsCount > 0 ? "24px 32px" : "48px 32px",
        textAlign: "center", cursor: "pointer",
        backgroundColor: dragOver ? "rgba(249, 190, 3, 0.05)" : "transparent",
        transition: "border-color 0.15s, background-color 0.15s, padding 0.2s",
        marginBottom: 24,
      }}
    >
      <div style={{ fontSize: groupsCount > 0 ? 20 : 36, marginBottom: groupsCount > 0 ? 4 : 12, opacity: 0.4 }}>+</div>
      <div style={{ fontSize: groupsCount > 0 ? 14 : 16, color: colors.text, marginBottom: groupsCount > 0 ? 0 : 6 }}>
        Перетащите файлы сюда
      </div>
      {groupsCount === 0 && <div style={{ fontSize: 13, color: colors.textDim }}>FB2, EPUB, PDF или ZIP-архив</div>}
      <input ref={inputRef} type="file" multiple accept=".fb2,.epub,.pdf,.zip" style={{ display: "none" }}
        onChange={(e) => { if (e.target.files?.length) onFiles(e.target.files); e.target.value = ""; }} />
    </div>
  );
}
