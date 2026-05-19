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
          currentBookId={7}
          bookOrigin={{ type: "catalog", url: "/", label: "Каталог" }}
          seriesName="Series"
          tokens={tokens}
        />,
      ),
    );

    expect(container.firstChild).toBeNull();
  });

  it("renders a heading and book cards for multi-book series", () => {
    render(
      withRouter(
        <BookSeriesRail
          books={[baseBook, { ...baseBook, id: 8, title: "Book 2", coverPath: "/cover/8" }]}
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
