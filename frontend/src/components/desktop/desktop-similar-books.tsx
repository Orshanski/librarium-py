import { SimilarBooksViewProps } from "../similar-books.types";
import CoverFrame from "../cover-frame";
import CoverRatingChip from "../cover-rating-chip";
import CardTitleMeta from "../card-title-meta";
import { DESKTOP_COVER_FRAME } from "../cover-tokens";

const externalIcon = (
  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.2">
    <path d="M3.5 1.5H1.5v9h9v-2M7 1.5h3.5V5M5 7l6-5.5" />
  </svg>
);

export default function DesktopSimilarBooks({ books }: Readonly<SimilarBooksViewProps>) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
        gap: "24px 16px",
      }}
    >
      {books.map((book) => (
        <a
          key={book.litresUrl}
          href={book.litresUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ textDecoration: "none", color: "inherit", display: "block" }}
        >
          <CoverFrame src={book.coverUrl} alt={book.title} tokens={DESKTOP_COVER_FRAME}>
            <CoverRatingChip
              rating={book.rating}
              tokens={{ top: 6, right: 6, padding: "2px 6px", fontSize: 11, iconFontSize: 10 }}
            />
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                background: "linear-gradient(transparent, rgba(0,0,0,0.75))",
                padding: "16px 6px 5px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                fontSize: 10,
                color: "rgba(255,255,255,0.7)",
              }}
            >
              {externalIcon} litres.ru
            </div>
          </CoverFrame>
          <CardTitleMeta
            title={book.title}
            authors={[book.authors]}
            tokens={{ titleSize: 13, titleLineHeight: 1.3, authorsSize: 12 }}
          />
        </a>
      ))}
    </div>
  );
}
