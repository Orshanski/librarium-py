import { Link } from "react-router-dom";
import { colors, fonts } from "../../theme";
import { sanitizeHtml } from "../../utils/sanitize-html";
import { setReadingFlag } from "../../utils/readerFlag";
import BookCard from "../book-card";
import BookRail from "../book-rail";
import BookStarRating from "../book-star-rating";
import CloudBadge from "../cloud-badge";
import { BookDetailViewProps } from "../book-detail.types";
import ShelfDropdownMenu from "../shelf-dropdown-menu";

const primaryButtonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  minHeight: 48,
  borderRadius: 10,
  textDecoration: "none",
  fontFamily: "inherit",
  fontSize: 14,
  fontWeight: 600,
  boxSizing: "border-box",
};

export default function MobileBookDetail({
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
  isCached,
  cacheLoading,
  onToggleCache,
  showCacheToggle,
}: BookDetailViewProps) {
  const otherSeriesBooks = seriesBooks.filter((item) => item.id !== book.id);
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
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 16 }}>
        <div
          style={{
            width: 112,
            flexShrink: 0,
            borderRadius: 6,
            overflow: "hidden",
            border: `1px solid ${colors.border}`,
            backgroundColor: colors.bg,
          }}
        >
          {book.coverPath && (
            <img
              src={book.coverPath}
              alt={book.title}
              style={{
                width: "100%",
                aspectRatio: "2 / 3",
                objectFit: "contain",
                objectPosition: "top",
                display: "block",
              }}
            />
          )}
        </div>

        <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div
            style={{
              fontFamily: fonts.display,
              fontSize: 20,
              fontWeight: 600,
              lineHeight: 1.15,
              color: colors.text,
              marginBottom: 6,
            }}
          >
            {book.title}
          </div>
          <div style={{ fontSize: 13, color: colors.accent, marginBottom: 8 }}>
            {book.authors.join(", ")}
          </div>
          <div style={{ marginBottom: 8 }}>
            <BookStarRating rating={rating} onChange={onChangeRating} size={20} gap={6} targetSize={44} />
          </div>
          <div style={{ fontSize: 11, color: colors.textDim, lineHeight: 1.5 }}>
            {book.series && (
              <div>
                {book.series}
                {book.seriesNumber ? ` · кн. ${book.seriesNumber}` : ""}
              </div>
            )}
            {book.formats[0] && (
              <div>
                {book.formats[0].format} · {book.formats[0].size}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
        {book.formats
          .filter((f) => ["EPUB", "FB2", "MOBI", "CBZ"].includes(f.format.toUpperCase()))
          .map((f) => (
            <Link
              key={`read-${f.format}`}
              to={`/book/${book.id}/read/${f.format.toLowerCase()}`}
              onClick={setReadingFlag}
              style={{
                ...primaryButtonStyle,
                backgroundColor: "rgba(249, 190, 3, 0.1)",
                border: "1px solid rgba(249, 190, 3, 0.3)",
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
            style={{
              ...primaryButtonStyle,
              backgroundColor: "rgba(255, 255, 255, 0.04)",
              border: `1px solid ${colors.border}`,
              color: colors.textSecondary,
            }}
          >
            Скачать {f.format}
            <span style={{ fontSize: 11, color: colors.textDim, marginLeft: 8 }}>{f.size}</span>
          </a>
        ))}

        <div ref={shelfRef} style={{ position: "relative" }}>
          <button
            onClick={onToggleShelfMenu}
            style={{
              ...primaryButtonStyle,
              background: "none",
              border: "1px solid rgba(249, 190, 3, 0.3)",
              color: colors.accent,
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
                borderRadius: 8,
                boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                padding: "6px 0",
                marginTop: 6,
              }}
            >
              <ShelfDropdownMenu
                shelves={shelfList}
                selectedIds={bookShelfIds}
                onToggleShelf={onToggleShelfBook}
                compact
              />
            </div>
          )}
        </div>

        <Link
          to={`/book/${book.id}/similar`}
          state={bookContext}
          style={{
            ...primaryButtonStyle,
            backgroundColor: "rgba(255, 255, 255, 0.04)",
            border: `1px solid ${colors.border}`,
            color: colors.textSecondary,
            gap: 6,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
            <path d="M9 7h6M9 11h4" />
          </svg>
          Похожие книги
          <span style={{ fontSize: 9, opacity: 0.5, marginLeft: 2 }}>litres</span>
        </Link>
      </div>

      {isAdmin && (
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <Link
            to={`/book/${book.id}/edit`}
            state={bookContext}
            style={{
              ...primaryButtonStyle,
              minHeight: 40,
              backgroundColor: "transparent",
              border: `1px solid ${colors.border}`,
              color: colors.textDim,
              flex: 1,
            }}
          >
            Ред.
          </Link>
          <button
            onClick={onShowDeleteConfirm}
            style={{
              ...primaryButtonStyle,
              minHeight: 40,
              backgroundColor: "transparent",
              border: "1px solid rgba(239,68,68,0.3)",
              color: colors.danger,
              flex: 1,
            }}
          >
            Удалить
          </button>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <button
          onClick={onToggleRead}
          style={{
            background: "none",
            border: `1px solid ${isRead ? colors.success : colors.border}`,
            borderRadius: 18,
            padding: "6px 14px",
            fontSize: 13,
            fontFamily: "inherit",
            color: isRead ? colors.success : colors.textDim,
            cursor: "pointer",
          }}
        >
          {isRead ? "✓ Прочитано" : "Не прочитано"}
        </button>
        {showCacheToggle && (
          <CloudBadge
            cached={isCached}
            size={18}
            onClick={cacheLoading ? undefined : onToggleCache}
            style={cacheLoading ? { opacity: 0.3 } : undefined}
          />
        )}
      </div>

      {book.description && (
        <div
          style={{
            fontSize: 13,
            lineHeight: 1.6,
            color: colors.textSecondary,
            marginBottom: 16,
          }}
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(book.description) }}
        />
      )}

      {book.tags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
          {book.tags.map((tag) => (
            <span
              key={tag}
              style={{
                padding: "5px 12px",
                fontSize: 12,
                borderRadius: 14,
                backgroundColor: "rgba(255, 255, 255, 0.06)",
                border: `1px solid ${colors.border}`,
                color: colors.textSecondary,
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        {book.series && (
          <>
            <div style={{ fontSize: 10, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>Серия</div>
            <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 12 }}>
              <span style={{ color: colors.accent }}>{book.series}</span>
              {book.seriesNumber ? ` (книга ${book.seriesNumber})` : ""}
            </div>
          </>
        )}
        <div style={{ fontSize: 10, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>Язык</div>
        <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 12 }}>{book.language}</div>
        {book.publisher && (
          <>
            <div style={{ fontSize: 10, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>Издатель</div>
            <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 12 }}>{book.publisher}</div>
          </>
        )}
        {book.pubDate && (
          <>
            <div style={{ fontSize: 10, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>Год</div>
            <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 12 }}>{book.pubDate}</div>
          </>
        )}
        {book.isbn && (
          <>
            <div style={{ fontSize: 10, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>ISBN</div>
            <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 12 }}>{book.isbn}</div>
          </>
        )}
      </div>

      {otherSeriesBooks.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3
            style={{
              fontFamily: fonts.display,
              fontSize: 18,
              fontWeight: 600,
              color: colors.text,
              marginBottom: 12,
            }}
          >
            Другие книги серии «{book.series}»
          </h3>
          <BookRail>
            {otherSeriesBooks.map((seriesBook) => (
              <BookCard
                key={seriesBook.id}
                book={seriesBook}
                linkState={{ origin: bookOrigin }}
              />
            ))}
          </BookRail>
        </div>
      )}
    </div>
  );
}
