import { Link } from "react-router-dom";
import { colors, fonts } from "../../theme";
import { sanitizeHtml } from "../../utils/sanitize-html";
import { setReadingFlag } from "../../utils/readerFlag";
import BookStarRating from "../book-star-rating";
import CloudBadge from "../cloud-badge";
import { BookDetailViewProps } from "../book-detail.types";
import ShelfDropdownMenu from "../shelf-dropdown-menu";
import BookCard from "../book-card";
import {
  bookToBookCardCommonProps,
  SERIES_RAIL_BORDER_ACCENT,
  SERIES_RAIL_BORDER_PLACEHOLDER,
  SERIES_RAIL_COVER_WIDTH,
  SERIES_RAIL_GAP_PX,
  SERIES_RAIL_OPACITY_ACTIVE,
  SERIES_RAIL_OPACITY_INACTIVE,
} from "../book-card-tokens";

function pickOpacity(isCurrent: boolean): number {
  if (isCurrent) return SERIES_RAIL_OPACITY_ACTIVE;
  return SERIES_RAIL_OPACITY_INACTIVE;
}

function pickBorder(isCurrent: boolean): string {
  if (isCurrent) return SERIES_RAIL_BORDER_ACCENT;
  return SERIES_RAIL_BORDER_PLACEHOLDER;
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

export default function DesktopBookDetail({
  book,
  seriesBooks,
  bookOrigin,
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
  hasOffline,
  offlineLoading,
  onToggleOffline,
  showOfflineToggle,
}: BookDetailViewProps) {
  const bookContext = {
    origin: {
      type: "book" as const,
      url: `/book/${book.id}`,
      label: book.title,
      bookOrigin,
    },
  };
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
            {book.formats
              .filter((f) => ["EPUB", "FB2", "PDF", "MOBI", "CBZ"].includes(f.format.toUpperCase()))
              .map((f) => (
                <Link
                  key={`read-${f.format}`}
                  to={`/book/${book.id}/read/${f.format.toLowerCase()}`}
                  onClick={setReadingFlag}
                  style={{
                    ...actionButtonStyle,
                    textDecoration: "none",
                    borderColor: "rgba(249, 190, 3, 0.3)",
                    color: colors.accent,
                  }}
                >
                  Читать {f.format}
                </Link>
              ))}
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

          <Link
            to={`/book/${book.id}/similar`}
            state={bookContext}
            style={{
              ...actionButtonStyle,
              marginTop: 6,
              gap: 6,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
              <path d="M9 7h6M9 11h4" />
            </svg>
            Похожие книги
            <span style={{ fontSize: 9, opacity: 0.5, marginLeft: 2 }}>litres</span>
          </Link>
        </div>

        <div style={{ width: 520, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              {book.authors.map((author) => (
                <span
                  key={author}
                  style={{
                    color: colors.accent,
                    fontSize: 16,
                    marginRight: 12,
                  }}
                >
                  {author}
                </span>
              ))}
            </div>
            {isAdmin && (
              <div style={{ display: "flex", gap: 12 }}>
                <Link
                  to={`/book/${book.id}/edit`}
                  state={bookContext}
                  title="Редактировать"
                  style={{ background: "none", border: `1px solid ${colors.border}`, borderRadius: 6, cursor: "pointer", fontSize: 12, color: colors.textDim, padding: "4px 10px", fontFamily: "inherit", textDecoration: "none" }}
                >
                  Ред.
                </Link>
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
              <span
                style={{
                  color: colors.textSecondary,
                  fontSize: 14,
                }}
              >
                {book.series}
                {book.seriesNumber ? ` — книга ${book.seriesNumber}` : ""}
              </span>
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
            {showOfflineToggle && (
              <CloudBadge
                hasOffline={hasOffline}
                size={20}
                onClick={offlineLoading ? undefined : onToggleOffline}
                style={offlineLoading ? { opacity: 0.3 } : undefined}
              />
            )}
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
          <div style={{ display: "flex", gap: SERIES_RAIL_GAP_PX, overflowX: "auto", paddingBottom: 8 }}>
            {seriesBooks.map((sb) => (
              <BookCard
                key={sb.id}
                {...bookToBookCardCommonProps(sb)}
                width={SERIES_RAIL_COVER_WIDTH}
                opacity={pickOpacity(sb.id === book.id)}
                border={pickBorder(sb.id === book.id)}
                linkState={{ origin: bookOrigin }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
