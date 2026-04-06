import { useState, useEffect } from "react";
import { colors, fonts } from "../theme";
import { getCachedBooks, type CachedBook } from "../utils/offline-storage";
import { useIsMobile } from "../responsive";

export default function OfflineShell() {
  const [books, setBooks] = useState<CachedBook[]>([]);
  const [loading, setLoading] = useState(true);
  const isMobile = useIsMobile();

  useEffect(() => {
    getCachedBooks()
      .then((b) => {
        b.sort((a, c) => c.lastAccessedAt - a.lastAccessedAt);
        setBooks(b);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", backgroundColor: colors.bg, color: colors.textDim }}>
        Загрузка...
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", backgroundColor: colors.bg }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: isMobile ? "12px 16px" : "16px 24px",
        borderBottom: `1px solid ${colors.border}`,
      }}>
        <div style={{ fontFamily: fonts.display, fontSize: isMobile ? 18 : 22, fontWeight: 600, color: colors.text }}>
          Librarium
        </div>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          color: colors.textDim,
          background: "rgba(255, 255, 255, 0.04)",
          padding: "4px 12px",
          borderRadius: 12,
          border: `1px solid ${colors.border}`,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: colors.textDim }} />
          Оффлайн
        </div>
      </div>

      {books.length === 0 ? (
        <div style={{
          padding: isMobile ? "40px 16px" : "60px 24px",
          textAlign: "center",
          color: colors.textDim,
          fontSize: 14,
          lineHeight: 1.6,
        }}>
          <div style={{ fontSize: isMobile ? 36 : 48, marginBottom: 16, opacity: 0.3 }}>📚</div>
          Нет сохранённых книг<br />
          <span style={{ fontSize: isMobile ? 12 : 13, marginTop: 4, display: "inline-block" }}>
            Откройте книгу при подключении к сети —<br />она автоматически сохранится для чтения оффлайн
          </span>
        </div>
      ) : (
        <>
          <div style={{
            fontFamily: fonts.display,
            fontSize: isMobile ? 18 : 20,
            fontWeight: 600,
            padding: isMobile ? "16px 16px 0" : "20px 24px 0",
            color: colors.text,
          }}>
            Читаю сейчас
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "repeat(3, 1fr)" : "repeat(auto-fill, 150px)",
            gap: isMobile ? 12 : 24,
            padding: isMobile ? "12px 16px 16px" : "16px 24px 24px",
          }}>
            {books.map((book) => (
              <OfflineBookCard key={book.bookId} book={book} isMobile={isMobile} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function OfflineBookCard({ book, isMobile }: { book: CachedBook; isMobile: boolean }) {
  const [coverUrl, setCoverUrl] = useState<string | null>(null);

  useEffect(() => {
    if (book.coverBlob) {
      const url = URL.createObjectURL(book.coverBlob);
      setCoverUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [book.coverBlob]);

  const fmt = book.formats[0]?.format?.toLowerCase() || "epub";

  return (
    <a
      href={`/book/${book.bookId}/read/${fmt}`}
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <div style={{
        width: "100%",
        aspectRatio: "2 / 3",
        borderRadius: isMobile ? 6 : 4,
        overflow: "hidden",
        border: "1px solid rgba(255, 255, 255, 0.15)",
        backgroundColor: colors.card,
        marginBottom: isMobile ? 6 : 8,
      }}>
        {coverUrl && (
          <img
            src={coverUrl}
            alt={book.title}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        )}
      </div>
      <div style={{
        fontSize: isMobile ? 12 : 13,
        fontWeight: 500,
        color: colors.text,
        lineHeight: 1.3,
        display: "-webkit-box",
        WebkitLineClamp: 2,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
        marginBottom: 2,
      }}>
        {book.title}
      </div>
      <div style={{
        fontSize: isMobile ? 11 : 12,
        color: colors.textDim,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}>
        {book.authors.join(", ")}
      </div>
    </a>
  );
}
