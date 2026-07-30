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

const OTHER_BOOK: Book = { ...BOOK, id: 43, title: "Турецкий гамбит" };

describe("AuthorDetail", () => {
  it("помечает книги, сохранённые офлайн", () => {
    renderWithProviders(
      <AuthorDetail
        author={{ id: 1, name: "Акунин", bookCount: 2, tags: [] }}
        books={[BOOK, OTHER_BOOK]}
        offlineBookIds={new Set([42])}
        bookLinkState={{ origin: { type: "author", url: "/authors/1", label: "Акунин" } }}
      />,
    );

    // Бейдж ровно один — у книги 42, она сохранена офлайн.
    expect(screen.getAllByTestId("cover-offline-badge")).toHaveLength(1);
  });
});
