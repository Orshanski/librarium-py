import { useState, useRef } from "react";
import { colors, fonts } from "../theme";

interface UploadedFile {
  id: string;
  name: string;
  size: string;
  format: string;
  progress: number; // 0-100
  status: "uploading" | "parsing" | "ready" | "duplicate" | "error";
  metadata: {
    title: string;
    authors: string;
    series: string;
    seriesNumber: string;
    description: string;
    language: string;
    tags: string;
    coverUrl: string | null;
  } | null;
  duplicateOf: string | null;
}

function formatSize(bytes: number): string {
  if (bytes > 1048576) return (bytes / 1048576).toFixed(1) + " MB";
  return Math.round(bytes / 1024) + " KB";
}

function mockParse(file: File): UploadedFile {
  const ext = file.name.split(".").pop()?.toUpperCase() || "???";
  const id = Math.random().toString(36).slice(2);
  const name = file.name.replace(/\.[^.]+$/, "");

  // Mock: simulate parsed metadata for known names
  const mockMeta: Record<string, UploadedFile["metadata"]> = {
    default: {
      title: name,
      authors: "",
      series: "",
      seriesNumber: "",
      description: "",
      language: "Русский",
      tags: "",
      coverUrl: null,
    },
  };

  return {
    id,
    name: file.name,
    size: formatSize(file.size),
    format: ext,
    progress: 0,
    status: "uploading",
    metadata: mockMeta.default,
    duplicateOf: null,
  };
}

function simulateUpload(
  fileState: UploadedFile,
  onUpdate: (f: UploadedFile) => void
) {
  let progress = 0;
  const interval = setInterval(() => {
    progress += Math.random() * 30 + 10;
    if (progress >= 100) {
      progress = 100;
      clearInterval(interval);

      // Simulate parsing
      onUpdate({ ...fileState, progress: 100, status: "parsing" });

      setTimeout(() => {
        // Mock: some files are "duplicates"
        const isDupe = fileState.name.toLowerCase().includes("препаратор");
        onUpdate({
          ...fileState,
          progress: 100,
          status: isDupe ? "duplicate" : "ready",
          duplicateOf: isDupe ? "Препараторы. Зов ястреба (Яна Летт)" : null,
          metadata: {
            title: fileState.name.replace(/\.[^.]+$/, ""),
            authors: "",
            series: "",
            seriesNumber: "",
            description: "Метаданные извлечены из файла (мок).",
            language: "Русский",
            tags: "Фэнтези",
            coverUrl: null,
          },
        });
      }, 800);
    } else {
      onUpdate({ ...fileState, progress: Math.min(progress, 99) });
    }
  }, 200);
}

export default function UploadForm() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function updateFile(id: string, updated: UploadedFile) {
    setFiles((prev) => prev.map((f) => (f.id === id ? updated : f)));
  }

  function handleFiles(fileList: FileList) {
    const accepted = Array.from(fileList).filter((f) => {
      const ext = f.name.split(".").pop()?.toLowerCase();
      return ["fb2", "epub", "pdf", "zip"].includes(ext || "");
    });

    for (const file of accepted) {
      const fileState = mockParse(file);
      setFiles((prev) => [...prev, fileState]);
      simulateUpload(fileState, (updated) => updateFile(fileState.id, updated));
    }
  }

  function removeFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  return (
    <div style={{ maxWidth: 700 }}>
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? colors.accent : colors.border}`,
          borderRadius: 12,
          padding: "48px 32px",
          textAlign: "center",
          cursor: "pointer",
          backgroundColor: dragOver ? "rgba(249, 190, 3, 0.05)" : "transparent",
          transition: "border-color 0.15s, background-color 0.15s",
          marginBottom: 32,
        }}
      >
        <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.4 }}>
          +
        </div>
        <div style={{ fontSize: 16, color: colors.text, marginBottom: 6 }}>
          Перетащите файлы сюда
        </div>
        <div style={{ fontSize: 13, color: colors.textDim }}>
          FB2, EPUB, PDF или ZIP-архив
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".fb2,.epub,.pdf,.zip"
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files?.length) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {files.map((f) => (
            <div
              key={f.id}
              style={{
                border: `1px solid ${
                  f.status === "duplicate"
                    ? "rgba(249, 190, 3, 0.4)"
                    : f.status === "error"
                    ? "rgba(239, 68, 68, 0.4)"
                    : colors.border
                }`,
                borderRadius: 8,
                padding: 16,
                backgroundColor: "rgba(255, 255, 255, 0.02)",
              }}
            >
              {/* Header: filename + format badge + remove */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      padding: "2px 8px",
                      fontSize: 11,
                      borderRadius: 4,
                      backgroundColor: "rgba(255, 255, 255, 0.08)",
                      color: colors.textDim,
                      fontWeight: 600,
                    }}
                  >
                    {f.format}
                  </span>
                  <span style={{ fontSize: 14, color: colors.text }}>{f.name}</span>
                  <span style={{ fontSize: 12, color: colors.textDim }}>{f.size}</span>
                </div>
                <button
                  onClick={() => removeFile(f.id)}
                  style={{
                    background: "none",
                    border: "none",
                    color: colors.textDim,
                    cursor: "pointer",
                    fontSize: 16,
                    padding: 4,
                  }}
                >
                  ✕
                </button>
              </div>

              {/* Progress bar */}
              {(f.status === "uploading" || f.status === "parsing") && (
                <div style={{ marginBottom: 12 }}>
                  <div
                    style={{
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: "rgba(255, 255, 255, 0.08)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${f.progress}%`,
                        backgroundColor: f.status === "parsing" ? colors.accent : colors.success,
                        borderRadius: 2,
                        transition: "width 0.2s",
                      }}
                    />
                  </div>
                  <div style={{ fontSize: 11, color: colors.textDim, marginTop: 4 }}>
                    {f.status === "uploading" ? `Загрузка ${Math.round(f.progress)}%` : "Извлечение метаданных..."}
                  </div>
                </div>
              )}

              {/* Duplicate warning */}
              {f.status === "duplicate" && (
                <div
                  style={{
                    padding: "8px 12px",
                    borderRadius: 6,
                    backgroundColor: "rgba(249, 190, 3, 0.08)",
                    border: "1px solid rgba(249, 190, 3, 0.2)",
                    fontSize: 13,
                    color: colors.accent,
                    marginBottom: 12,
                  }}
                >
                  Возможный дубликат: {f.duplicateOf}
                </div>
              )}

              {/* Metadata preview */}
              {f.metadata && (f.status === "ready" || f.status === "duplicate") && (
                <div style={{ marginBottom: 12 }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "80px 1fr",
                      gap: "4px 12px",
                      fontSize: 13,
                    }}
                  >
                    <span style={{ color: colors.textDim }}>Название</span>
                    <span style={{ color: colors.text }}>{f.metadata.title || "—"}</span>
                    <span style={{ color: colors.textDim }}>Авторы</span>
                    <span style={{ color: colors.textSecondary }}>{f.metadata.authors || "—"}</span>
                    <span style={{ color: colors.textDim }}>Язык</span>
                    <span style={{ color: colors.textSecondary }}>{f.metadata.language || "—"}</span>
                    <span style={{ color: colors.textDim }}>Жанры</span>
                    <span style={{ color: colors.textSecondary }}>{f.metadata.tags || "—"}</span>
                  </div>
                </div>
              )}

              {/* Actions */}
              {(f.status === "ready" || f.status === "duplicate") && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    style={{
                      padding: "6px 14px",
                      fontSize: 12,
                      fontFamily: "inherit",
                      borderRadius: 6,
                      border: `1px solid ${colors.accent}`,
                      backgroundColor: colors.accent,
                      color: colors.sidebar,
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    Сохранить
                  </button>
                  <button
                    style={{
                      padding: "6px 14px",
                      fontSize: 12,
                      fontFamily: "inherit",
                      borderRadius: 6,
                      border: `1px solid ${colors.border}`,
                      backgroundColor: "transparent",
                      color: colors.textSecondary,
                      cursor: "pointer",
                    }}
                  >
                    Редактировать
                  </button>
                  {f.status === "duplicate" && (
                    <button
                      style={{
                        padding: "6px 14px",
                        fontSize: 12,
                        fontFamily: "inherit",
                        borderRadius: 6,
                        border: `1px solid ${colors.border}`,
                        backgroundColor: "transparent",
                        color: colors.textSecondary,
                        cursor: "pointer",
                      }}
                    >
                      Добавить формат
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
