import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import BookSeriesRail from "../book-series-rail";
import type { Book } from "../../types";

const baseBook: Book = {
  id: 7,
  title: "Book 1",
  authors: [{ id: 1, name: "Author" }],
  series: { id: 1, name: "Series" },
  seriesNumber: 1,
  rating: null,
  isRead: false,
  coverPath: "/cover/7",
  tags: [],
};

const tokens = {
  titleFontSize: 20,
  titleFontWeight: 600,
  titleMarginBottom: 16,
  marginTop: 48,
};

function withRouter(ui: React.ReactNode) {
  return <MemoryRouter>{ui}</MemoryRouter>;
}

describe("BookSeriesRail", () => {
  it("renders nothing when there is only one book", () => {
    const { container } = render(
      withRouter(
        <BookSeriesRail
          books={[baseBook]}
          offlineBookIds={new Set()}
          currentBookId={7}
          bookOrigin={{ type: "catalog", url: "/", label: "Каталог" }}
          seriesName="Series"
          tokens={tokens}
        />,
      ),
    );

    expect(container.firstChild).toBeNull();
  });

  it("помечает книгу серии, сохранённую офлайн", () => {
    render(
      withRouter(
        <BookSeriesRail
          books={[baseBook, { ...baseBook, id: 8, title: "Book 2", coverPath: "/cover/8" }]}
          offlineBookIds={new Set([8])}
          currentBookId={7}
          bookOrigin={{ type: "catalog", url: "/", label: "Каталог" }}
          seriesName="Series"
          tokens={tokens}
        />,
      ),
    );

    // Бейдж ровно один — у книги 8, она сохранена офлайн.
    expect(screen.getAllByTestId("cover-offline-badge")).toHaveLength(1);
  });

  it("renders a heading and book cards for multi-book series", () => {
    render(
      withRouter(
        <BookSeriesRail
          books={[baseBook, { ...baseBook, id: 8, title: "Book 2", coverPath: "/cover/8" }]}
          offlineBookIds={new Set()}
          currentBookId={7}
          bookOrigin={{ type: "catalog", url: "/", label: "Каталог" }}
          seriesName="Series"
          tokens={tokens}
        />,
      ),
    );

    expect(screen.getByText("Другие книги серии «Series»")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Book 2/ })).toBeInTheDocument();
  });
});
