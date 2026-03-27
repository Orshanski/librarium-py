import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { colors, fonts } from "../theme";
import FilterBar, { FilterConfig } from "./filter-bar";
import SortSelect, { SortOption } from "./sort-select";

export default function PageHeader({
  title,
  filters,
  selected,
  onSelectionChange,
  onClearAll,
  sortOptions,
  sortValue,
  onSortChange,
  showUpload,
  infoSlot,
  breadcrumb,
  actionSlot,
}: {
  title: string;
  filters?: FilterConfig[];
  selected?: Record<string, string[]>;
  onSelectionChange?: (key: string, values: string[]) => void;
  onClearAll?: () => void;
  sortOptions?: SortOption[];
  sortValue?: string;
  onSortChange?: (key: string) => void;
  showUpload?: boolean;
  infoSlot?: React.ReactNode;
  breadcrumb?: { label: string; href: string };
  actionSlot?: React.ReactNode;
}) {
  const [me, setMe] = useState<{ name: string }>({ name: "" });
  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => { if (d.displayName || d.username) setMe({ name: d.displayName || d.username }); }).catch(() => {});
  }, []);

  const hasSecondRow =
    (filters && filters.length > 0) || sortOptions || showUpload || infoSlot || actionSlot;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        left: 220,
        zIndex: 10,
        backgroundColor: colors.sidebar,
        borderBottom: `1px solid ${colors.border}`,
      }}
    >
      {/* Row 1: title + profile */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 32px",
        }}
      >
        <h1
          style={{
            fontFamily: fonts.display,
            fontSize: 28,
            fontWeight: 600,
            margin: 0,
            color: colors.text,
            display: "flex",
            alignItems: "baseline",
            gap: 8,
          }}
        >
          {breadcrumb && (
            <>
              <Link
                to={breadcrumb.href}
                style={{
                  color: colors.textDim,
                  textDecoration: "none",
                  fontWeight: 400,
                }}
              >
                {breadcrumb.label}
              </Link>
              <span style={{ color: colors.textDim, fontWeight: 400 }}>/</span>
            </>
          )}
          {title}
        </h1>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, color: colors.textDim }}>{me.name || "..."}</span>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              backgroundColor: colors.accent,
              color: colors.sidebar,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {(me.name || "?")[0].toUpperCase()}
          </div>
        </div>
      </div>

      {/* Row 2: filters + sort + upload OR info */}
      {hasSecondRow && (
        <div style={{ padding: "0 32px 18px", display: "flex", alignItems: "center", gap: 8, minHeight: 30 }}>
          {infoSlot && !filters && (
            <div style={{ flex: 1 }}>{infoSlot}</div>
          )}
          {filters && selected && onSelectionChange && (
            <div style={{ flex: 1 }}>
              <FilterBar
                filters={filters}
                selected={selected}
                onSelectionChange={onSelectionChange}
                onClearAll={onClearAll}
              />
            </div>
          )}
          {!filters && !infoSlot && <div style={{ flex: 1 }} />}

          {actionSlot}

          {sortOptions && sortValue !== undefined && onSortChange && (
            <SortSelect options={sortOptions} value={sortValue} onChange={onSortChange} />
          )}

          {showUpload && (
            <Link
              to="/upload"
              style={{
                height: 28,
                padding: "0 12px",
                fontSize: 13,
                fontFamily: "inherit",
                borderRadius: 16,
                border: `1px solid ${colors.accent}`,
                backgroundColor: colors.accent,
                color: colors.sidebar,
                textDecoration: "none",
                fontWeight: 600,
                whiteSpace: "nowrap",
                display: "inline-flex",
                alignItems: "center",
                boxSizing: "border-box",
              }}
            >
              Загрузить
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
