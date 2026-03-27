import { useState, useRef, useEffect } from "react";
import { colors } from "../theme";

export interface ComboboxOption {
  value: string;
  hint?: string;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  backgroundColor: "rgba(255, 255, 255, 0.06)",
  border: `1px solid ${colors.border}`,
  borderRadius: 6,
  padding: "8px 12px",
  fontSize: 14,
  color: colors.text,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

export default function Combobox({
  value,
  onChange,
  onSelect,
  options,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const q = value.toLowerCase();
  const filtered = options.filter((o) => o.value.toLowerCase().includes(q));

  useEffect(() => {
    setHighlighted(-1);
  }, [value, open]);

  useEffect(() => {
    if (highlighted >= 0 && listRef.current) {
      const el = listRef.current.children[highlighted] as HTMLElement;
      if (el) el.scrollIntoView({ block: "nearest" });
    }
  }, [highlighted]);

  function doSelect(val: string) {
    if (onSelect) {
      onSelect(val);
    } else {
      onChange(val);
    }
    setOpen(false);
    inputRef.current?.blur();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open && e.key === "ArrowDown") {
      setOpen(true);
      return;
    }

    if (!open) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlighted >= 0 && highlighted < filtered.length) {
        doSelect(filtered[highlighted].value);
      } else if (value.trim()) {
        doSelect(value.trim());
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <input
        ref={inputRef}
        style={inputStyle}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
      />
      {open && filtered.length > 0 && (
        <div
          ref={listRef}
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 50,
            backgroundColor: colors.sidebar,
            border: `1px solid ${colors.border}`,
            borderRadius: 6,
            maxHeight: 200,
            overflow: "auto",
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}
        >
          {filtered.map((o, i) => (
            <div
              key={o.value}
              onMouseDown={() => doSelect(o.value)}
              onMouseEnter={() => setHighlighted(i)}
              style={{
                padding: "8px 12px",
                fontSize: 13,
                color: i === highlighted ? colors.text : colors.textSecondary,
                backgroundColor: i === highlighted ? "rgba(255, 255, 255, 0.06)" : "transparent",
                cursor: "pointer",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>{o.value}</span>
              {o.hint && <span style={{ fontSize: 11, color: colors.textDim }}>{o.hint}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
