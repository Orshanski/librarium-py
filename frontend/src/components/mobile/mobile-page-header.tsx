import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { colors, fonts, layout } from "../../theme";
import { useMobileLayout } from "./layout-context";
import { FilterConfig } from "../filter-bar";
import { SortOption } from "../sort-select";
import MobileFilterBar from "./mobile-filter-bar";

export default function MobilePageHeader({
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
  title: React.ReactNode;
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
  const { toggleDrawer } = useMobileLayout();
  const headerRef = useRef<HTMLDivElement | null>(null);
  const hasToolbar =
    (filters && filters.length > 0) || sortOptions || infoSlot || actionSlot;

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
  }, [actionSlot, breadcrumb?.href, breadcrumb?.label, hasToolbar, infoSlot, sortValue, title]);

  return (
    <div
      ref={headerRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 30,
        backgroundColor: colors.sidebar,
        borderBottom: `1px solid ${colors.border}`,
      }}
    >
      <div
        style={{
          padding: `12px ${layout.mobileContentPaddingX}px`,
          minHeight: layout.mobileHeaderMinHeight,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <button
            onClick={toggleDrawer}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              width: 28,
              height: 28,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginTop: 1,
            }}
            aria-label="Открыть меню"
          >
            <span
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                gap: 4,
                width: 18,
              }}
            >
              <span style={{ height: 2, borderRadius: 2, backgroundColor: colors.textSecondary, display: "block" }} />
              <span style={{ height: 2, borderRadius: 2, backgroundColor: colors.textSecondary, display: "block" }} />
              <span style={{ height: 2, borderRadius: 2, backgroundColor: colors.textSecondary, display: "block" }} />
            </span>
          </button>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 28 }}>
              <h1
                style={{
                  fontFamily: fonts.display,
                  fontSize: 18,
                  fontWeight: 600,
                  margin: 0,
                  color: colors.text,
                  lineHeight: 1,
                  minWidth: 0,
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
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
              {actionSlot}
            </div>
            {infoSlot && (
              <div style={{ marginTop: 6, fontSize: 12, color: colors.textDim }}>
                {infoSlot}
              </div>
            )}
          </div>
        </div>
      </div>

      {hasToolbar && (
        <div style={{ padding: `0 ${layout.mobileContentPaddingX}px 12px` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, overflowX: "auto", overflowY: "visible", scrollbarWidth: "none" }}>
            {filters && selected && onSelectionChange && (
              <MobileFilterBar
                filters={filters}
                selected={selected}
                onSelectionChange={onSelectionChange}
                onClearAll={onClearAll}
              />
            )}

            {sortOptions && sortValue !== undefined && onSortChange && (
              <select
                value={sortValue}
                onChange={(e) => onSortChange(e.target.value)}
                style={{
                  height: 32,
                  backgroundColor: "rgba(255, 255, 255, 0.06)",
                  border: `1px solid ${colors.border}`,
                  borderRadius: 16,
                  padding: "0 28px 0 12px",
                  fontSize: 13,
                  color: colors.textSecondary,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  outline: "none",
                  appearance: "none",
                  WebkitAppearance: "none",
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23888'/%3E%3C/svg%3E")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 10px center",
                  flexShrink: 0,
                }}
              >
                {sortOptions.map((option) => (
                  <option key={option.key} value={option.key} style={{ backgroundColor: "#16162a", color: "#ccc" }}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
