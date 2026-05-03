import { colors } from "../../theme";
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

export default function DesktopBookDetail({
  book,
  seriesBooks,
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
            formats={book.formats}
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
          {isAdmin && (
            <>
              <BookActionButton
                kind="link"
                to={`/book/${book.id}/edit`}
                state={bookContext}
                variant="neutral"
              >
                Редактировать
              </BookActionButton>
              <BookActionButton kind="button" onClick={onShowDeleteConfirm} variant="danger">
                Удалить
              </BookActionButton>
            </>
          )}
        </div>

        <div style={{ width: 520, flexShrink: 0 }}>
          {book.authors.length > 0 && <BookMetaPillList items={book.authors} tokens={PILL_TOKENS} />}

          {book.series && (
            <BookSeriesLine
              seriesName={book.series}
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

          {book.tags.length > 0 && <BookMetaPillList items={book.tags} tokens={PILL_TOKENS} />}

          <BookFacts facts={buildBookFacts(book)} tokens={FACTS_TOKENS} />
        </div>
      </div>

      {book.series && (
        <BookSeriesRail
          books={seriesBooks}
          currentBookId={book.id}
          bookOrigin={bookOrigin}
          seriesName={book.series}
          tokens={SERIES_RAIL_TOKENS}
        />
      )}
    </div>
  );
}
