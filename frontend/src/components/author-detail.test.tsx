// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import AuthorDetail from "./author-detail";
import type { Book } from "../types";

const BOOK: Book = {
  id: 42,
  title: "Азазель",
  authors: [{ id: 1, name: "Акунин" }],
  tags: [],
  series: null,
  seriesNumber: null,
  coverPath: "",
  rating: null,
  isRead: false,
};

const SERIES_BOOK: Book = {
  ...BOOK,
  id: 43,
  title: "Турецкий гамбит",
  series: { id: 9, name: "Фандорин" },
  seriesNumber: 2,
};

describe("AuthorDetail", () => {
  it("помечает книги, сохранённые офлайн", () => {
    renderWithProviders(
      <AuthorDetail
        author={{ id: 1, name: "Акунин", bookCount: 2, tags: [] }}
        books={[BOOK, SERIES_BOOK]}
        offlineBookIds={new Set([42, 43])}
        bookLinkState={{ origin: { type: "author", url: "/authors/1", label: "Акунин" } }}
      />,
    );

    // Две ветки отрисовки: книга вне серий и книга внутри секции серии.
    // Прошлая версия теста давала обеим книгам series: null и вторую ветку не проходила.
    expect(screen.getByText("Фандорин")).toBeInTheDocument();
    expect(screen.getByText("Вне серий")).toBeInTheDocument();
    expect(screen.getAllByTestId("cover-offline-badge")).toHaveLength(2);
  });
});
