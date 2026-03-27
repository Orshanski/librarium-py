import { useState, useRef, useEffect } from "react";
import { colors } from "../theme";

export interface FilterOption {
  value: string;
  count: number;
  label?: string;
}

export interface FilterConfig {
  key: string;
  label: string;
  options: FilterOption[];
}

export default function FilterBar({
  filters,
  selected,
  onSelectionChange,
  onClearAll,
}: {
  filters: FilterConfig[];
  selected: Record<string, string[]>;
  onSelectionChange: (key: string, values: string[]) => void;
  onClearAll?: () => void;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [highlighted, setHighlighted] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenKey(null);
        setSearch("");
        setHighlighted(-1);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Scroll highlighted into view
  useEffect(() => {
    if (highlighted >= 0 && listRef.current) {
      const el = listRef.current.children[highlighted] as HTMLElement;
      if (el) el.scrollIntoView({ block: "nearest" });
    }
  }, [highlighted]);

  function toggleOption(key: string, value: string) {
    const current = selected[key] || [];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    onSelectionChange(key, next);
  }

  function clearFilter(key: string) {
    onSelectionChange(key, []);
    setOpenKey(null);
  }

  function clearAll() {
    if (onClearAll) {
      onClearAll();
    } else {
      filters.forEach((f) => onSelectionChange(f.key, []));
    }
    setOpenKey(null);
  }

  const hasAnySelection = filters.some((f) => (selected[f.key] || []).length > 0);

  function getLabel(f: FilterConfig, val: string): string {
    const opt = f.options.find((o) => o.value === val);
    return opt?.label || opt?.value || val;
  }

  function chipLabel(f: FilterConfig): string {
    const sel = selected[f.key] || [];
    if (sel.length === 0) return f.label;
    if (sel.length === 1) return getLabel(f, sel[0]);
    if (sel.length === 2) return sel.map((v) => getLabel(f, v)).join(", ");
    return `${sel.length} выбрано`;
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
        position: "relative",
      }}
    >
      {filters.map((f) => {
        const isActive = (selected[f.key] || []).length > 0;
        const isOpen = openKey === f.key;

        return (
          <div key={f.key} style={{ position: "relative" }} ref={isOpen ? dropdownRef : undefined}>
            <button
              onClick={() => {
                setOpenKey(isOpen ? null : f.key);
                setSearch("");
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "5px 12px",
                fontSize: 13,
                fontFamily: "inherit",
                color: isActive ? colors.accent : colors.textSecondary,
                backgroundColor: isActive ? "rgba(249, 190, 3, 0.12)" : "rgba(255, 255, 255, 0.06)",
                border: `1px solid ${isActive ? "rgba(249, 190, 3, 0.3)" : colors.border}`,
                borderRadius: 16,
                cursor: "pointer",
                transition: "background 0.15s, border-color 0.15s",
                whiteSpace: "nowrap",
              }}
            >
              {chipLabel(f)}
              {isActive ? (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    clearFilter(f.key);
                  }}
                  style={{ fontSize: 12, marginLeft: 2, cursor: "pointer" }}
                >
                  ✕
                </span>
              ) : (
                <span style={{ fontSize: 10, marginLeft: 2 }}>▾</span>
              )}
            </button>

            {/* Dropdown */}
            {isOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  left: 0,
                  zIndex: 100,
                  backgroundColor: colors.sidebar,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 8,
                  width: 240,
                  maxHeight: 320,
                  display: "flex",
                  flexDirection: "column",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                }}
              >
                {/* Search */}
                <div style={{ padding: 8 }}>
                  <input
                    type="text"
                    placeholder="Поиск..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setHighlighted(-1); }}
                    onKeyDown={(e) => {
                      const opts = sortedOptions(f.options, selected[f.key] || [], search);
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setHighlighted((h) => Math.min(h + 1, opts.length - 1));
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setHighlighted((h) => Math.max(h - 1, 0));
                      } else if (e.key === "Enter" && highlighted >= 0 && highlighted < opts.length) {
                        e.preventDefault();
                        toggleOption(f.key, opts[highlighted].value);
                        setHighlighted(-1);
                      } else if (e.key === "Escape") {
                        setOpenKey(null);
                        setSearch("");
                        setHighlighted(-1);
                      }
                    }}
                    autoFocus
                    style={{
                      width: "100%",
                      backgroundColor: colors.card,
                      border: "none",
                      borderRadius: 4,
                      padding: "6px 10px",
                      fontSize: 13,
                      color: colors.text,
                      outline: "none",
                      boxSizing: "border-box",
                      fontFamily: "inherit",
                    }}
                  />
                </div>

                {/* Options */}
                <div ref={listRef} style={{ overflow: "auto", flex: 1, padding: "0 4px 8px" }}>
                  {sortedOptions(f.options, selected[f.key] || [], search).map((opt, idx) => {
                    const isChecked = (selected[f.key] || []).includes(opt.value);
                    const isHighlighted = idx === highlighted;
                    return (
                      <label
                        key={opt.value}
                        onMouseEnter={() => setHighlighted(idx)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "5px 8px",
                          borderRadius: 4,
                          cursor: "pointer",
                          fontSize: 13,
                          color: isChecked ? colors.text : colors.textSecondary,
                          backgroundColor: isHighlighted ? "rgba(255,255,255,0.06)" : "transparent",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleOption(f.key, opt.value)}
                          style={{ accentColor: colors.accent }}
                        />
                        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {opt.label || opt.value}
                        </span>
                        <span style={{ fontSize: 11, color: colors.textDim }}>{opt.count}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Reset all */}
      {hasAnySelection && (
        <button
          onClick={clearAll}
          style={{
            background: "none",
            border: "none",
            fontSize: 12,
            color: colors.textDim,
            cursor: "pointer",
            fontFamily: "inherit",
            padding: "5px 8px",
          }}
        >
          Сбросить все
        </button>
      )}
    </div>
  );
}

function sortedOptions(options: FilterOption[], selected: string[], search: string): FilterOption[] {
  const q = search.toLowerCase();
  const filtered = q ? options.filter((o) => (o.label || o.value).toLowerCase().includes(q)) : options;
  return [...filtered].sort((a, b) => {
    const aSelected = selected.includes(a.value) ? 0 : 1;
    const bSelected = selected.includes(b.value) ? 0 : 1;
    if (aSelected !== bSelected) return aSelected - bSelected;
    return b.count - a.count;
  });
}
