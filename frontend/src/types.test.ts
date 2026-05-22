import { describe, it, expect } from "vitest";
import type { Book, TagRef } from "./types";

describe("Book shape", () => {
  it("includes tags property as TagRef[]", () => {
    const book: Book = {
      id: 1,
      title: "Test",
      authors: [],
      series: null,
      seriesNumber: null,
      coverPath: "/api/covers/1?t=x",
      rating: null,
      isRead: false,
      tags: [{ id: 1, name: "Fiction" } satisfies TagRef],
    };
    expect(book.tags).toHaveLength(1);
    expect(book.tags[0].name).toBe("Fiction");
  });
});
