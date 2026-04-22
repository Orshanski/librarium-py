import { Link, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../auth";
import { colors, layout } from "../theme";
import { listShelves, createShelf as apiCreateShelf, type Shelf } from "@/api/endpoints/shelves";
import { SORT_CONFIG, shelfSortConfigKey } from "../config/sort";

function shelfHref(shelf: Shelf): string {
  const key = shelfSortConfigKey(shelf.system_code);
  const cfg = SORT_CONFIG[key];
  // Если options пустой (reading_now) — dropdown нет, sort в URL не нужен
  if (cfg.options.length === 0) {
    return `/shelves/${shelf.id}`;
  }
  return `/shelves/${shelf.id}?sort=${cfg.default}`;
}

export const navItems = [
  { href: "/", label: "Все книги", shortLabel: "Книги" },
  { href: "/authors", label: "Авторы", shortLabel: "Авторы" },
  { href: "/series", label: "Серии", shortLabel: "Серии" },
  { href: "/tags", label: "Жанры", shortLabel: "Жанры" },
];

function getLinkBaseStyle(): React.CSSProperties {
  return {
    display: "block",
    padding: "8px 12px",
    borderRadius: 6,
    fontSize: 14,
    textDecoration: "none",
    transition: "background 0.15s, color 0.15s",
  };
}

function isActivePath(pathname: string, href: string) {
  const path = href.split("?")[0];
  if (path === "/") return pathname === "/";
  return pathname.startsWith(path);
}

export function SidebarContent({
  mobile = false,
  onNavigate,
}: {
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = useLocation().pathname;
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [showNewShelf, setShowNewShelf] = useState(false);
  const [newShelfName, setNewShelfName] = useState("");
  const me = { name: user?.displayName || user?.username || "", role: user?.role || "" };

  const fetchShelves = useCallback(() => {
    listShelves()
      .then((data) => setShelves(data.shelves))
      .catch((err) => console.warn("Failed to fetch shelves:", err));
  }, []);

  useEffect(() => {
    fetchShelves();
    const handler = () => fetchShelves();
    window.addEventListener("shelves-changed", handler);
    return () => window.removeEventListener("shelves-changed", handler);
  }, [fetchShelves]);

  async function createShelf() {
    if (!newShelfName.trim()) return;
    try {
      const { id } = await apiCreateShelf(newShelfName.trim());
      setShelves([...shelves, { id, name: newShelfName.trim(), is_system: false, book_count: 0 }]);
      setNewShelfName("");
      setShowNewShelf(false);
      window.dispatchEvent(new Event("shelves-changed"));
      onNavigate?.();
    } catch (err) {
      console.warn("Failed to create shelf:", err);
    }
  }

  const linkBase = getLinkBaseStyle();

  return (
    <>
      <div style={{ padding: mobile ? "16px 16px 12px" : "12px 20px 12px", textAlign: mobile ? "left" : "center" }}>
        <Link to="/" style={{ textDecoration: "none" }} onClick={onNavigate}>
          <img src="/logo.png" alt="Librarium" style={{ maxWidth: mobile ? 160 : "70%", height: "auto" }} />
        </Link>
      </div>

      <div style={{ padding: "0 12px", marginBottom: 12 }}>
        <input
          type="text"
          placeholder="Поиск..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && searchQuery.trim()) {
              navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
              setSearchQuery("");
              onNavigate?.();
            }
          }}
          style={{
            width: "100%",
            backgroundColor: colors.card,
            border: "none",
            borderRadius: 6,
            padding: mobile ? "10px 12px" : "8px 12px",
            fontSize: 13,
            color: colors.textSecondary,
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>

      <nav style={{ flex: 1, padding: "0 12px", overflowY: "auto" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {navItems.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              onClick={onNavigate}
              style={{
                ...linkBase,
                backgroundColor: isActivePath(pathname, item.href) ? colors.accentBg : "transparent",
                color: isActivePath(pathname, item.href) ? colors.accent : colors.textSecondary,
              }}
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div style={{ marginTop: 28 }}>
          <div
            style={{
              padding: "0 12px",
              marginBottom: 8,
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: colors.textDim,
            }}
          >
            Полки
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {shelves.map((shelf) => (
              <Link
                key={shelf.id}
                to={shelfHref(shelf)}
                onClick={onNavigate}
                style={{
                  ...linkBase,
                  color: pathname === `/shelves/${shelf.id}` ? colors.accent : colors.textDim,
                  backgroundColor: pathname === `/shelves/${shelf.id}` ? colors.accentBg : "transparent",
                }}
              >
                {shelf.name}
              </Link>
            ))}

            {showNewShelf ? (
              <div style={{ display: "flex", gap: 4, padding: "4px 0" }}>
                <input
                  autoFocus
                  value={newShelfName}
                  onChange={(e) => setNewShelfName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") createShelf();
                    if (e.key === "Escape") {
                      setShowNewShelf(false);
                      setNewShelfName("");
                    }
                  }}
                  placeholder="Название..."
                  style={{
                    flex: 1,
                    backgroundColor: colors.card,
                    border: "none",
                    borderRadius: 4,
                    padding: "8px 10px",
                    fontSize: 13,
                    color: colors.text,
                    outline: "none",
                    fontFamily: "inherit",
                  }}
                />
              </div>
            ) : (
              <button
                onClick={() => setShowNewShelf(true)}
                style={{
                  ...linkBase,
                  background: "none",
                  border: "none",
                  color: colors.textDim,
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: "inherit",
                }}
              >
                + Создать полку
              </button>
            )}
          </div>
        </div>
      </nav>

      <div
        style={{
          padding: "12px",
          borderTop: `1px solid ${colors.border}`,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 12px",
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              backgroundColor: colors.accent,
              color: colors.sidebar,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {(me.name || "?")[0].toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 13, color: colors.text }}>{me.name || "..."}</div>
            <div style={{ fontSize: 10, color: colors.textDim }}>{me.role || "..."}</div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4 }}>
          {me.role === "admin" && (
            <>
              <Link
                to="/upload"
                onClick={onNavigate}
                style={{
                  ...linkBase,
                  color: pathname === "/upload" ? colors.accent : colors.textDim,
                  backgroundColor: pathname === "/upload" ? colors.accentBg : "transparent",
                }}
              >
                Загрузить
              </Link>
              <Link
                to="/admin"
                onClick={onNavigate}
                style={{
                  ...linkBase,
                  color: pathname === "/admin" ? colors.accent : colors.textDim,
                  backgroundColor: pathname === "/admin" ? colors.accentBg : "transparent",
                }}
              >
                Настройки
              </Link>
            </>
          )}
          <button
            onClick={() => {
              onNavigate?.();
              logout();
            }}
            style={{
              ...linkBase,
              background: "none",
              border: "none",
              color: colors.textDim,
              cursor: "pointer",
              textAlign: "left",
              fontFamily: "inherit",
            }}
          >
            Выйти
          </button>
        </div>
      </div>
    </>
  );
}

export default function Sidebar() {
  return (
    <aside
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: layout.desktopSidebarWidth,
        height: "100dvh",
        paddingTop: "var(--sat)",
        paddingBottom: "var(--sab)",
        paddingLeft: "var(--sal)",
        backgroundColor: colors.sidebar,
        borderRight: `1px solid ${colors.border}`,
        display: "flex",
        flexDirection: "column",
        zIndex: 50,
        overflow: "hidden",
      }}
    >
      <SidebarContent />
    </aside>
  );
}
