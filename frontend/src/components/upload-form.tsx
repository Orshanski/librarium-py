import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { colors } from "../theme";

interface UploadEntry {
  id: string;
  tempId: string;
  name: string;
  size: string;
  format: string;
  progress: number;
  status: "uploading" | "ready" | "error";
  error?: string;
}

interface BookGroup {
  key: string; // lowercase title+authors
  metadata: {
    title: string;
    authors: string;
    series: string;
    seriesNumber: string;
    description: string;
    language: string;
    tags: string;
    publisher: string;
    pubDate: string;
    isbn: string;
    coverUrl: string | null;
  };
  files: UploadEntry[];
  duplicate: { id: number; title: string; authors: string } | null; // from DB
  duplicateAction: "add-format" | "new-book" | null;
  hasDuplicateFormat: boolean;
}

interface UploadResponse {
  tempId: string;
  format: string;
  metadata: BookGroup["metadata"];
  duplicate: BookGroup["duplicate"];
}

function formatSize(bytes: number): string {
  if (bytes > 1048576) return (bytes / 1048576).toFixed(1) + " MB";
  return Math.round(bytes / 1024) + " KB";
}

function groupKey(title: string, authors: string): string {
  return (title.trim() + "|||" + authors.trim()).toLowerCase();
}

export default function UploadForm() {
  const [groups, setGroups] = useState<BookGroup[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [mergeSource, setMergeSource] = useState<string | null>(null); // key of source group
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  function handleFiles(fileList: FileList) {
    const accepted = Array.from(fileList).filter((f) => {
      const ext = f.name.split(".").pop()?.toLowerCase();
      return ["fb2", "epub", "pdf", "zip"].includes(ext || "");
    });
    for (const file of accepted) {
      const id = Math.random().toString(36).slice(2);
      const ext = file.name.split(".").pop()?.toUpperCase() || "???";
      const entry: UploadEntry = {
        id, tempId: "", name: file.name, size: formatSize(file.size),
        format: ext, progress: 0, status: "uploading",
      };
      // Add as ungrouped initially (will be grouped when upload completes)
      setGroups((prev) => [...prev, {
        key: "__pending_" + id,
        metadata: { title: file.name, authors: "", series: "", seriesNumber: "", description: "", language: "", tags: "", publisher: "", pubDate: "", isbn: "", coverUrl: null },
        files: [entry],
        duplicate: null,
        duplicateAction: null,
        hasDuplicateFormat: false,
      }]);
      uploadFile(id, file);
    }
  }

  async function uploadFile(id: string, file: File) {
    const form = new FormData();
    form.append("file", file);
    try {
      const result = await new Promise<UploadResponse>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/upload");
        xhr.withCredentials = true;
        xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.min(Math.round((e.loaded / e.total) * 100), 99);
            setGroups((prev) => prev.map((g) => ({
              ...g,
              files: g.files.map((f) => f.id === id ? { ...f, progress: pct } : f),
            })));
          }
        };
        xhr.onload = () => {
          if (xhr.status === 200) resolve(JSON.parse(xhr.responseText));
          else {
            try { reject(new Error(JSON.parse(xhr.responseText).detail || `HTTP ${xhr.status}`)); }
            catch { reject(new Error(`HTTP ${xhr.status}`)); }
          }
        };
        xhr.onerror = () => reject(new Error("Ошибка сети"));
        xhr.send(form);
      });

      const meta = result.metadata;
      const fmt = result.format || file.name.split(".").pop()?.toUpperCase() || "???";
      const key = groupKey(meta.title, meta.authors);

      setGroups((prev) => {
        // Remove pending group for this file
        const without = prev.filter((g) => g.key !== "__pending_" + id);

        // Find existing group with same key
        const existing = without.find((g) => g.key === key);

        const updatedEntry: UploadEntry = {
          id, tempId: result.tempId, name: file.name,
          size: formatSize(file.size), format: fmt, progress: 100, status: "ready",
        };

        if (existing) {
          // Merge into existing group
          const hasDupeFmt = existing.files.some((f) => f.format === fmt && f.status === "ready");
          return without.map((g) => g.key === key ? {
            ...g,
            files: [...g.files, updatedEntry],
            hasDuplicateFormat: g.hasDuplicateFormat || hasDupeFmt,
            // Keep better metadata (prefer one with cover)
            metadata: !g.metadata.coverUrl && meta.coverUrl ? meta : g.metadata,
          } : g);
        } else {
          // New group
          return [...without, {
            key,
            metadata: meta,
            files: [updatedEntry],
            duplicate: result.duplicate,
            duplicateAction: null,
            hasDuplicateFormat: false,
          }];
        }
      });
    } catch (e: any) {
      setGroups((prev) => prev.map((g) => ({
        ...g,
        files: g.files.map((f) => f.id === id ? { ...f, status: "error" as const, error: e.message, progress: 0 } : f),
      })));
    }
  }

  function removeFile(fileId: string) {
    setGroups((prev) => {
      const updated: BookGroup[] = [];
      for (const g of prev) {
        const file = g.files.find((f) => f.id === fileId);
        if (file?.tempId) {
          fetch(`/api/uploads/${file.tempId}`, { method: "DELETE" }).catch((err) => console.warn("Upload cleanup failed:", err));
        }
        const remaining = g.files.filter((f) => f.id !== fileId);
        if (remaining.length > 0) {
          updated.push({ ...g, files: remaining });
        }
      }
      return updated;
    });
  }

  function removeGroup(key: string) {
    setGroups((prev) => {
      const group = prev.find((g) => g.key === key);
      if (group) {
        for (const f of group.files) {
          if (f.tempId) fetch(`/api/uploads/${f.tempId}`, { method: "DELETE" }).catch((err) => console.warn("Upload cleanup failed:", err));
        }
      }
      return prev.filter((g) => g.key !== key);
    });
  }

  async function saveAll() {
    const ready = groups.filter((g) => g.files.some((f) => f.status === "ready"));
    if (ready.length === 0) return;
    setSaving(true);

    for (const g of ready) {
      const readyFiles = g.files.filter((f) => f.status === "ready");
      if (readyFiles.length === 0) continue;

      if (g.duplicate && g.duplicateAction === "add-format") {
        // User confirmed: add as format to existing book
        for (const f of readyFiles) {
          await fetch(`/api/books/${g.duplicate.id}/add-format`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tempId: f.tempId }),
          }).catch((err) => console.warn("Upload cleanup failed:", err));
        }
      } else {
        // First file creates book, rest add as format
        const first = readyFiles[0];
        const res = await fetch("/api/books/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tempId: first.tempId, metadata: g.metadata }),
        }).catch(() => null);

        if (res?.ok) {
          const data = await res.json();
          for (const f of readyFiles.slice(1)) {
            await fetch(`/api/books/${data.bookId}/add-format`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ tempId: f.tempId }),
            }).catch((err) => console.warn("Upload cleanup failed:", err));
          }
        }
      }
    }

    sessionStorage.removeItem("librarium_catalog");
    setSaving(false);
    setSaved(true);
  }

  function mergeMeta(a: BookGroup["metadata"], b: BookGroup["metadata"]): BookGroup["metadata"] {
    // For each field, prefer non-empty value. Target (a) wins on ties.
    const pick = (va: string, vb: string) => va || vb;
    return {
      title: a.title.length >= b.title.length ? a.title : b.title, // prefer longer title
      authors: pick(a.authors, b.authors),
      series: pick(a.series, b.series),
      seriesNumber: pick(a.seriesNumber, b.seriesNumber),
      description: (a.description || "").length >= (b.description || "").length ? a.description : b.description,
      language: pick(a.language, b.language),
      tags: (a.tags || "").length >= (b.tags || "").length ? a.tags : b.tags,
      publisher: pick(a.publisher, b.publisher),
      pubDate: pick(a.pubDate, b.pubDate),
      isbn: pick(a.isbn, b.isbn),
      coverUrl: a.coverUrl || b.coverUrl,
    };
  }

  function mergeInto(targetKey: string) {
    if (!mergeSource || mergeSource === targetKey) { setMergeSource(null); return; }
    setGroups((prev) => {
      const source = prev.find((g) => g.key === mergeSource);
      const target = prev.find((g) => g.key === targetKey);
      if (!source || !target) return prev;
      // Merge files, keep target metadata (user clicked target = preferred)
      const merged: BookGroup = {
        ...target,
        files: [...target.files, ...source.files],
        hasDuplicateFormat: target.hasDuplicateFormat ||
          target.files.some((tf) => source.files.some((sf) => tf.format === sf.format && tf.status === "ready" && sf.status === "ready")),
        metadata: mergeMeta(target.metadata, source.metadata),
      };
      return prev.filter((g) => g.key !== mergeSource).map((g) => g.key === targetKey ? merged : g);
    });
    setMergeSource(null);
  }

  function cancelAll() {
    for (const g of groups) {
      for (const f of g.files) {
        if (f.tempId) fetch(`/api/uploads/${f.tempId}`, { method: "DELETE" }).catch((err) => console.warn("Upload cleanup failed:", err));
      }
    }
    setGroups([]);
  }

  const readyCount = groups.filter((g) => g.files.some((f) => f.status === "ready")).length;
  const uploading = groups.some((g) => g.files.some((f) => f.status === "uploading"));

  return (
    <div style={{ maxWidth: 700 }}>
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? colors.accent : colors.border}`,
          borderRadius: 12,
          padding: groups.length > 0 ? "24px 32px" : "48px 32px",
          textAlign: "center", cursor: "pointer",
          backgroundColor: dragOver ? "rgba(249, 190, 3, 0.05)" : "transparent",
          transition: "border-color 0.15s, background-color 0.15s, padding 0.2s",
          marginBottom: 24,
        }}
      >
        <div style={{ fontSize: groups.length > 0 ? 20 : 36, marginBottom: groups.length > 0 ? 4 : 12, opacity: 0.4 }}>+</div>
        <div style={{ fontSize: groups.length > 0 ? 14 : 16, color: colors.text, marginBottom: groups.length > 0 ? 0 : 6 }}>
          Перетащите файлы сюда
        </div>
        {groups.length === 0 && <div style={{ fontSize: 13, color: colors.textDim }}>FB2, EPUB, PDF или ZIP-архив</div>}
        <input ref={inputRef} type="file" multiple accept=".fb2,.epub,.pdf,.zip" style={{ display: "none" }}
          onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ""; }} />
      </div>

      {/* Book groups */}
      {groups.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {groups.map((g) => {
            const isSource = mergeSource === g.key;
            const isTarget = mergeSource && mergeSource !== g.key;
            return (
            <div
              key={g.key}
              onClick={() => isTarget ? mergeInto(g.key) : undefined}
              style={{
                border: `1px solid ${isSource ? "rgba(249, 190, 3, 0.6)"
                  : isTarget ? "rgba(249, 190, 3, 0.4)"
                  : g.duplicate ? "rgba(249, 190, 3, 0.4)"
                  : g.hasDuplicateFormat ? "rgba(239, 68, 68, 0.4)" : colors.border}`,
                borderRadius: 8, padding: 16,
                backgroundColor: isSource ? "rgba(249, 190, 3, 0.04)" : isTarget ? "rgba(249, 190, 3, 0.02)" : "rgba(255, 255, 255, 0.02)",
                borderStyle: isTarget ? "dashed" : "solid",
                cursor: isTarget ? "pointer" : "default",
                transition: "all 0.15s",
              }}
            >
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 4 }}>
                {isSource ? (
                  <button onClick={(e) => { e.stopPropagation(); setMergeSource(null); }}
                    style={{ padding: "3px 10px", fontSize: 12, fontFamily: "inherit", borderRadius: 4, border: `1px solid rgba(255,255,255,0.15)`, background: "rgba(255,255,255,0.05)", color: colors.textSecondary, cursor: "pointer" }}>
                    Отмена
                  </button>
                ) : isTarget ? (
                  <span style={{ fontSize: 12, color: colors.accent }}>Нажмите для объединения</span>
                ) : (
                  <>
                    {groups.length > 1 && (
                      <button onClick={(e) => { e.stopPropagation(); setMergeSource(g.key); }}
                        style={{ padding: "3px 10px", fontSize: 12, fontFamily: "inherit", borderRadius: 4, border: `1px solid rgba(249, 190, 3, 0.3)`, background: "rgba(249, 190, 3, 0.08)", color: colors.accent, cursor: "pointer" }}>
                        ⊕ Объединить
                      </button>
                    )}
                    <button onClick={() => removeGroup(g.key)} style={{ background: "none", border: "none", color: colors.textDim, cursor: "pointer", fontSize: 16, padding: 4 }}>✕</button>
                  </>
                )}
              </div>

              {isSource && (
                <div style={{ padding: "8px 12px", borderRadius: 6, background: "rgba(249, 190, 3, 0.08)", border: "1px solid rgba(249, 190, 3, 0.2)", fontSize: 13, color: colors.accent, marginBottom: 12 }}>
                  Выберите карточку для объединения ↓
                </div>
              )}

              {/* Files list */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                {g.files.map((f) => (
                  <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 4, backgroundColor: "rgba(255, 255, 255, 0.06)" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: colors.accent }}>{f.format}</span>
                    <span style={{ fontSize: 12, color: colors.textDim }}>{f.size}</span>
                    {f.status === "uploading" && (
                      f.progress >= 99 ? (
                        <span style={{ fontSize: 11, color: colors.textDim, display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                          <span style={{
                            width: 10,
                            height: 10,
                            border: `1.5px solid ${colors.border}`,
                            borderTopColor: colors.accent,
                            borderRadius: "50%",
                            display: "inline-block",
                            animation: "spin 0.8s linear infinite",
                          }} />
                          обработка…
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: colors.textDim }}>{f.progress}%</span>
                      )
                    )}
                    {f.status === "error" && <span style={{ fontSize: 11, color: "#ef4444" }}>{f.error}</span>}
                    {g.files.length > 1 && (
                      <button onClick={() => removeFile(f.id)} style={{ background: "none", border: "none", color: colors.textDim, cursor: "pointer", fontSize: 12, padding: 0, marginLeft: 2 }}>✕</button>
                    )}
                  </div>
                ))}
              </div>

              {/* Duplicate format warning */}
              {g.hasDuplicateFormat && (
                <div style={{ padding: "8px 12px", borderRadius: 6, backgroundColor: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.2)", fontSize: 13, color: "#ef4444", marginBottom: 8 }}>
                  Одинаковый формат — дубликат будет пропущен
                </div>
              )}

              {/* DB duplicate — user chooses action */}
              {g.duplicate && (
                <div style={{ padding: "8px 12px", borderRadius: 6, backgroundColor: "rgba(249, 190, 3, 0.08)", border: "1px solid rgba(249, 190, 3, 0.2)", fontSize: 13, color: colors.accent, marginBottom: 8 }}>
                  <div style={{ marginBottom: 6 }}>Похожая книга: {g.duplicate.title} ({g.duplicate.authors})</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      style={{ padding: "4px 10px", fontSize: 12, borderRadius: 4, border: "1px solid " + colors.accent, background: g.duplicateAction === "add-format" ? colors.accent : "transparent", color: g.duplicateAction === "add-format" ? "#fff" : colors.accent, cursor: "pointer" }}
                      onClick={() => setGroups((prev) => prev.map((gg) => gg.key === g.key ? { ...gg, duplicateAction: "add-format" } : gg))}
                    >
                      Добавить как формат
                    </button>
                    <button
                      style={{ padding: "4px 10px", fontSize: 12, borderRadius: 4, border: "1px solid " + colors.accent, background: g.duplicateAction === "new-book" ? colors.accent : "transparent", color: g.duplicateAction === "new-book" ? "#fff" : colors.accent, cursor: "pointer" }}
                      onClick={() => setGroups((prev) => prev.map((gg) => gg.key === g.key ? { ...gg, duplicateAction: "new-book" } : gg))}
                    >
                      Сохранить как отдельную
                    </button>
                  </div>
                </div>
              )}

              {/* Metadata + cover */}
              {g.metadata && g.files.some((f) => f.status === "ready") && (
                <div style={{ display: "flex", gap: 16 }}>
                  {g.metadata.coverUrl && (
                    <img src={g.metadata.coverUrl} alt="" style={{ width: 60, height: 90, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} />
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: "4px 12px", fontSize: 13, alignContent: "start" }}>
                    <span style={{ color: colors.textDim }}>Название</span>
                    <span style={{ color: colors.text }}>{g.metadata.title || "—"}</span>
                    <span style={{ color: colors.textDim }}>Авторы</span>
                    <span style={{ color: colors.textSecondary }}>{g.metadata.authors || "—"}</span>
                    {g.metadata.series && <>
                      <span style={{ color: colors.textDim }}>Серия</span>
                      <span style={{ color: colors.textSecondary }}>{g.metadata.series} {g.metadata.seriesNumber && `#${g.metadata.seriesNumber}`}</span>
                    </>}
                    <span style={{ color: colors.textDim }}>Язык</span>
                    <span style={{ color: colors.textSecondary }}>{g.metadata.language || "—"}</span>
                    <span style={{ color: colors.textDim }}>Жанры</span>
                    <span style={{ color: colors.textSecondary }}>{g.metadata.tags || "—"}</span>
                  </div>
                </div>
              )}
            </div>
          );
          })}

          {/* Buttons */}
          {!saved && (
            <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
              <button
                onClick={saveAll}
                disabled={readyCount === 0 || uploading || saving || groups.some((g) => g.duplicate && !g.duplicateAction)}
                style={{
                  padding: "10px 28px", fontSize: 14, fontFamily: "inherit", borderRadius: 6,
                  border: "none", backgroundColor: readyCount > 0 && !uploading ? colors.accent : colors.border,
                  color: readyCount > 0 && !uploading ? colors.sidebar : colors.textDim,
                  cursor: readyCount > 0 && !uploading && !saving ? "pointer" : "default",
                  fontWeight: 600, opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? "Сохранение..." : `Сохранить всё (${readyCount})`}
              </button>
              <button
                onClick={cancelAll}
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
          )}

          {saved && (
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 8 }}>
              <span style={{ fontSize: 14, color: colors.success }}>Сохранено!</span>
              <button onClick={() => navigate("/?fresh=1")} style={{
                padding: "8px 20px", fontSize: 13, fontFamily: "inherit", borderRadius: 6,
                border: `1px solid ${colors.border}`, backgroundColor: "transparent",
                color: colors.textSecondary, cursor: "pointer",
              }}>В каталог</button>
              <button onClick={() => { setGroups([]); setSaved(false); }} style={{
                padding: "8px 20px", fontSize: 13, fontFamily: "inherit", borderRadius: 6,
                border: `1px solid ${colors.border}`, backgroundColor: "transparent",
                color: colors.textSecondary, cursor: "pointer",
              }}>Загрузить ещё</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
