import { Book } from "../types";
import { colors, fonts } from "../theme";
import BookCard from "./book-card";
import BookGrid from "./book-grid";
import { bookToBookCardCommonProps } from "./book-card-tokens";
import { useBookCardWidth } from "./use-book-card-width";
import type { ListOrigin } from "./breadcrumb-origin";

export default function AuthorDetail({
  author,
  books,
  offlineBookIds,
  bookLinkState,
}: Readonly<{
  author: { id: number; name: string; bookCount: number; tags: string[] };
  books: Book[];
  offlineBookIds: Set<number>;
  bookLinkState: { origin: ListOrigin };
}>) {
  const cardWidth = useBookCardWidth();

  // Group books by series
  const seriesMap = new Map<string, Book[]>();
  const standalone: Book[] = [];

  for (const book of books) {
    if (book.series) {
      const list = seriesMap.get(book.series.name) || [];
      list.push(book);
      seriesMap.set(book.series.name, list);
    } else {
      standalone.push(book);
    }
  }

  // Sort books within each series by number
  for (const [, list] of seriesMap) {
    list.sort((a, b) => (a.seriesNumber || 0) - (b.seriesNumber || 0));
  }

  return (
    <div>
      {/* Series sections */}
      {Array.from(seriesMap.entries()).map(([seriesName, seriesBooks]) => (
        <div key={seriesName} style={{ marginBottom: 36 }}>
          <h3
            style={{
              fontFamily: fonts.display,
              fontSize: 18,
              fontWeight: 600,
              color: colors.text,
              marginBottom: 14,
            }}
          >
            {seriesName}
          </h3>
          <BookGrid>
            {seriesBooks.map((book) => (
              <BookCard
                key={book.id}
                {...bookToBookCardCommonProps(book)}
                width={cardWidth}
                hasOffline={offlineBookIds.has(book.id)}
                linkState={bookLinkState}
              />
            ))}
          </BookGrid>
        </div>
      ))}

      {/* Standalone books */}
      {standalone.length > 0 && (
        <div style={{ marginBottom: 36 }}>
          <h3
            style={{
              fontFamily: fonts.display,
              fontSize: 18,
              fontWeight: 600,
              color: colors.text,
              marginBottom: 14,
            }}
          >
            Вне серий
          </h3>
          <BookGrid>
            {standalone.map((book) => (
              <BookCard
                key={book.id}
                {...bookToBookCardCommonProps(book)}
                width={cardWidth}
                hasOffline={offlineBookIds.has(book.id)}
                linkState={bookLinkState}
              />
            ))}
          </BookGrid>
        </div>
      )}
    </div>
  );
}
