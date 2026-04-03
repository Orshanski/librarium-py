import { Link } from "react-router-dom";
import { colors } from "../../theme";
import { BookCardProps } from "../book-card.types";

export default function MobileBookCard({ book, onRemove, href, progressPercent }: BookCardProps) {
  return (
    <Link
      to={href ?? `/book/${book.id}`}
      style={{ textDecoration: "none", color: "inherit", display: "block" }}
    >
      <div style={{ cursor: "pointer", minWidth: 0 }}>
        <div
          style={{
            position: "relative",
            borderRadius: 6,
            overflow: "hidden",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            marginBottom: 6,
            backgroundColor: "rgba(255,255,255,0.03)",
          }}
        >
          <img
            src={book.coverPath}
            alt={book.title}
            loading="lazy"
            style={{
              width: "100%",
              aspectRatio: "2 / 3",
              objectFit: "cover",
              display: "block",
            }}
          />
          {progressPercent != null && (
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, backgroundColor: "rgba(0,0,0,0.4)" }}>
              <div style={{ height: "100%", width: `${progressPercent}%`, backgroundColor: colors.accent, transition: "width 0.2s" }} />
            </div>
          )}
          {onRemove && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(); }}
              style={{
                position: "absolute", top: 0, left: 0, width: 44, height: 44,
                borderRadius: "50%", border: "none",
                backgroundColor: "rgba(0,0,0,0.65)", color: "#fff",
                fontSize: 14, cursor: "pointer", display: "flex",
                alignItems: "center", justifyContent: "center",
                transform: "translate(-6px, -6px)",
              }}
            >✕</button>
          )}
          {book.rating && (
            <div
              style={{
                position: "absolute",
                top: 4,
                right: 4,
                color: colors.accent,
                fontSize: 7,
                letterSpacing: 0.3,
              }}
            >
              {"★".repeat(book.rating)}
            </div>
          )}
        </div>

        <div
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: colors.text,
            lineHeight: 1.25,
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
          {book.authors.join(", ")}
        </div>

        {book.series && (
          <div
            style={{
              fontSize: 10,
              color: colors.textDim,
              marginTop: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
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
