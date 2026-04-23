import { colors } from "../../theme";
import { SimilarBooksViewProps } from "../similar-books.types";

export default function MobileSimilarBooks({ books }: Readonly<SimilarBooksViewProps>) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
        gap: "16px 12px",
      }}
    >
      {books.map((book, i) => (
        <a
          key={i}
          href={book.litresUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ textDecoration: "none", color: "inherit", display: "block" }}
        >
          <div
            style={{
              position: "relative",
              borderRadius: 4,
              overflow: "hidden",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              marginBottom: 6,
              backgroundColor: "rgba(255,255,255,0.03)",
            }}
          >
            <img
              src={book.coverUrl}
              alt={book.title}
              loading="lazy"
              style={{ width: "100%", aspectRatio: "2 / 3", objectFit: "cover", display: "block" }}
            />
            <div
              style={{
                position: "absolute",
                top: 4,
                right: 4,
                background: "rgba(0,0,0,0.65)",
                backdropFilter: "blur(4px)",
                borderRadius: 4,
                padding: "2px 5px",
                fontSize: 10,
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                gap: 2,
              }}
            >
              <span style={{ color: colors.accent, fontSize: 9 }}>★</span>
              {book.rating}
            </div>
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
              <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.2">
                <path d="M3.5 1.5H1.5v9h9v-2M7 1.5h3.5V5M5 7l6-5.5" />
              </svg>
              litres.ru
            </div>
          </div>
          <div
            style={{
              fontSize: 12,
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
              fontSize: 11,
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
