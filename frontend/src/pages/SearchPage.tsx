import { useState, useEffect, useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";

import PageHeader from "../components/page-header";
import BookCard from "../components/book-card";
import BookGrid from "../components/book-grid";
import { colors, fonts } from "../theme";
import { saveBookOrigin } from "../utils/breadcrumb-state";
import { toBook, RawBook } from "../types";
import { useCachedBookIds } from "../hooks/useCachedBookIds";

function SearchResults() {
  const [searchParams] = useSearchParams();
  const q = searchParams.get("q") || "";

  const [results, setResults] = useState<{ books: RawBook[]; authors: { id: number; name: string; book_count: number }[]; series: { id: number; name: string; authors: string; book_count: number }[] } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!q.trim()) {
      setResults(null);
      return;
    }
    setLoading(true);
    fetch(`/api/search?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((data) => {
        setResults(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [q]);

  if (!q.trim()) {
    return <div style={{ fontSize: 14, color: colors.textDim, padding: 24 }}>Введите запрос в поле поиска</div>;
  }

  if (loading) {
    return <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>Поиск...</div>;
  }

  if (!results) return null;

  const { books = [], authors = [], series = [] } = results;
  const total = books.length + authors.length + series.length;

  const bookIds = useMemo(() => books.map((b) => b.id), [books]);
  const cachedBookIds = useCachedBookIds(bookIds);

  if (total === 0) {
    return <div style={{ fontSize: 14, color: colors.textDim, padding: 24 }}>По запросу «{q}» ничего не найдено</div>;
  }

  return (
    <div>
      {authors.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ fontFamily: fonts.display, fontSize: 18, fontWeight: 600, color: colors.text, marginBottom: 12 }}>Авторы</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {authors.map((a) => (
              <Link key={a.id} to={`/authors/${a.id}`} style={{ textDecoration: "none" }}>
                <div
                  style={{ display: "flex", justifyContent: "space-between", padding: "10px 16px", borderRadius: 6, transition: "background 0.1s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.04)")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  <span style={{ fontSize: 14, color: colors.text }}>{a.name}</span>
                  <span style={{ fontSize: 12, color: colors.textDim }}>{pluralize(a.book_count, "книга", "книги", "книг")}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {series.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ fontFamily: fonts.display, fontSize: 18, fontWeight: 600, color: colors.text, marginBottom: 12 }}>Серии</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {series.map((s) => (
              <Link key={s.id} to={`/series/${s.id}`} style={{ textDecoration: "none" }}>
                <div
                  style={{ padding: "10px 16px", borderRadius: 6, transition: "background 0.1s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.04)")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 14, color: colors.text, lineHeight: 1.35, marginBottom: s.authors ? 4 : 0 }}>
                        {s.name}
                      </div>
                      {s.authors && (
                        <div
                          style={{
                            fontSize: 12,
                            color: colors.textDim,
                            lineHeight: 1.4,
                            wordBreak: "break-word",
                          }}
                        >
                          {s.authors}
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: 12, color: colors.textDim, whiteSpace: "nowrap", flexShrink: 0, paddingTop: 2 }}>
                      {pluralize(s.book_count, "книга", "книги", "книг")}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {books.length > 0 && (
        <div>
          <h3 style={{ fontFamily: fonts.display, fontSize: 18, fontWeight: 600, color: colors.text, marginBottom: 12 }}>Книги</h3>
          <BookGrid>
            {books.map((b) => (
              <BookCard
                key={b.id}
                book={toBook(b)}
                isCached={cachedBookIds.has(b.id)}
              />
            ))}
          </BookGrid>
        </div>
      )}
    </div>
  );
}

function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return `${n} ${many}`;
  if (mod10 === 1) return `${n} ${one}`;
  if (mod10 >= 2 && mod10 <= 4) return `${n} ${few}`;
  return `${n} ${many}`;
}

export default function SearchPage() {
  useEffect(() => {
    saveBookOrigin("Поиск", "/search");
  }, []);

  return (
    <>
      <PageHeader title="Поиск" />
      <SearchResults />
    </>
  );
}
