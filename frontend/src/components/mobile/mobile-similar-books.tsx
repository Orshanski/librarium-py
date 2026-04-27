import { SimilarBooksViewProps } from "../similar-books.types";
import CoverFrame from "../cover-frame";
import CoverRatingChip from "../cover-rating-chip";
import CardTitleMeta from "../card-title-meta";
import { MOBILE_SIMILAR_COVER_FRAME } from "../cover-tokens";

const externalIcon = (
  <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.2">
    <path d="M3.5 1.5H1.5v9h9v-2M7 1.5h3.5V5M5 7l6-5.5" />
  </svg>
);

export default function MobileSimilarBooks({ books }: Readonly<SimilarBooksViewProps>) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
        gap: "16px 12px",
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
          <CoverFrame src={book.coverUrl} alt={book.title} tokens={MOBILE_SIMILAR_COVER_FRAME}>
            <CoverRatingChip
              rating={book.rating}
              tokens={{ top: 4, right: 4, padding: "2px 5px", fontSize: 10, iconFontSize: 9, gap: 2 }}
            />
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                background: "linear-gradient(transparent, rgba(0,0,0,0.7))",
                padding: "12px 4px 4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 3,
                fontSize: 9,
                color: "rgba(255,255,255,0.6)",
              }}
            >
              {externalIcon} litres.ru
            </div>
          </CoverFrame>
          <CardTitleMeta
            title={book.title}
            authors={[book.authors]}
            tokens={{ titleSize: 12, titleLineHeight: 1.3, authorsSize: 11 }}
          />
        </a>
      ))}
    </div>
  );
}
