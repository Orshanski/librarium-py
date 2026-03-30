import { useState, useEffect } from "react";
import { colors, fonts } from "../theme";
import Combobox, { ComboboxOption } from "./combobox";
import ConfirmDialog from "./confirm-dialog";

interface TagAdminPanelProps {
  tagId: number;
  currentName: string;
  onMapped: (targetId: number, newName: string) => void;
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

const hintStyle: React.CSSProperties = {
  fontSize: 11,
  color: colors.textDim,
  marginTop: 6,
};

export default function TagAdminPanel({ tagId, currentName, onMapped }: TagAdminPanelProps) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [allTags, setAllTags] = useState<ComboboxOption[]>([]);
  const [confirmAction, setConfirmAction] = useState<{
    message: string;
    action: () => void;
  } | null>(null);

  useEffect(() => {
    fetch("/api/options", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        const tags = (data.tags || [])
          .filter((t: any) => t.id !== tagId)
          .map((t: any) => ({
            value: t.name,
            hint: `${t.book_count} книг`,
          }));
        setAllTags(tags);
      })
      .catch(() => {});
  }, [tagId]);

  const isExisting = allTags.some(
    (t) => t.value.toLowerCase() === value.trim().toLowerCase()
  );
  const trimmed = value.trim();
  const canSubmit = trimmed.length > 0 && trimmed !== currentName && !saving;

  const doMap = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/tags/${tagId}/map`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.ok) {
        const data = await res.json();
        onMapped(data.targetId, trimmed);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    if (isExisting) {
      setConfirmAction({
        message: `Все книги будут отнесены к жанру «${trimmed}».\n\nПри следующем импорте ${currentName} автоматически станет «${trimmed}».`,
        action: () => {
          setConfirmAction(null);
          doMap();
        },
      });
    } else {
      doMap();
    }
  };

  return (
    <div style={panelStyle}>
      <span style={labelStyle}>Сопоставить с...</span>
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <Combobox
            value={value}
            onChange={setValue}
            onSelect={(v) => setValue(v)}
            options={allTags}
            placeholder="Введите название жанра..."
          />
        </div>
        <button
          style={{ ...saveBtnStyle, opacity: canSubmit ? 1 : 0.4 }}
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          {saving ? "..." : "Сопоставить"}
        </button>
      </div>
      <div style={hintStyle}>Выберите существующий жанр или введите новое название</div>
      {confirmAction && (
        <ConfirmDialog
          message={confirmAction.message}
          confirmLabel="Сопоставить"
          onConfirm={confirmAction.action}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}
