import { useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth";
import { colors, fonts, layout } from "../../theme";
import FilterBar, { FilterConfig } from "../filter-bar";
import SortSelect, { SortOption } from "../sort-select";
import { PageHeaderProps } from "../page-header.types";

export default function DesktopPageHeader({
  title,
  titleSlot,
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
}: PageHeaderProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const headerRef = useRef<HTMLDivElement | null>(null);
  const meName = user?.displayName || user?.username || "";

  const hasSecondRow =
    (filters && filters.length > 0) || sortOptions || showUpload || infoSlot || actionSlot;

  useEffect(() => {
    const element = headerRef.current;
    if (!element) return;

    const updateHeight = () => {
      document.documentElement.style.setProperty("--page-header-height", `${element.offsetHeight}px`);
    };

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    window.addEventListener("resize", updateHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateHeight);
      document.documentElement.style.setProperty("--page-header-height", "0px");
    };
  }, []);

  return (
    <div
      ref={headerRef}
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        left: layout.desktopSidebarWidth,
        paddingTop: "var(--sat)",
        paddingRight: "var(--sar)",
        zIndex: 10,
        backgroundColor: colors.sidebar,
        borderBottom: `1px solid ${colors.border}`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: `16px ${layout.desktopContentPaddingX}px`,
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
            <span
              style={{
                display: "inline-flex",
                alignItems: "baseline",
                gap: 8,
                whiteSpace: "nowrap",
              }}
            >
              <a
                onClick={(e) => { e.preventDefault(); navigate(-1); }}
                href={breadcrumb.href}
                style={{
                  color: colors.textDim,
                  textDecoration: "none",
                  fontWeight: 400,
                  cursor: "pointer",
                }}
              >
                {breadcrumb.label}
              </a>
              <span style={{ color: colors.textDim, fontWeight: 400 }}>/</span>
            </span>
          )}
          {title}
          {titleSlot}
        </h1>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <span style={{ fontSize: 13, color: colors.textDim }}>{meName || "..."}</span>
          <div
            style={{
              width: 32,
              height: 32,
              flexShrink: 0,
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
            {(meName || "?")[0].toUpperCase()}
          </div>
        </div>
      </div>

      {hasSecondRow && (
        <div style={{ padding: `0 ${layout.desktopContentPaddingX}px 18px`, display: "flex", alignItems: "center", gap: 8, minHeight: 30 }}>
          {infoSlot && !filters && <div style={{ flex: 1 }}>{infoSlot}</div>}
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
