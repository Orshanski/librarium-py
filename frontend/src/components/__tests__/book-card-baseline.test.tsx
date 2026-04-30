// @vitest-environment jsdom
//
// Эталонный снимок DOM каталожной карточки на десктопе ДО рефакторинга
// в единый BookCard. Файл живёт в общем `__tests__/`, чтобы пережить
// удаление `desktop-book-card.tsx` + его тестов на этапе уборки и остаться
// точкой сравнения после миграции всех 9 каллеров на новый BookCard.
//
// Ожидаемые механические расхождения после миграции (план §3, §4, §«cover-frame.tsx»):
//   1. На обёртке `<Link>` появляется `display: block`.
//   2. На внутреннем `<div>` появляется `min-width: 0`.
//   3. Корневой `<div>` рамки получает `box-sizing: border-box`.
//   4. Корневой `<div>` рамки получает явные `width: 150px` и
//      `aspect-ratio: 150 / 230`; высота вычисляется браузером.
//   5. У `<img>` `height: 230px` меняется на `height: 100%` (от высоты рамки).
//   6. У `<img>` остаётся `width: auto` и `max-width: 100%`,
//      `display: block` — без изменений.
//
// Любые иные диффы между этим снимком и состоянием после миграции —
// неожиданные и требуют разбора (regression).
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DesktopBookCard from "../desktop/desktop-book-card";
import type { Book } from "../../types";

const baselineBook: Book = {
  id: 7,
  title: "Война и мир",
  authors: ["Толстой Л.Н."],
  series: "Серия",
  seriesNumber: 2,
  tags: [],
  rating: 4,
  isRead: false,
  language: "ru",
  coverPath: "/api/covers/7",
  description: null,
  publisher: null,
  pubDate: null,
  formats: [],
  isbn: null,
};

describe("BookCard extraction — golden baseline", () => {
  it("desktop catalog card: rating + progress + hasOffline", () => {
    const { container } = render(
      <MemoryRouter>
        <DesktopBookCard book={baselineBook} progressPercent={42} hasOffline />
      </MemoryRouter>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it("desktop shelf card: rating + onRemove (kept-state for ShelfPage migration)", () => {
    const noop = () => undefined;
    const { container } = render(
      <MemoryRouter>
        <DesktopBookCard book={baselineBook} onRemove={noop} />
      </MemoryRouter>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
