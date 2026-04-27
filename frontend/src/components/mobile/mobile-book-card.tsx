import { Link } from "react-router-dom";
import { BookCardProps } from "../book-card.types";
import CoverFrame from "../cover-frame";
import CoverProgressBar from "../cover-progress-bar";
import CoverRemoveButton from "../cover-remove-button";
import CoverRatingStars from "../cover-rating-stars";
import CoverOfflineBadge from "../cover-offline-badge";
import CardTitleMeta from "../card-title-meta";
import { MOBILE_BOOK_CARD_COVER_FRAME, offlineBottomFor } from "../cover-tokens";

export default function MobileBookCard({
  book, onRemove, href, onClick, progressPercent, hasOffline, linkState,
}: Readonly<BookCardProps>) {
  const offlineBottom = offlineBottomFor(4, progressPercent != null);

  return (
    <Link
      to={href ?? `/book/${book.id}`}
      state={linkState}
      onClick={onClick}
      style={{ textDecoration: "none", color: "inherit", display: "block" }}
    >
      <div style={{ cursor: "pointer", minWidth: 0 }}>
        <CoverFrame src={book.coverPath} alt={book.title} tokens={MOBILE_BOOK_CARD_COVER_FRAME}>
          {progressPercent != null && <CoverProgressBar progressPercent={progressPercent} />}
          {onRemove && (
            <CoverRemoveButton
              onClick={onRemove}
              tokens={{
                size: 44,
                top: 0,
                left: 0,
                fontSize: 14,
                withHoverFade: false,
                background: "rgba(0,0,0,0.65)",
                transform: "translate(-6px, -6px)",
              }}
            />
          )}
          {book.rating && (
            <CoverRatingStars
              rating={book.rating}
              tokens={{ top: 4, right: 4, fontSize: 7, letterSpacing: 0.3 }}
            />
          )}
          {hasOffline && (
            <CoverOfflineBadge
              tokens={{ outerSize: 24, innerSize: 14, bottom: offlineBottom, right: 4 }}
            />
          )}
        </CoverFrame>

        <CardTitleMeta
          title={book.title}
          authors={book.authors}
          series={book.series ?? undefined}
          seriesNumber={book.seriesNumber}
          tokens={{
            titleSize: 12,
            titleLineHeight: 1.25,
            authorsSize: 11,
            seriesSize: 10,
            seriesEllipsis: true,
          }}
        />
      </div>
    </Link>
  );
}
