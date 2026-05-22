// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { createElement } from "react";

vi.mock("@/api/endpoints/authors", () => ({
  getAuthor: vi.fn(),
}));

import { getAuthor } from "@/api/endpoints/authors";
import type { Book } from "@/types";
import { useAuthorPage } from "../useAuthorPage";

const mockedGetAuthor = getAuthor as ReturnType<typeof vi.fn>;

const MINIMAL_BOOK: Book = {
  id: 10,
  title: "Some Book",
  authors: [{ id: 1, name: "Test Author" }],
  tags: [],
  series: null,
  seriesNumber: null,
  coverPath: "",
  rating: null,
  isRead: false,
};

function wrapper({ children }: { children: React.ReactNode }) {
  return createElement(
    MemoryRouter,
    { initialEntries: ["/authors/1"] },
    createElement(Routes, null,
      createElement(Route, { path: "/authors/:id", element: children }),
    ),
  );
}

describe("useAuthorPage — bookCount derivation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it("reads bookCount from author.bookCount, not books.length (bug-catch)", async () => {
    // Mock: backend returns bookCount=42 but books array has only 1 item.
    // The old code (`books?.length ?? 0`) would return 1.
    // The correct code (`author.bookCount ?? 0`) must return 42.
    mockedGetAuthor.mockResolvedValue({
      author: {
        id: 1,
        name: "Test Author",
        sortName: "Author, Test",
        bookCount: 42,
        tags: [],
      },
      books: [MINIMAL_BOOK],
    });

    const { result } = renderHook(() => useAuthorPage(), { wrapper });

    await waitFor(() => {
      expect(result.current.author).not.toBeNull();
    });

    expect(result.current.author?.bookCount).toBe(42);
    expect(result.current.books).toHaveLength(1);
    // Confirm this is not books.length (which would be 1)
    expect(result.current.author?.bookCount).not.toBe(result.current.books.length);
  });
});
