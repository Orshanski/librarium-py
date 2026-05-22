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
  tags: [],
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

  // Регрессия librarium-py-68oo: длинные nowrap-тексты authors/series раздували
  // inline-block link wrapper за пределы ширины карточки. Inner div теперь
  // несёт width={props.width} — это якорит блочный контекст для ellipsis.
  it("inner container is constrained to props.width", () => {
    const longBook: Book = {
      ...baselineBook,
      authors: [{ id: 1, name: "Очень-длинное-нерпереносимое-имя-автора-без-пробелов" }],
      series: { id: 1, name: "Очень длинное название серии расследований механического сыщика" },
    };
    const { container } = render(
      <MemoryRouter>
        <BookCard {...bookToBookCardCommonProps(longBook)} width={130} />
      </MemoryRouter>,
    );
    const innerDiv = container.querySelector("a > div") as HTMLElement;
    expect(innerDiv).toBeTruthy();
    expect(innerDiv.style.width).toBe("130px");
  });
});
