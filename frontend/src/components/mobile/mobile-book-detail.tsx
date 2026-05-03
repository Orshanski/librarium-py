import { colors, fonts } from "../../theme";
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

const MOBILE_READABLE_FORMATS = ["EPUB", "FB2", "MOBI", "CBZ"] as const;

const COVER_TOKENS = {
  width: 112,
  radius: 6,
  border: `1px solid ${colors.border}`,
  marginBottom: 0,
};
const SERIES_LINE_TOKENS = {
  fontSize: 11,
  color: colors.textDim,
  accentName: true,
  separator: " — ",
  marginBottom: 0,
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
  fontSize: 13,
  lineHeight: 1.6,
  color: colors.textSecondary,
  marginBottom: 16,
};
const FACTS_TOKENS = {
  layout: "stack" as const,
  labelFontSize: 10,
  labelLetterSpacing: "0.04em",
  labelMarginBottom: 2,
  labelColor: colors.textDim,
  valueFontSize: 13,
  valueColor: colors.textSecondary,
  valueMarginBottom: 12,
  containerMarginBottom: 16,
};
const SERIES_RAIL_TOKENS = {
  titleFontSize: 18,
  titleFontWeight: 600,
  titleMarginBottom: 12,
  marginTop: 24,
};

export default function MobileBookDetail({
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
  const firstFormat = book.formats[0];

  return (
    <div>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 16 }}>
        <CoverFrame src={book.coverPath} alt={book.title} tokens={COVER_TOKENS} />

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
          {book.authors.length > 0 && <BookMetaPillList items={book.authors} tokens={PILL_TOKENS} />}
          {book.series && (
            <BookSeriesLine
              seriesName={book.series}
              seriesNumber={book.seriesNumber}
              tokens={SERIES_LINE_TOKENS}
            />
          )}
          {firstFormat && (
            <div style={{ fontSize: 11, color: colors.textDim, marginTop: 4 }}>
              {firstFormat.format} · {firstFormat.size}
            </div>
          )}
          <div style={{ marginTop: 8 }}>
            <BookStarRating rating={rating} onChange={onChangeRating} size={20} gap={6} targetSize={44} />
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
        <BookReadDownloadButtons
          bookId={book.id}
          formats={book.formats}
          readableFormats={MOBILE_READABLE_FORMATS}
        />
        <BookShelfMenu bookId={book.id} compact={true} />
        <BookActionButton
          kind="link"
          to={`/book/${book.id}/similar`}
          state={bookContext}
          variant="neutral"
        >
          Похожие книги
        </BookActionButton>
      </div>

      {isAdmin && (
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <BookActionButton
              kind="link"
              to={`/book/${book.id}/edit`}
              state={bookContext}
              variant="neutral"
            >
              Редактировать
            </BookActionButton>
          </div>
          <div style={{ flex: 1 }}>
            <BookActionButton kind="button" onClick={onShowDeleteConfirm} variant="danger">
              Удалить
            </BookActionButton>
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <BookReadStatusToggle isRead={isRead} onToggle={onToggleRead} />
        {showOfflineToggle && (
          <CloudBadge
            hasOffline={hasOffline}
            size={18}
            onClick={offlineLoading ? undefined : onToggleOffline}
            style={offlineLoading ? { opacity: 0.3 } : undefined}
          />
        )}
      </div>

      {book.description && <BookDescription html={book.description} tokens={DESCRIPTION_TOKENS} />}

      {book.tags.length > 0 && <BookMetaPillList items={book.tags} tokens={PILL_TOKENS} />}

      <BookFacts facts={buildBookFacts(book)} tokens={FACTS_TOKENS} />

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
