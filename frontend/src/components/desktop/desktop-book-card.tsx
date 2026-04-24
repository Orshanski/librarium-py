import { Link } from "react-router-dom";
import { colors } from "../../theme";
import { BookCardProps } from "../book-card.types";
import CloudBadge from "../cloud-badge";

export default function DesktopBookCard({ book, onRemove, href, onClick, progressPercent, hasOffline, linkState }: Readonly<BookCardProps>) {
  return (
    <Link
      to={href ?? `/book/${book.id}`}
      state={linkState}
      onClick={onClick}
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <div style={{ cursor: "pointer" }}>
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
            src={book.coverPath}
            alt={book.title}
            loading="lazy"
            style={{
              width: "auto",
              height: 230,
              maxWidth: "100%",
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
                position: "absolute", top: 4, left: 4, width: 22, height: 22,
                borderRadius: "50%", border: "none",
                backgroundColor: "rgba(0,0,0,0.6)", color: "#fff",
                fontSize: 12, cursor: "pointer", display: "flex",
                alignItems: "center", justifyContent: "center",
                opacity: 0.7, transition: "opacity 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.7")}
            >✕</button>
          )}
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
          {hasOffline && (
            <div style={{
              position: "absolute",
              bottom: progressPercent != null ? 7 : 6,
              right: 6,
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "rgba(249, 190, 3, 0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
              <CloudBadge hasOffline size={16} />
            </div>
          )}
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
          {book.authors.join(", ")}
        </div>

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
