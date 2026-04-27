import { Link } from "react-router-dom";
import { BookCardProps } from "../book-card.types";
import CoverFrame from "../cover-frame";
import CoverProgressBar from "../cover-progress-bar";
import CoverRemoveButton from "../cover-remove-button";
import CoverRatingStars from "../cover-rating-stars";
import CoverOfflineBadge from "../cover-offline-badge";
import CardTitleMeta from "../card-title-meta";

export default function DesktopBookCard({
  book, onRemove, href, onClick, progressPercent, hasOffline, linkState,
}: Readonly<BookCardProps>) {
  const offlineBottom = progressPercent == null ? 6 : 7;

  return (
    <Link
      to={href ?? `/book/${book.id}`}
      state={linkState}
      onClick={onClick}
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <div style={{ cursor: "pointer" }}>
        <CoverFrame
          src={book.coverPath}
          alt={book.title}
          tokens={{
            sizing: { kind: "fixed", height: 230, width: "auto", maxWidth: "100%" },
            radius: 4,
            border: "1px solid rgba(255, 255, 255, 0.15)",
            marginBottom: 8,
          }}
        >
          {progressPercent != null && <CoverProgressBar progressPercent={progressPercent} />}
          {onRemove && (
            <CoverRemoveButton
              onClick={onRemove}
              tokens={{ size: 22, top: 4, left: 4, fontSize: 12, withHoverFade: true }}
            />
          )}
          {book.rating && (
            <CoverRatingStars
              rating={book.rating}
              tokens={{ top: 4, right: 4, fontSize: 8 }}
            />
          )}
          {hasOffline && (
            <CoverOfflineBadge
              tokens={{ outerSize: 28, innerSize: 16, bottom: offlineBottom, right: 6 }}
            />
          )}
        </CoverFrame>

        <CardTitleMeta
          title={book.title}
          authors={book.authors}
          series={book.series ?? undefined}
          seriesNumber={book.seriesNumber}
          tokens={{
            titleSize: 13,
            titleLineHeight: 1.3,
            authorsSize: 12,
            seriesSize: 11,
            seriesEllipsis: false,
          }}
        />
      </div>
    </Link>
  );
}
