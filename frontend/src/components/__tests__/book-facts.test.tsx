import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import BookFacts, { buildBookFacts } from "../book-facts";
import type { BookDetail } from "../../types";

const book: BookDetail = {
  id: 7,
  title: "Book",
  authors: [],
  series: { id: 1, name: "Series" },
  seriesNumber: 1,
  rating: null,
  isRead: false,
  coverPath: "/cover",
  sortTitle: null,
  description: null,
  language: "ru",
  publisher: "Publisher",
  pubDate: "2001",
  tags: [],
  addedAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

const gridTokens = {
  layout: "grid" as const,
  fontSize: 13,
  gap: "8px 16px",
  gridTemplateColumns: "auto 1fr",
  marginBottom: 28,
  labelColor: "#aaa",
  valueColor: "#eee",
};

const stackTokens = {
  layout: "stack" as const,
  labelFontSize: 10,
  labelLetterSpacing: "0.04em",
  labelMarginBottom: 2,
  labelColor: "#aaa",
  valueFontSize: 13,
  valueColor: "#eee",
  valueMarginBottom: 12,
  containerMarginBottom: 16,
};

describe("buildBookFacts", () => {
  it("builds facts without series and skips empty values", () => {
    expect(buildBookFacts({ ...book, language: "", publisher: null }, "isbn")).toEqual([
      { label: "Год", value: "2001" },
      { label: "ISBN", value: "isbn" },
    ]);
  });
});

describe("BookFacts", () => {
  it("renders grid facts", () => {
    render(<BookFacts facts={buildBookFacts(book, "isbn")} tokens={gridTokens} />);

    expect(screen.getByText("Язык")).toBeInTheDocument();
    expect(screen.getByText("ru")).toBeInTheDocument();
    expect(screen.queryByText("Серия")).toBeNull();
  });

  it("renders stack facts", () => {
    render(<BookFacts facts={buildBookFacts(book, "isbn")} tokens={stackTokens} />);

    expect(screen.getByText("Издатель")).toHaveStyle({ textTransform: "uppercase" });
    expect(screen.getByText("Publisher")).toBeInTheDocument();
  });

  it("renders nothing for an empty fact list", () => {
    const { container } = render(<BookFacts facts={[]} tokens={gridTokens} />);

    expect(container.firstChild).toBeNull();
  });
});
