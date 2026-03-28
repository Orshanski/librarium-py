import { useState, useEffect, useRef, useCallback } from "react";
import { colors, fonts } from "../theme";

interface EntityAdminPanelProps {
  entityType: "author" | "series";
  entityId: number;
  currentName: string;
  bookCount: number;
  onRenamed: (newName: string) => void;
  onMerged: () => void;
  onDeleted: () => void;
}

interface SearchResult {
  id: number;
  name: string;
  book_count: number;
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
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [merging, setMerging] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const endpoint = entityType === "author" ? "authors" : "series";
  const label = entityType === "author" ? "автора" : "серию";
  const labelCap = entityType === "author" ? "Автор" : "Серия";

  const searchEntities = useCallback(
    async (q: string) => {
      if (q.length < 2) {
        setSearchResults([]);
        return;
      }
      setSearching(true);
      try {
        const res = await fetch(
          `/api/${endpoint}?search=${encodeURIComponent(q)}&exclude=${entityId}`,
          { credentials: "include" }
        );
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
        }
      } finally {
        setSearching(false);
      }
    },
    [endpoint, entityId]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchEntities(searchQuery), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, searchEntities]);

  const handleRename = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === currentName) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/${endpoint}/${entityId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.ok) onRenamed(trimmed);
    } finally {
      setSaving(false);
    }
  };

  const handleMerge = async (source: SearchResult) => {
    const msg =
      `Все книги "${source.name}" (${source.book_count}) будут перенесены к "${currentName}". Дубликат будет удалён. Продолжить?`;
    if (!window.confirm(msg)) return;
    setMerging(true);
    try {
      const res = await fetch(`/api/${endpoint}/${entityId}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sourceId: source.id }),
      });
      if (res.ok) onMerged();
    } finally {
      setMerging(false);
    }
  };

  const handleDelete = async () => {
    if (bookCount > 0) return;
    const msg = `Удалить ${label} "${currentName}"? Это действие необратимо.`;
    if (!window.confirm(msg)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/${endpoint}/${entityId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) onDeleted();
    } finally {
      setDeleting(false);
    }
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
              opacity: saving || name.trim() === currentName ? 0.5 : 1,
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
          placeholder={`Найти ${label === "автора" ? "автора" : "серию"}-дубликат...`}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searching && (
          <div style={{ fontSize: 12, color: colors.textDim, marginTop: 6 }}>
            Поиск...
          </div>
        )}
        {searchResults.map((item) => (
          <div key={item.id} style={resultRowStyle}>
            <div>
              <span style={{ fontSize: 13, color: colors.text, fontFamily: fonts.body }}>
                {item.name}
              </span>
              <span style={{ fontSize: 11, color: colors.textDim, marginLeft: 8 }}>
                {item.book_count} кн.
              </span>
            </div>
            <button
              style={{ ...mergeBtnStyle, opacity: merging ? 0.5 : 1 }}
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
            opacity: canDelete && !deleting ? 1 : 0.4,
            cursor: canDelete && !deleting ? "pointer" : "not-allowed",
          }}
          disabled={!canDelete || deleting}
          onClick={handleDelete}
        >
          {deleting ? "..." : "Удалить"}
        </button>
      </div>
    </div>
  );
}
