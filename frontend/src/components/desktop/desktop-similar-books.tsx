import { colors } from "../../theme";
import { SimilarBooksViewProps } from "../similar-books.types";

const externalIcon = (
  <svg width="10" height="10" viewBox="0 0 12 12" fill="rgba(255,255,255,0.7)">
    <path d="M3.5 1.5H1.5v9h9v-2M7 1.5h3.5V5M5 7l6-5.5" />
  </svg>
);

export default function DesktopSimilarBooks({ books }: SimilarBooksViewProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
        gap: "24px 16px",
      }}
    >
      {books.map((book, i) => (
        <a
          key={i}
          href={book.litresUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ textDecoration: "none", color: "inherit", display: "block", transition: "transform 0.2s" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-4px)";
            e.currentTarget.querySelector<HTMLElement>(".ext-badge")!.style.opacity = "1";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.querySelector<HTMLElement>(".ext-badge")!.style.opacity = "0";
          }}
        >
          <div
            style={{
              position: "relative",
              borderRadius: 4,
              overflow: "hidden",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              marginBottom: 8,
              background: "rgba(0,0,0,0.2)",
              aspectRatio: "0.7",
            }}
          >
            <img
              src={book.coverUrl}
              alt={book.title}
              loading="lazy"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
            <div
              style={{
                position: "absolute",
                top: 6,
                right: 6,
                background: "rgba(0,0,0,0.65)",
                backdropFilter: "blur(4px)",
                borderRadius: 4,
                padding: "2px 6px",
                fontSize: 11,
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                gap: 3,
              }}
            >
              <span style={{ color: colors.accent, fontSize: 10 }}>★</span>
              {book.rating}
            </div>
            <div
              className="ext-badge"
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
                opacity: 0,
                transition: "opacity 0.2s",
              }}
            >
              {externalIcon} litres.ru
            </div>
          </div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: colors.text,
              lineHeight: 1.3,
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              marginBottom: 2,
            }}
          >
            {book.title}
          </div>
          <div
            style={{
              fontSize: 12,
              color: colors.textDim,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {book.authors}
          </div>
        </a>
      ))}
    </div>
  );
}
