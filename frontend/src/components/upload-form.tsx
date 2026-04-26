import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { colors } from "../theme";
import { useUploadGroups } from "./upload-form.hook";

export default function UploadForm() {
  const {
    groups, saving, saved, mergeSource,
    handleFiles, removeFile, removeGroup, saveAll,
    setMergeSource, mergeInto, setDuplicateAction,
    cancelAll, resetSaved,
  } = useUploadGroups();

  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

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
              data-testid="upload-group"
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
                  <div style={{ marginBottom: 6 }}>Похожая книга: {g.duplicate.title} ({g.duplicate.authors.map((a) => a.name).join(", ")})</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      style={{ padding: "4px 10px", fontSize: 12, borderRadius: 4, border: "1px solid " + colors.accent, background: g.duplicateAction === "add-format" ? colors.accent : "transparent", color: g.duplicateAction === "add-format" ? "#fff" : colors.accent, cursor: "pointer" }}
                      onClick={() => setDuplicateAction(g.key, "add-format")}
                    >
                      Добавить как формат
                    </button>
                    <button
                      style={{ padding: "4px 10px", fontSize: 12, borderRadius: 4, border: "1px solid " + colors.accent, background: g.duplicateAction === "new-book" ? colors.accent : "transparent", color: g.duplicateAction === "new-book" ? "#fff" : colors.accent, cursor: "pointer" }}
                      onClick={() => setDuplicateAction(g.key, "new-book")}
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
              <button onClick={() => navigate("/")} style={{
                padding: "8px 20px", fontSize: 13, fontFamily: "inherit", borderRadius: 6,
                border: `1px solid ${colors.border}`, backgroundColor: "transparent",
                color: colors.textSecondary, cursor: "pointer",
              }}>В каталог</button>
              <button onClick={resetSaved} style={{
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
