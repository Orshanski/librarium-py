import { describe, expect, it } from "vitest";
import type { Book, BookDetail } from "../types";

describe("Book type — unified card-level shape", () => {
  it("Book has only card-level fields (no description/language/etc.)", () => {
    const book: Book = {
      id: 1,
      title: "X",
      authors: [{ id: 1, name: "A" }],
      series: null,
      seriesNumber: null,
      coverPath: "/cover",
      rating: null,
      isRead: false,
      tags: [],
    };

    expect(book.id).toBe(1);
    expect(book.authors).toEqual([{ id: 1, name: "A" }]);
    expect(book.series).toBeNull();
  });

  it("Book.series accepts SeriesRef object", () => {
    const book: Book = {
      id: 2,
      title: "Y",
      authors: [],
      series: { id: 5, name: "Серия" },
      seriesNumber: 3,
      coverPath: "/cover",
      rating: 4,
      isRead: true,
      tags: [],
    };

    expect(book.series?.name).toBe("Серия");
    expect(book.series?.id).toBe(5);
  });

  it("BookDetail extends Book with detail-only fields (tags as TagRef[])", () => {
    const detail: BookDetail = {
      id: 3,
      title: "Z",
      authors: [],
      series: null,
      seriesNumber: null,
      coverPath: "/cover",
      rating: null,
      isRead: false,
      sortTitle: null,
      description: "Описание",
      language: "ru",
      publisher: "Издательство",
      pubDate: "2024",
      tags: [{ id: 7, name: "роман" }],
      addedAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    };

    // BookDetail satisfies Book contract (structural subset).
    const asBook: Book = detail;
    expect(asBook.id).toBe(3);

    // Detail-only fields are accessible.
    expect(detail.description).toBe("Описание");
    expect(detail.tags[0].name).toBe("роман");
  });
});
