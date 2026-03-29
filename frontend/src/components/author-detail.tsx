import { Book } from "../types";
import { colors, fonts } from "../theme";
import BookCard from "./book-card";
import BookRail from "./book-rail";

export default function AuthorDetail({
  author,
  books,
}: {
  author: { id: number; name: string; bookCount: number; tags: string[] };
  books: Book[];
}) {
  // Group books by series
  const seriesMap = new Map<string, Book[]>();
  const standalone: Book[] = [];

  for (const book of books) {
    if (book.series) {
      const list = seriesMap.get(book.series) || [];
      list.push(book);
      seriesMap.set(book.series, list);
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
          <BookRail>
            {seriesBooks.map((book) => (
              <BookCard key={book.id} book={book} />
            ))}
          </BookRail>
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
          <BookRail>
            {standalone.map((book) => (
              <BookCard key={book.id} book={book} />
            ))}
          </BookRail>
        </div>
      )}
    </div>
  );
}
