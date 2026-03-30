import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import Shell from "../components/shell";
import PageHeader from "../components/page-header";
import SimilarBooksGrid from "../components/similar-books-grid";
import { SimilarBook } from "../components/similar-books.types";
import { colors, fonts } from "../theme";
import { useIsMobile } from "../responsive";

export default function SimilarBooksPage() {
  const { id } = useParams();
  const isMobile = useIsMobile();
  const [book, setBook] = useState<{ id: number; title: string; authors: string | string[] } | null>(null);
  const [similar, setSimilar] = useState<SimilarBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch(`/api/books/${id}`).then((r) => r.json()).then((d) => d.book),
      fetch(`/api/books/${id}/similar`).then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      }),
    ])
      .then(([bookData, similarData]) => {
        if (cancelled) return;
        setBook(bookData);
        setSimilar(similarData.books || []);
        if (similarData.error === "service_unavailable") {
          setError(true);
        }
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [id]);

  return (
    <Shell>
      <PageHeader
        title="Похожие книги"
        breadcrumb={{ label: book?.title || "Книга", href: `/book/${id}` }}
      />

      {book && (
        <div
          style={{
            display: "flex",
            gap: isMobile ? 12 : 20,
            alignItems: "flex-start",
            marginBottom: isMobile ? 20 : 32,
            paddingBottom: isMobile ? 16 : 28,
            borderBottom: `1px solid ${colors.border}`,
          }}
        >
          <img
            src={`/api/covers/${book.id}?full=1`}
            alt={book.title}
            style={{
              width: isMobile ? 56 : 80,
              borderRadius: 4,
              border: "1px solid rgba(255,255,255,0.12)",
              flexShrink: 0,
            }}
          />
          <div style={{ minWidth: 0 }}>
            <h1
              style={{
                fontFamily: fonts.display,
                fontSize: isMobile ? 20 : 26,
                fontWeight: 600,
                lineHeight: 1.2,
                marginBottom: 4,
              }}
            >
              Похожие книги
            </h1>
            <div style={{ fontSize: isMobile ? 12 : 14, color: colors.textSecondary, marginBottom: 12 }}>
              по книге{" "}
              <Link to={`/book/${id}`} style={{ color: colors.text, textDecoration: "none", fontWeight: 500 }}>
                {book.title}
              </Link>
              {book.authors && (
                <span> — {typeof book.authors === "string" ? book.authors : book.authors.join(", ")}</span>
              )}
            </div>
            <div style={{ fontSize: isMobile ? 11 : 14, color: colors.textDim, lineHeight: 1.5 }}>
              Подборка на основе рекомендаций Litres. По клику откроется страница книги на litres.ru
            </div>
            <div style={{ fontSize: isMobile ? 10 : 11, color: colors.textDim, opacity: 0.6, marginTop: 8 }}>
              Данные: litres.ru
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: "center", padding: "60px 0", color: colors.textDim }}>
          <div
            style={{
              width: 32,
              height: 32,
              border: `3px solid ${colors.border}`,
              borderTopColor: colors.accent,
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
              margin: "0 auto 16px",
            }}
          />
          Ищем похожие книги на Litres...
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {!loading && error && (
        <div style={{ textAlign: "center", padding: "48px 0", color: colors.textDim, fontSize: 14 }}>
          Не удалось загрузить рекомендации. Сервис Litres недоступен.
          <br />
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 12,
              padding: "8px 20px",
              border: `1px solid ${colors.border}`,
              borderRadius: 6,
              background: "transparent",
              color: colors.textSecondary,
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Попробовать снова
          </button>
        </div>
      )}

      {!loading && !error && similar.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 0", color: colors.textDim, fontSize: 14 }}>
          <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.4 }}>📚</div>
          Похожих книг не найдено на Litres
        </div>
      )}

      {!loading && !error && similar.length > 0 && <SimilarBooksGrid books={similar} />}
    </Shell>
  );
}
