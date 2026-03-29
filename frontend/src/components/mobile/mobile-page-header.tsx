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
  const hasToolbar =
    (filters && filters.length > 0) || sortOptions || showUpload || infoSlot || actionSlot;

  return (
    <div
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
        <div style={{ display: "flex", alignItems: breadcrumb ? "flex-start" : "center", gap: 12 }}>
          <button
            onClick={toggleDrawer}
            style={{
              background: "none",
              border: "none",
              color: colors.textSecondary,
              fontSize: 24,
              lineHeight: 1,
              cursor: "pointer",
              padding: "2px 0",
              flexShrink: 0,
            }}
            aria-label="Открыть меню"
          >
            ☰
          </button>

          <div style={{ minWidth: 0, flex: 1 }}>
            {breadcrumb && (
              <Link
                to={breadcrumb.href}
                style={{
                  color: colors.textDim,
                  textDecoration: "none",
                  fontSize: 12,
                  display: "inline-block",
                  marginBottom: 4,
                }}
              >
                ← {breadcrumb.label}
              </Link>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h1
                style={{
                  fontFamily: fonts.display,
                  fontSize: 20,
                  fontWeight: 600,
                  margin: 0,
                  color: colors.text,
                  lineHeight: 1.05,
                  minWidth: 0,
                  flex: 1,
                }}
              >
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

            {showUpload && (
              <Link
                to="/upload"
                style={{
                  height: 32,
                  padding: "0 14px",
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
                  flexShrink: 0,
                }}
              >
                Загрузить
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
