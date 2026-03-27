import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Book } from "../types";
import { colors, fonts } from "../theme";
import { sanitizeHtml } from "../utils/sanitize-html";
import { useAuth } from "../auth";
import ConfirmDialog from "./confirm-dialog";

function StarRating({
  rating,
  onChange,
}: {
  rating: number | null;
  onChange: (r: number) => void;
}) {
  const [hover, setHover] = useState(0);

  return (
    <div style={{ display: "flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          onClick={() => onChange(star)}
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
          style={{
            cursor: "pointer",
            fontSize: 22,
            color:
              star <= (hover || rating || 0) ? colors.accent : colors.textDim,
            transition: "color 0.1s",
          }}
        >
          ★
        </span>
      ))}
    </div>
  );
}

export default function BookDetail({
  book,
  seriesBooks,
}: {
  book: Book;
  seriesBooks: Book[];
}) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [rating, setRating] = useState<number | null>(book.rating);
  const [isRead, setIsRead] = useState(false);
  const [showShelfMenu, setShowShelfMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [shelfList, setShelfList] = useState<any[] | null>(null);
  const [bookShelfIds, setBookShelfIds] = useState<Set<number>>(new Set());
  const shelfRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showShelfMenu) return;
    function handleClick(e: MouseEvent) {
      if (shelfRef.current && !shelfRef.current.contains(e.target as Node)) {
        setShowShelfMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showShelfMenu]);

  // Load user-specific status
  useEffect(() => {
    fetch(`/api/books/${book.id}/status`)
      .then((r) => r.json())
      .then((data) => {
        if (data.rating !== undefined) setRating(data.rating);
        setIsRead(!!data.is_read);
      })
      .catch(() => {});
  }, [book.id]);

  function saveRating(r: number) {
    setRating(r);
    fetch(`/api/books/${book.id}/rating`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating: r }),
    });
  }

  function toggleRead() {
    const next = !isRead;
    setIsRead(next);
    fetch(`/api/books/${book.id}/read`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isRead: next }),
    });
  }

  return (
    <div>
      {/* Main layout: cover left, info right */}
      <div style={{ display: "flex", gap: 40, alignItems: "flex-start" }}>
        {/* Left column: cover + actions */}
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 260,
              height: 390,
              borderRadius: 4,
              overflow: "hidden",
              backgroundColor: colors.bg,
            }}
          >
            <img
              src={book.coverPath}
              alt={book.title}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                objectPosition: "top",
                display: "block",
              }}
            />
          </div>

          {/* Download buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {book.formats.map((f) => (
              <a
                key={f.format}
                href={`/api/books/${book.id}/download?format=${f.format}`}
                style={{ ...actionButtonStyle, textDecoration: "none" }}
              >
                Скачать {f.format}
                <span style={{ fontSize: 11, color: colors.textDim, marginLeft: 8 }}>{f.size}</span>
              </a>
            ))}
          </div>

          {/* Shelf button */}
          <div ref={shelfRef} style={{ position: "relative" }}>
            <button
              onClick={() => {
                if (!showShelfMenu) {
                  fetch(`/api/shelves?bookId=${book.id}`)
                    .then((r) => r.json())
                    .then((data) => {
                      setShelfList(data.shelves || []);
                      const onShelves = (data.bookShelves || []).filter((s: any) => s.has_book).map((s: any) => s.id);
                      setBookShelfIds(new Set(onShelves));
                    });
                }
                setShowShelfMenu(!showShelfMenu);
              }}
              style={{
                ...actionButtonStyle,
                borderColor: "rgba(249, 190, 3, 0.3)",
                color: colors.accent,
                width: "100%",
              }}
            >
              На полку
            </button>
            {showShelfMenu && shelfList && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  zIndex: 50,
                  backgroundColor: colors.sidebar,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 6,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                  padding: "4px 0",
                  marginTop: 4,
                }}
              >
                {shelfList.filter((s: any) => !s.is_system).map((s: any) => (
                  <label
                    key={s.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 12px",
                      fontSize: 13,
                      color: colors.textSecondary,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={bookShelfIds.has(s.id)}
                      onChange={async () => {
                        if (bookShelfIds.has(s.id)) {
                          await fetch(`/api/shelves/${s.id}/books/${book.id}`, { method: "DELETE" });
                          setBookShelfIds((prev) => { const n = new Set(prev); n.delete(s.id); return n; });
                        } else {
                          await fetch(`/api/shelves/${s.id}/books`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ bookId: book.id }),
                          });
                          setBookShelfIds((prev) => new Set(prev).add(s.id));
                        }
                      }}
                      style={{ accentColor: colors.accent }}
                    />
                    {s.name}
                  </label>
                ))}
                {shelfList.filter((s: any) => !s.is_system).length === 0 && (
                  <div style={{ padding: "8px 12px", fontSize: 12, color: colors.textDim }}>
                    Нет полок
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right column: metadata */}
        <div style={{ width: 520, flexShrink: 0 }}>
          {/* Author + admin icons */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
            {book.authors.map((author) => (
              <Link
                key={author}
                to="/authors"
                style={{
                  color: colors.accent,
                  textDecoration: "none",
                  fontSize: 16,
                  marginRight: 12,
                }}
              >
                {author}
              </Link>
            ))}
            </div>
            {isAdmin && (
            <div style={{ display: "flex", gap: 12 }}>
              <a
                href={`/book/${book.id}/edit`}
                title="Редактировать"
                style={{ background: "none", border: `1px solid ${colors.border}`, borderRadius: 6, cursor: "pointer", fontSize: 12, color: colors.textDim, padding: "4px 10px", fontFamily: "inherit", textDecoration: "none" }}
              >
                Ред.
              </a>
              <button
                title="Удалить"
                onClick={() => setShowDeleteConfirm(true)}
                style={{ background: "none", border: `1px solid rgba(239,68,68,0.3)`, borderRadius: 6, cursor: "pointer", fontSize: 12, color: colors.danger, padding: "4px 10px", fontFamily: "inherit" }}
              >
                Удалить
              </button>
            </div>
            )}
          </div>

          {/* Series */}
          {book.series && (
            <div style={{ marginBottom: 16 }}>
              <Link
                to="/series"
                style={{
                  color: colors.textSecondary,
                  textDecoration: "none",
                  fontSize: 14,
                }}
              >
                {book.series}
                {book.seriesNumber ? ` — книга ${book.seriesNumber}` : ""}
              </Link>
            </div>
          )}

          {/* Rating + Read status */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 20,
              marginBottom: 24,
            }}
          >
            <StarRating rating={rating} onChange={saveRating} />
            <button
              onClick={toggleRead}
              style={{
                background: "none",
                border: `1px solid ${isRead ? colors.success : colors.border}`,
                borderRadius: 16,
                padding: "4px 14px",
                fontSize: 13,
                fontFamily: "inherit",
                color: isRead ? colors.success : colors.textDim,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {isRead ? "✓ Прочитано" : "Не прочитано"}
            </button>
          </div>

          {/* Description */}
          {book.description && (
            <div
              style={{
                fontSize: 15,
                lineHeight: 1.65,
                color: colors.textSecondary,
                marginBottom: 28,
                maxHeight: 390,
                overflowY: "auto",
              }}
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(book.description) }}
            />
          )}

          {/* Tags */}
          {book.tags.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {book.tags.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      padding: "4px 10px",
                      fontSize: 12,
                      borderRadius: 12,
                      backgroundColor: "rgba(255, 255, 255, 0.06)",
                      border: `1px solid ${colors.border}`,
                      color: colors.textSecondary,
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Metadata */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              gap: "8px 16px",
              fontSize: 13,
              marginBottom: 28,
            }}
          >
            <span style={{ color: colors.textDim }}>Язык</span>
            <span style={{ color: colors.textSecondary }}>{book.language}</span>

            {book.publisher && (
              <>
                <span style={{ color: colors.textDim }}>Издатель</span>
                <span style={{ color: colors.textSecondary }}>{book.publisher}</span>
              </>
            )}

            {book.pubDate && (
              <>
                <span style={{ color: colors.textDim }}>Год</span>
                <span style={{ color: colors.textSecondary }}>{book.pubDate}</span>
              </>
            )}

            {book.isbn && (
              <>
                <span style={{ color: colors.textDim }}>ISBN</span>
                <span style={{ color: colors.textSecondary }}>{book.isbn}</span>
              </>
            )}
          </div>


        </div>
      </div>

      {/* Series carousel */}
      {seriesBooks.length > 1 && (
        <div style={{ marginTop: 48 }}>
          <h3
            style={{
              fontFamily: fonts.display,
              fontSize: 20,
              fontWeight: 600,
              color: colors.text,
              marginBottom: 16,
            }}
          >
            Другие книги серии «{book.series}»
          </h3>
          <div
            style={{
              display: "flex",
              gap: 16,
              overflowX: "auto",
              paddingBottom: 8,
            }}
          >
            {seriesBooks.map((sb) => (
              <Link
                key={sb.id}
                to={`/book/${sb.id}`}
                style={{ textDecoration: "none", flexShrink: 0 }}
              >
                <div
                  style={{
                    opacity: sb.id === book.id ? 1 : 0.6,
                    transition: "opacity 0.15s",
                    border:
                      sb.id === book.id
                        ? `2px solid ${colors.accent}`
                        : "2px solid transparent",
                    borderRadius: 4,
                    overflow: "hidden",
                  }}
                >
                  <img
                    src={sb.coverPath}
                    alt={sb.title}
                    style={{ height: 160, width: "auto", display: "block" }}
                  />
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color:
                      sb.id === book.id ? colors.accent : colors.textDim,
                    marginTop: 4,
                    maxWidth: 100,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {sb.seriesNumber ? `${sb.seriesNumber}. ` : ""}
                  {sb.title}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <ConfirmDialog
          message={`Удалить «${book.title}»?`}
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={async () => {
            const res = await fetch(`/api/books/${book.id}`, { method: "DELETE" });
            if (res.ok) {
              sessionStorage.removeItem("librarium_catalog");
              window.location.href = "/";
            }
          }}
        />
      )}
    </div>
  );
}

const actionButtonStyle: React.CSSProperties = {
  background: "none",
  border: `1px solid ${colors.border}`,
  borderRadius: 6,
  padding: "8px 16px",
  fontSize: 13,
  fontFamily: "inherit",
  color: colors.textSecondary,
  cursor: "pointer",
  transition: "background 0.15s, border-color 0.15s",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
