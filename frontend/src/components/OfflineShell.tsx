import { useState, useEffect } from "react";
import { colors, fonts } from "../theme";
import type { Book } from "../types";
import { getOfflineBooks, getProgress, type OfflineBook } from "../utils/offline-storage";
import { setReadingFlag } from "../utils/readerFlag";
import { useIsMobile } from "../responsive";
import BookCard from "./book-card";
import { bookToBookCardCommonProps } from "./book-card-tokens";
import BookGrid from "./book-grid";
import { useBookCardWidth } from "./use-book-card-width";

const DEFAULT_READER_FORMAT = "epub";

function pickReaderFormat(book: OfflineBook): string {
  const first = book.formats[0]?.format;
  if (first) return first.toLowerCase();
  return DEFAULT_READER_FORMAT;
}

interface OfflineBooksData {
  books: OfflineBook[];
  progressMap: Map<number, number>;
  loading: boolean;
}

export function useOfflineBooks(): OfflineBooksData {
  const [books, setBooks] = useState<OfflineBook[]>([]);
  const [progressMap, setProgressMap] = useState<Map<number, number>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fetched = await getOfflineBooks();
        fetched.sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);
        if (cancelled) return;
        setBooks(fetched);
        const map = await loadProgressMap(fetched);
        if (cancelled) return;
        setProgressMap(map);
      } catch (err) {
        // IndexedDB unavailability or storage corruption: render empty offline shell
        // rather than crashing the whole app. Per-book progress errors are handled
        // separately in loadProgressMap.
        console.warn("OfflineShell: failed to load offline books:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { books, progressMap, loading };
}

async function loadProgressMap(books: OfflineBook[]): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  for (const book of books) {
    const p = await getProgress(book.bookId).catch(() => null);
    if (p) {
      // Спека (решение E): прогресс рисуется при любом значении, включая 0
      // (тонкая полоска как сигнал «книга открывалась»). Унифицировано с catalog desktop.
      map.set(book.bookId, Math.round(p.fraction * 100));
    }
  }
  return map;
}

export default function OfflineShell() {
  const { books, progressMap, loading } = useOfflineBooks();
  const isMobile = useIsMobile();

  if (loading) return <LoadingScreen />;

  return (
    <div style={{ minHeight: "100vh", backgroundColor: colors.bg, paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      <Header isMobile={isMobile} />
      {books.length === 0
        ? <EmptyState isMobile={isMobile} />
        : <BooksGrid books={books} progressMap={progressMap} isMobile={isMobile} />
      }
    </div>
  );
}

function LoadingScreen() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", backgroundColor: colors.bg, color: colors.textDim }}>
      Загрузка...
    </div>
  );
}

function Header({ isMobile }: Readonly<{ isMobile: boolean }>) {
  return (
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
  );
}

function EmptyState({ isMobile }: Readonly<{ isMobile: boolean }>) {
  return (
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
  );
}

interface BooksGridProps {
  books: OfflineBook[];
  progressMap: Map<number, number>;
  isMobile: boolean;
}

function BooksGrid({ books, progressMap, isMobile }: Readonly<BooksGridProps>) {
  const cardWidth = useBookCardWidth();
  return (
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
      <div style={{ padding: isMobile ? "12px 16px 16px" : "16px 24px 24px" }}>
        <BookGrid>
          {books.map((book) => (
            <OfflineBookGridItem
              key={book.bookId}
              book={book}
              progressPercent={progressMap.get(book.bookId)}
              cardWidth={cardWidth}
            />
          ))}
        </BookGrid>
      </div>
    </>
  );
}

interface OfflineBookGridItemProps {
  book: OfflineBook;
  progressPercent: number | undefined;
  cardWidth: number;
}

function OfflineBookGridItem({ book, progressPercent, cardWidth }: Readonly<OfflineBookGridItemProps>) {
  const [coverUrl, setCoverUrl] = useState<string | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(book.coverBlob);
    setCoverUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [book.coverBlob]);

  if (coverUrl == null) return null;

  // OfflineBook теперь несёт card-level поля (series, authors[].id и т.д.).
  // Конструируем view-Book с coverPath = blob URL — для оффлайна обложка
  // локальный ресурс; bookToBookCardCommonProps читает coverPath только в src.
  const viewBook: Book = {
    id: book.bookId,
    title: book.title,
    authors: book.authors,
    series: book.series,
    seriesNumber: book.seriesNumber,
    coverPath: coverUrl,
    rating: book.rating,
    isRead: book.isRead,
    tags: [],
  };

  return (
    <BookCard
      {...bookToBookCardCommonProps(viewBook)}
      width={cardWidth}
      progressPercent={progressPercent}
      hasOffline
      href={`/book/${book.bookId}/read/${pickReaderFormat(book)}`}
      onClick={setReadingFlag}
    />
  );
}
