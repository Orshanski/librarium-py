import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { colors } from "../../theme";
import { FilterConfig, FilterOption } from "../filter-bar";

export default function MobileFilterBar({
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
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    if (highlighted < 0 || !listRef.current) return;
    const el = listRef.current.children[highlighted] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [highlighted]);

  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Node;
      const trigger = openKey ? triggerRefs.current[openKey] : null;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        (!trigger || !trigger.contains(target))
      ) {
        setOpenKey(null);
        setSearch("");
        setHighlighted(-1);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [openKey]);

  useEffect(() => {
    if (!openKey) {
      setDropdownStyle(null);
      return;
    }

    function updatePosition() {
      if (!openKey) return;
      const trigger = triggerRefs.current[openKey];
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const width = Math.min(window.innerWidth - 16, 280);
      const maxLeft = Math.max(8, window.innerWidth - width - 8);
      setDropdownStyle({
        position: "fixed",
        top: rect.bottom + 6,
        left: Math.min(Math.max(8, rect.left), maxLeft),
        width,
        maxHeight: 260,
        zIndex: 200,
        display: "flex",
        flexDirection: "column",
        borderRadius: 8,
        backgroundColor: colors.sidebar,
        border: `1px solid ${colors.border}`,
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [openKey]);

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
    if (onClearAll) onClearAll();
    else filters.forEach((filter) => onSelectionChange(filter.key, []));
    setOpenKey(null);
  }

  function getLabel(filter: FilterConfig, value: string) {
    const option = filter.options.find((item) => optVal(item) === value);
    return option?.name || value;
  }

  function getChipLabel(filter: FilterConfig) {
    const values = selected[filter.key] || [];
    if (values.length === 0) return filter.label;
    if (values.length === 1) return getLabel(filter, values[0]);
    if (values.length === 2) return values.map((value) => getLabel(filter, value)).join(", ");
    return `${values.length} выбрано`;
  }

  const hasAnySelection = filters.some((filter) => (selected[filter.key] || []).length > 0);

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {filters.map((filter) => {
          const isOpen = openKey === filter.key;
          const isActive = (selected[filter.key] || []).length > 0;

          return (
            <button
              key={filter.key}
              ref={(node) => {
                triggerRefs.current[filter.key] = node;
              }}
              onClick={() => {
                setOpenKey(isOpen ? null : filter.key);
                setSearch("");
                setHighlighted(-1);
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "7px 12px",
                fontSize: 13,
                fontFamily: "inherit",
                color: isActive ? colors.accent : colors.textSecondary,
                backgroundColor: isActive ? "rgba(249, 190, 3, 0.12)" : "rgba(255, 255, 255, 0.06)",
                border: `1px solid ${isActive ? "rgba(249, 190, 3, 0.3)" : colors.border}`,
                borderRadius: 16,
                cursor: "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {getChipLabel(filter)}
              {isActive ? (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    clearFilter(filter.key);
                  }}
                  style={{ fontSize: 12, cursor: "pointer" }}
                >
                  ✕
                </span>
              ) : (
                <span style={{ fontSize: 10 }}>▾</span>
              )}
            </button>
          );
        })}

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
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            Сбросить все
          </button>
        )}
      </div>

      {openKey && dropdownStyle && createPortal(
        <div ref={dropdownRef} style={dropdownStyle}>
          <div style={{ padding: 8 }}>
            <input
              type="text"
              placeholder="Поиск..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setHighlighted(-1);
              }}
              onKeyDown={(e) => {
                const filter = filters.find((item) => item.key === openKey);
                if (!filter) return;
                const options = sortOptions(filter.options, selected[filter.key] || [], search);
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setHighlighted((prev) => Math.min(prev + 1, options.length - 1));
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setHighlighted((prev) => Math.max(prev - 1, 0));
                }
                if (e.key === "Enter" && highlighted >= 0 && highlighted < options.length) {
                  e.preventDefault();
                  toggleOption(filter.key, optVal(options[highlighted]));
                  setHighlighted(-1);
                }
                if (e.key === "Escape") {
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
          <div ref={listRef} style={{ overflow: "auto", flex: 1, padding: "0 4px 8px" }}>
            {filters
              .filter((filter) => filter.key === openKey)
              .flatMap((filter) =>
                sortOptions(filter.options, selected[filter.key] || [], search).map((option, index) => {
                  const val = optVal(option);
                  const isChecked = (selected[filter.key] || []).includes(val);
                  const isHighlighted = index === highlighted;
                  return (
                    <label
                      key={`${filter.key}-${val}`}
                      onMouseEnter={() => setHighlighted(index)}
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
                        onChange={() => toggleOption(filter.key, val)}
                        style={{ accentColor: colors.accent }}
                      />
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {option.name}
                      </span>
                      {option.count != null && <span style={{ fontSize: 11, color: colors.textDim }}>{option.count}</span>}
                    </label>
                  );
                }),
              )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function optVal(opt: FilterOption): string {
  return opt.id != null ? String(opt.id) : opt.name;
}

function sortOptions(options: FilterOption[], selected: string[], search: string) {
  const q = search.toLowerCase();
  const filtered = q ? options.filter((option) => option.name.toLowerCase().includes(q)) : options;
  return [...filtered].sort((a, b) => {
    const aSelected = selected.includes(optVal(a)) ? 0 : 1;
    const bSelected = selected.includes(optVal(b)) ? 0 : 1;
    if (aSelected !== bSelected) return aSelected - bSelected;
    return 0;
  });
}
