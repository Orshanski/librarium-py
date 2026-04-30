import { useState, useEffect, useMemo } from "react";
import { useSearchParams, Link, useLocation } from "react-router-dom";

import PageHeader from "../components/page-header";
import BookCard from "../components/book-card";
import { bookToBookCardCommonProps } from "../components/book-card-tokens";
import { useBookCardWidth } from "../components/use-book-card-width";
import BookGrid from "../components/book-grid";
import { colors, fonts } from "../theme";
import { useScrollRestore } from "../hooks/useScrollRestore";
import { useOfflineBookIds } from "../hooks/useOfflineBookIds";
import { searchAll, searchHitToBook, type SearchResponse } from "../api/endpoints/search";

function SearchResults() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const q = searchParams.get("q") || "";

  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useScrollRestore(!loading);

  const searchLinkState = useMemo(
    () => ({
      origin: {
        type: "search" as const,
        url: location.pathname + location.search,
        label: "Поиск",
      },
    }),
    [location.pathname, location.search],
  );

  useEffect(() => {
    if (!q.trim()) {
      // Reset all state — including `loading`, in case a prior in-flight
      // query is about to resolve and would leave the spinner visible.
      setResults(null);
      setError(null);
      setLoading(false);
      return;
    }
    // AbortController ensures stale responses от previous query don't overwrite
    // the current one when the user types quickly (e.g. ?q=ab → ?q=abc before
    // the first request resolves). Cleanup aborts the in-flight request.
    const ctl = new AbortController();
    setLoading(true);
    setError(null);
    searchAll(q, ctl.signal)
      .then((data) => {
        setResults(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        // Abort is штатный control-flow — молча выходим, не показываем ошибку.
        // Check by `name` (not `instanceof DOMException`) — client.ts rethrows
        // AbortError as-is, and the concrete class varies between runtimes.
        if (err instanceof Error && err.name === "AbortError") return;
        setError("Ошибка поиска");
        setLoading(false);
      });
    return () => ctl.abort();
  }, [q]);

  const { books = [], authors = [], series = [] } = results || {};
  const bookIds = useMemo(() => books.map((b) => b.id), [books]);
  const offlineBookIds = useOfflineBookIds(bookIds);
  const cardWidth = useBookCardWidth();

  if (!q.trim()) {
    return <div style={{ fontSize: 14, color: colors.textDim, padding: 24 }}>Введите запрос в поле поиска</div>;
  }

  if (loading) {
    return <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>Поиск...</div>;
  }

  if (error) {
    return <div style={{ fontSize: 14, color: colors.text, padding: 24, backgroundColor: "rgba(255, 0, 0, 0.1)", borderRadius: 6, margin: 24 }}>{error}</div>;
  }

  if (!results) return null;

  const total = books.length + authors.length + series.length;

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
              <Link
                key={a.id}
                to={`/authors/${a.id}`}
                state={searchLinkState}
                style={{ textDecoration: "none" }}
              >
                <div
                  style={{ display: "flex", justifyContent: "space-between", padding: "10px 16px", borderRadius: 6, transition: "background 0.1s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.04)")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  <span style={{ fontSize: 14, color: colors.text }}>{a.name}</span>
                  <span style={{ fontSize: 12, color: colors.textDim }}>{pluralize(a.bookCount, "книга", "книги", "книг")}</span>
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
              <Link
                key={s.id}
                to={`/series/${s.id}`}
                state={searchLinkState}
                style={{ textDecoration: "none" }}
              >
                <div
                  style={{ padding: "10px 16px", borderRadius: 6, transition: "background 0.1s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.04)")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 14, color: colors.text, lineHeight: 1.35, marginBottom: s.authors && s.authors.length > 0 ? 4 : 0 }}>
                        {s.name}
                      </div>
                      {s.authors && s.authors.length > 0 && (
                        <div
                          style={{
                            fontSize: 12,
                            color: colors.textDim,
                            lineHeight: 1.4,
                            wordBreak: "break-word",
                          }}
                        >
                          {s.authors.map((a) => a.name).join(", ")}
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: 12, color: colors.textDim, whiteSpace: "nowrap", flexShrink: 0, paddingTop: 2 }}>
                      {pluralize(s.bookCount, "книга", "книги", "книг")}
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
            {books.map((b) => {
              const book = searchHitToBook(b);
              return (
                <BookCard
                  key={book.id}
                  {...bookToBookCardCommonProps(book)}
                  width={cardWidth}
                  hasOffline={offlineBookIds.has(book.id)}
                  linkState={searchLinkState}
                />
              );
            })}
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
  return (
    <>
      <PageHeader title="Поиск" />
      <SearchResults />
    </>
  );
}
