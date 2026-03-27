import { Link, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useAuth } from "../auth";
import { colors, fonts } from "../theme";

const navItems = [
  { href: "/?fresh=1", label: "Все книги" },
  { href: "/authors?fresh=1", label: "Авторы" },
  { href: "/series?fresh=1", label: "Серии" },
  { href: "/tags?fresh=1", label: "Жанры" },
];

export default function Sidebar() {
  const pathname = useLocation().pathname;
  const { user, logout } = useAuth();

  function isActive(href: string) {
    const path = href.split("?")[0];
    if (path === "/") return pathname === "/";
    return pathname.startsWith(path);
  }

  const linkBase: React.CSSProperties = {
    display: "block",
    padding: "8px 12px",
    borderRadius: 6,
    fontSize: 14,
    textDecoration: "none",
    transition: "background 0.15s, color 0.15s",
  };

  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [shelves, setShelves] = useState<any[]>([]);
  const [showNewShelf, setShowNewShelf] = useState(false);
  const [newShelfName, setNewShelfName] = useState("");
  const me = { name: user?.displayName || user?.username || "", role: user?.role || "" };

  useEffect(() => {
    fetch("/api/shelves")
      .then((r) => r.json())
      .then((data) => setShelves(data.shelves || []))
      .catch(() => {});
  }, []);

  async function createShelf() {
    if (!newShelfName.trim()) return;
    const res = await fetch("/api/shelves", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newShelfName.trim() }),
    });
    if (res.ok) {
      const data = await res.json();
      setShelves([...shelves, { id: data.id, name: data.name, is_system: 0, book_count: 0 }]);
      setNewShelfName("");
      setShowNewShelf(false);
    }
  }

  return (
    <aside
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: 220,
        height: "100vh",
        backgroundColor: colors.sidebar,
        borderRight: `1px solid ${colors.border}`,
        display: "flex",
        flexDirection: "column",
        zIndex: 50,
        overflowY: "auto",
      }}
    >
      {/* Logo */}
      <div style={{ padding: "16px 20px 16px" }}>
        <Link
          to="/"
          style={{
            fontFamily: fonts.display,
            fontSize: 28,
            fontWeight: 700,
            color: colors.accent,
            textDecoration: "none",
            letterSpacing: "0.02em",
          }}
        >
          Librarium
        </Link>
      </div>

      {/* Search */}
      <div style={{ padding: "0 12px", marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Поиск..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && searchQuery.trim()) {
              navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
              setSearchQuery("");
            }
          }}
          style={{
            width: "100%",
            backgroundColor: colors.card,
            border: "none",
            borderRadius: 6,
            padding: "8px 12px",
            fontSize: 13,
            color: colors.textSecondary,
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: "0 12px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {navItems.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              style={{
                ...linkBase,
                backgroundColor: isActive(item.href) ? colors.accentBg : "transparent",
                color: isActive(item.href) ? colors.accent : colors.textSecondary,
              }}
            >
              {item.label}
            </Link>
          ))}
        </div>

        {/* Shelves */}
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
                to={`/shelves/${shelf.id}`}
                style={{
                  ...linkBase,
                  color:
                    pathname === `/shelves/${shelf.id}`
                      ? colors.accent
                      : colors.textDim,
                  backgroundColor:
                    pathname === `/shelves/${shelf.id}`
                      ? colors.accentBg
                      : "transparent",
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
                    if (e.key === "Escape") { setShowNewShelf(false); setNewShelfName(""); }
                  }}
                  placeholder="Название..."
                  style={{
                    flex: 1,
                    backgroundColor: colors.card,
                    border: "none",
                    borderRadius: 4,
                    padding: "4px 8px",
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

      {/* User */}
      <div
        style={{
          padding: "12px",
          borderTop: `1px solid ${colors.border}`,
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
          <Link
            to="/admin"
            style={{
              ...linkBase,
              color: pathname === "/admin" ? colors.accent : colors.textDim,
              backgroundColor: pathname === "/admin" ? colors.accentBg : "transparent",
            }}
          >
            Настройки
          </Link>
          <button
            onClick={() => logout()}
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
    </aside>
  );
}
