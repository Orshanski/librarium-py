// @vitest-environment jsdom
//
// Snapshot эталона DOM объединённого `BookCard` для каталога desktop.
// Фиксирует визуал после миграции 9 каллеров на единый компонент.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import BookCard from "../book-card";
import { CATALOG_COVER_WIDTH, bookToBookCardCommonProps } from "../book-card-tokens";
import type { Book } from "../../types";

const baselineBook: Book = {
  id: 7,
  title: "Война и мир",
  authors: [{ id: 1, name: "Толстой Л.Н." }],
  series: { id: 1, name: "Серия" },
  seriesNumber: 2,
  rating: 4,
  isRead: false,
  coverPath: "/api/covers/7",
};

describe("BookCard — golden baseline", () => {
  it("desktop catalog card: rating + progress + hasOffline", () => {
    const { container } = render(
      <MemoryRouter>
        <BookCard
          {...bookToBookCardCommonProps(baselineBook)}
          width={CATALOG_COVER_WIDTH}
          progressPercent={42}
          hasOffline
        />
      </MemoryRouter>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
