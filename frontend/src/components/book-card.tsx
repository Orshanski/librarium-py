import { Link } from "react-router-dom";
import { Book } from "../types";
import { colors } from "../theme";

export default function BookCard({ book }: { book: Book }) {
  return (
    <Link
      to={`/book/${book.id}`}
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <div style={{ cursor: "pointer" }}>
        {/* Cover */}
        <div
          style={{
            position: "relative",
            borderRadius: 4,
            overflow: "hidden",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            marginBottom: 8,
          }}
        >
          <img
            src={`/api/covers/${book.id}`}
            alt={book.title}
            loading="lazy"
            style={{
              width: "auto",
              height: 230,
              maxWidth: "100%",
              display: "block",
            }}
          />
          {/* Rating badge */}
          {book.rating && (
            <div
              style={{
                position: "absolute",
                top: 4,
                right: 4,
                color: colors.accent,
                fontSize: 8,
              }}
            >
              {"★".repeat(book.rating)}
            </div>
          )}
        </div>

        {/* Title */}
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

        {/* Author */}
        <div
          style={{
            fontSize: 12,
            color: colors.textDim,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {book.authors.join(", ")}
        </div>

        {/* Series */}
        {book.series && (
          <div
            style={{
              fontSize: 11,
              color: colors.textDim,
              marginTop: 1,
            }}
          >
            {book.series}
            {book.seriesNumber ? ` (${book.seriesNumber})` : ""}
          </div>
        )}
      </div>
    </Link>
  );
}
