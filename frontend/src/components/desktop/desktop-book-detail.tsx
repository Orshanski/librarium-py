import { colors } from "../../theme";
import { Link } from "react-router-dom";
import BookActionButton from "../book-action-button";
import BookDescription from "../book-description";
import { BookDetailViewProps } from "../book-detail.types";
import BookFacts, { buildBookFacts } from "../book-facts";
import BookMetaPillList from "../book-meta-pill-list";
import BookReadDownloadButtons from "../book-read-download-buttons";
import BookReadStatusToggle from "../book-read-status-toggle";
import BookSeriesLine from "../book-series-line";
import BookSeriesRail from "../book-series-rail";
import BookShelfMenu from "../book-shelf-menu";
import BookStarRating from "../book-star-rating";
import CloudBadge from "../cloud-badge";
import CoverFrame from "../cover-frame";

const DESKTOP_READABLE_FORMATS = ["EPUB", "FB2", "PDF", "MOBI", "CBZ"] as const;

const COVER_TOKENS = { width: 260, radius: 4, border: "none", marginBottom: 0 };
const SERIES_LINE_TOKENS = {
  fontSize: 14,
  color: colors.textSecondary,
  accentName: true,
  separator: " — ",
  marginBottom: 16,
};
const PILL_TOKENS = {
  pill: {
    padding: "5px 12px",
    fontSize: 12,
    borderRadius: 14,
    background: "rgba(255, 255, 255, 0.06)",
    border: `1px solid ${colors.border}`,
    color: colors.textSecondary,
  },
  gap: 6,
  marginBottom: 16,
};
const DESCRIPTION_TOKENS = {
  fontSize: 15,
  lineHeight: 1.65,
  color: colors.textSecondary,
  marginBottom: 28,
  maxHeight: 390,
};
const FACTS_TOKENS = {
  layout: "grid" as const,
  fontSize: 13,
  gap: "8px 16px",
  gridTemplateColumns: "auto 1fr",
  marginBottom: 28,
  labelColor: colors.textDim,
  valueColor: colors.textSecondary,
};
const SERIES_RAIL_TOKENS = {
  titleFontSize: 20,
  titleFontWeight: 600,
  titleMarginBottom: 16,
  marginTop: 48,
};
const DESKTOP_ADMIN_EDIT_STYLE = {
  background: "none",
  border: `1px solid ${colors.border}`,
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12,
  color: colors.textDim,
  padding: "4px 10px",
  fontFamily: "inherit",
  textDecoration: "none",
};
const DESKTOP_ADMIN_DELETE_STYLE = {
  background: "none",
  border: "1px solid rgba(239,68,68,0.3)",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12,
  color: colors.danger,
  padding: "4px 10px",
  fontFamily: "inherit",
};

export default function DesktopBookDetail({
  book,
  seriesBooks,
  formats,
  isbn,
  bookOrigin,
  isAdmin,
  rating,
  isRead,
  onChangeRating,
  onToggleRead,
  onShowDeleteConfirm,
  hasOffline,
  offlineLoading,
  onToggleOffline,
  showOfflineToggle,
}: Readonly<BookDetailViewProps>) {
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
          <CoverFrame src={book.coverPath} alt={book.title} tokens={COVER_TOKENS} />
          <BookReadDownloadButtons
            bookId={book.id}
            formats={formats}
            readableFormats={DESKTOP_READABLE_FORMATS}
          />
          <BookShelfMenu bookId={book.id} compact={false} />
          <BookActionButton
            kind="link"
            to={`/book/${book.id}/similar`}
            state={bookContext}
            variant="neutral"
          >
            Похожие книги
          </BookActionButton>
        </div>

        <div style={{ width: 520, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            {book.authors.length > 0 ? (
              <div data-testid="desktop-book-authors">
                {book.authors.map((author) => (
                  <span
                    key={author.id}
                    style={{
                      color: colors.accent,
                      fontSize: 16,
                      marginRight: 12,
                    }}
                  >
                    {author.name}
                  </span>
                ))}
              </div>
            ) : (
              <div />
            )}
            {isAdmin && (
              <div data-testid="desktop-book-admin-actions" style={{ display: "flex", gap: 12 }}>
                <Link
                  to={`/book/${book.id}/edit`}
                  state={bookContext}
                  title="Редактировать"
                  style={DESKTOP_ADMIN_EDIT_STYLE}
                >
                  Ред.
                </Link>
                <button
                  type="button"
                  title="Удалить"
                  onClick={onShowDeleteConfirm}
                  style={DESKTOP_ADMIN_DELETE_STYLE}
                >
                  Удалить
                </button>
              </div>
            )}
          </div>

          {book.series && (
            <BookSeriesLine
              seriesName={book.series.name}
              seriesNumber={book.seriesNumber}
              tokens={SERIES_LINE_TOKENS}
            />
          )}

          <div style={{ marginBottom: 24 }}>
            <BookStarRating rating={rating} onChange={onChangeRating} targetSize={32} />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 24 }}>
            <BookReadStatusToggle isRead={isRead} onToggle={onToggleRead} />
            {showOfflineToggle && (
              <CloudBadge
                hasOffline={hasOffline}
                size={20}
                onClick={offlineLoading ? undefined : onToggleOffline}
                style={offlineLoading ? { opacity: 0.3 } : undefined}
              />
            )}
          </div>

          {book.description && <BookDescription html={book.description} tokens={DESCRIPTION_TOKENS} />}

          {book.tags.length > 0 && <BookMetaPillList items={book.tags.map((t) => t.name)} tokens={PILL_TOKENS} />}

          <BookFacts facts={buildBookFacts(book, isbn)} tokens={FACTS_TOKENS} />
        </div>
      </div>

      {book.series && (
        <BookSeriesRail
          books={seriesBooks}
          currentBookId={book.id}
          bookOrigin={bookOrigin}
          seriesName={book.series.name}
          tokens={SERIES_RAIL_TOKENS}
        />
      )}
    </div>
  );
}
