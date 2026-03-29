import { Link } from "react-router-dom";
import { colors, fonts } from "../../theme";
import { sanitizeHtml } from "../../utils/sanitize-html";
import BookStarRating from "../book-star-rating";
import { BookDetailViewProps } from "../book-detail.types";
import ShelfDropdownMenu from "../shelf-dropdown-menu";

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

export default function DesktopBookDetail({
  book,
  seriesBooks,
  isAdmin,
  rating,
  isRead,
  showShelfMenu,
  shelfList,
  bookShelfIds,
  shelfRef,
  onChangeRating,
  onToggleRead,
  onToggleShelfMenu,
  onToggleShelfBook,
  onShowDeleteConfirm,
}: BookDetailViewProps) {
  return (
    <div>
      <div style={{ display: "flex", gap: 40, alignItems: "flex-start" }}>
        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 12 }}>
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

          <div ref={shelfRef} style={{ position: "relative" }}>
            <button
              onClick={onToggleShelfMenu}
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
                <ShelfDropdownMenu
                  shelves={shelfList}
                  selectedIds={bookShelfIds}
                  onToggleShelf={onToggleShelfBook}
                />
              </div>
            )}
          </div>
        </div>

        <div style={{ width: 520, flexShrink: 0 }}>
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
                  onClick={onShowDeleteConfirm}
                  style={{ background: "none", border: `1px solid rgba(239,68,68,0.3)`, borderRadius: 6, cursor: "pointer", fontSize: 12, color: colors.danger, padding: "4px 10px", fontFamily: "inherit" }}
                >
                  Удалить
                </button>
              </div>
            )}
          </div>

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

          <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 24 }}>
            <BookStarRating rating={rating} onChange={onChangeRating} targetSize={32} />
            <button
              onClick={onToggleRead}
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
          <div style={{ display: "flex", gap: 16, overflowX: "auto", paddingBottom: 8 }}>
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
                    border: sb.id === book.id ? `2px solid ${colors.accent}` : "2px solid transparent",
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
                    color: sb.id === book.id ? colors.accent : colors.textDim,
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
    </div>
  );
}
