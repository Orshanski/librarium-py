import { useState, useEffect } from "react";
import { colors, fonts } from "../theme";
import ConfirmDialog from "./confirm-dialog";
import { listSeries, renameSeries, mergeSeries, deleteSeries } from "../api/endpoints/series";
import { listAuthors, renameAuthor, mergeAuthor, deleteAuthor } from "../api/endpoints/authors";
import { listTagOptions, renameTag, mergeTag, deleteTag } from "../api/endpoints/tags";
import { domainEvents } from "@/domain/events";

interface EntityAdminPanelProps {
  entityType: "author" | "series" | "tag";
  entityId: number;
  currentName: string;
  bookCount: number;
  onRenamed: (newName: string) => void;
  onMerged: () => void;
  onDeleted: () => void;
}

const panelStyle: React.CSSProperties = {
  maxWidth: 520,
  background: "#252840",
  border: "1px solid rgba(255, 255, 255, 0.06)",
  borderRadius: 8,
  padding: 20,
  boxShadow: "0 4px 24px rgba(0, 0, 0, 0.2)",
};

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "1.2px",
  color: colors.textDim,
  marginBottom: 6,
  display: "block",
  fontFamily: fonts.body,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#1e2035",
  border: `1px solid ${colors.border}`,
  borderRadius: 5,
  padding: "8px 12px",
  fontSize: 13,
  color: colors.text,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: fonts.body,
};

const saveBtnStyle: React.CSSProperties = {
  background: colors.accent,
  color: "#1a1a2e",
  fontWeight: 600,
  border: "none",
  borderRadius: 5,
  padding: "8px 16px",
  fontSize: 13,
  cursor: "pointer",
  fontFamily: fonts.body,
  whiteSpace: "nowrap",
};

const mergeBtnStyle: React.CSSProperties = {
  background: colors.danger,
  color: "#fff",
  border: "none",
  borderRadius: 5,
  padding: "6px 12px",
  fontSize: 12,
  cursor: "pointer",
  fontFamily: fonts.body,
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const deleteBtnBase: React.CSSProperties = {
  background: "transparent",
  border: `1px solid ${colors.danger}`,
  color: colors.danger,
  borderRadius: 5,
  padding: "8px 16px",
  fontSize: 13,
  fontWeight: 600,
  fontFamily: fonts.body,
  whiteSpace: "nowrap",
};

const resultRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  background: "#1e2035",
  border: `1px solid ${colors.border}`,
  borderRadius: 5,
  padding: "8px 12px",
  marginTop: 6,
};

export default function EntityAdminPanel({
  entityType,
  entityId,
  currentName,
  bookCount,
  onRenamed,
  onMerged,
  onDeleted,
}: EntityAdminPanelProps) {
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [merging, setMerging] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ message: string; label: string; action: () => void } | null>(null);

  const label = entityType === "author" ? "автора" : entityType === "series" ? "серию" : "жанр";

  const [allEntities, setAllEntities] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    if (entityType === "series") {
      listSeries()
        .then((data) => {
          setAllEntities(data.series.filter((e) => e.id !== entityId));
        })
        .catch((err) => console.warn("Failed to fetch series:", err));
    } else if (entityType === "tag") {
      listTagOptions()
        .then((data) => {
          setAllEntities(data.tags.filter((e) => e.id !== entityId));
        })
        .catch((err) => console.warn("Failed to fetch tags:", err));
    } else {
      listAuthors()
        .then((data) => {
          setAllEntities(data.authors.filter((e) => e.id !== entityId));
        })
        .catch((err) => console.warn("Failed to fetch authors:", err));
    }
  }, [entityType, entityId]);

  const filtered = searchQuery.length >= 2
    ? allEntities.filter((e) => e.name.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 10)
    : [];

  const handleRename = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === currentName) return;
    setSaving(true);
    try {
      if (entityType === "series") {
        await renameSeries(entityId, trimmed);
        domainEvents.publish("seriesRenamed", { seriesId: entityId, name: trimmed });
      } else if (entityType === "tag") {
        await renameTag(entityId, trimmed);
        domainEvents.publish("tagRenamed", { tagId: entityId, name: trimmed });
      } else {
        await renameAuthor(entityId, trimmed);
        domainEvents.publish("authorRenamed", { authorId: entityId, name: trimmed });
      }
      onRenamed(trimmed);
    } catch (err) {
      console.warn("Failed to rename:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleMerge = (source: { id: number; name: string }) => {
    setConfirmAction({
      message: `Все книги "${source.name}" будут перенесены к "${currentName}". Дубликат будет удалён.`,
      label: "Присоединить",
      action: async () => {
        setConfirmAction(null);
        setMerging(true);
        try {
          if (entityType === "series") {
            await mergeSeries(entityId, source.id);
            domainEvents.publish("seriesMerged", { targetId: entityId, sourceId: source.id });
          } else if (entityType === "tag") {
            await mergeTag(entityId, source.id);
            domainEvents.publish("tagMerged", { targetId: entityId, sourceId: source.id });
          } else {
            await mergeAuthor(entityId, source.id);
            domainEvents.publish("authorMerged", { targetId: entityId, sourceId: source.id });
          }
          onMerged();
        } catch (err) {
          console.warn("Failed to merge:", err);
        } finally {
          setMerging(false);
        }
      },
    });
  };

  const handleDelete = () => {
    if (bookCount > 0) return;
    setConfirmAction({
      message: `Удалить ${label} "${currentName}"? Это действие необратимо.`,
      label: "Удалить",
      action: async () => {
        setConfirmAction(null);
        setDeleting(true);
        try {
          if (entityType === "series") {
            await deleteSeries(entityId);
            domainEvents.publish("seriesDeleted", { seriesId: entityId });
          } else if (entityType === "tag") {
            await deleteTag(entityId);
            domainEvents.publish("tagDeleted", { tagId: entityId });
          } else {
            await deleteAuthor(entityId);
            domainEvents.publish("authorDeleted", { authorId: entityId });
          }
          onDeleted();
        } catch (err) {
          console.warn("Failed to delete:", err);
        } finally {
          setDeleting(false);
        }
      },
    });
  };

  const canDelete = bookCount === 0;

  return (
    <div style={panelStyle}>
      {/* Rename section */}
      <div style={{ marginBottom: 20 }}>
        <span style={labelStyle}>Переименовать</span>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            style={inputStyle}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRename();
            }}
          />
          <button
            style={{
              ...saveBtnStyle,
              opacity: saving ? 0.5 : 1,
            }}
            disabled={saving || name.trim() === currentName}
            onClick={handleRename}
          >
            {saving ? "..." : "Сохранить"}
          </button>
        </div>
      </div>

      {/* Merge section */}
      <div style={{ marginBottom: 20 }}>
        <span style={labelStyle}>Объединить дубликаты</span>
        <input
          style={inputStyle}
          placeholder={`Найти ${label}-дубликат...`}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {filtered.map((item) => (
          <div key={item.id} style={resultRowStyle}>
            <span style={{ fontSize: 13, color: colors.text, fontFamily: fonts.body }}>
              {item.name}
            </span>
            <button
              style={mergeBtnStyle}
              disabled={merging}
              onClick={() => handleMerge(item)}
            >
              Присоединить
            </button>
          </div>
        ))}
      </div>

      {/* Delete section */}
      <div
        style={{
          borderTop: `1px solid ${colors.border}`,
          paddingTop: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <span style={{ fontSize: 12, color: colors.textDim, fontFamily: fonts.body }}>
          Удалить {label} (только если нет книг)
        </span>
        <button
          style={{
            ...deleteBtnBase,
            cursor: canDelete && !deleting ? "pointer" : "not-allowed",
          }}
          disabled={!canDelete || deleting}
          onClick={handleDelete}
        >
          {deleting ? "..." : "Удалить"}
        </button>
      </div>
      {confirmAction && (
        <ConfirmDialog
          message={confirmAction.message}
          confirmLabel={confirmAction.label}
          onConfirm={confirmAction.action}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}
