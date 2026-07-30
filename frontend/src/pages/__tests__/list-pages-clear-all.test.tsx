// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router-dom";
import { renderWithProviders } from "@/test/render";
import { metadataCache } from "@/cache";

vi.mock("@/api/endpoints/authors", () => ({
  listAuthors: vi.fn(() => Promise.resolve({ authors: [] })),
}));
vi.mock("@/api/endpoints/filters", () => ({
  listFilterOptions: vi.fn(() => Promise.resolve({
    authors: [{ id: 1, name: "Акунин" }],
    series: [{ id: 2, name: "Фандорин" }],
    tags: [{ id: 26, name: "Фантастика" }],
    languages: [{ name: "ru" }],
  })),
}));
vi.mock("@/api/endpoints/books", () => ({
  listBooks: vi.fn(() => Promise.resolve({ books: [], hasMore: false })),
}));

import AuthorsPage from "../AuthorsPage";
import CatalogPage from "../CatalogPage";

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="loc">{location.pathname + location.search}</div>;
}

describe("«Сбросить все» на страницах-списках", () => {
  beforeEach(() => {
    metadataCache.clear();
  });

  it("на списке авторов снимает единственный выбранный фильтр", async () => {
    renderWithProviders(
      <>
        <LocationProbe />
        <AuthorsPage />
      </>,
      { initialEntries: ["/authors?tagIds=26"] },
    );

    await userEvent.click(await screen.findByText("Сбросить все"));

    expect(screen.getByTestId("loc").textContent).toBe("/authors");
  });

  it("на списке авторов снимает оба фильтра за одно нажатие", async () => {
    renderWithProviders(
      <>
        <LocationProbe />
        <AuthorsPage />
      </>,
      { initialEntries: ["/authors?tagIds=26&language=ru"] },
    );

    await userEvent.click(await screen.findByText("Сбросить все"));

    expect(screen.getByTestId("loc").textContent).toBe("/authors");
  });

  it("на списке авторов снимает и ключ, для которого чипа нет", async () => {
    // authorIds на /authors чипом не показывается (filterKeys = tagIds, language),
    // но из адреса читается и в запрос уходит — сброс обязан убрать и его.
    renderWithProviders(
      <>
        <LocationProbe />
        <AuthorsPage />
      </>,
      { initialEntries: ["/authors?tagIds=26&authorIds=1"] },
    );

    await userEvent.click(await screen.findByText("Сбросить все"));

    expect(screen.getByTestId("loc").textContent).toBe("/authors");
  });

  it("в каталоге сброс фильтров сохраняет сортировку", async () => {
    renderWithProviders(
      <>
        <LocationProbe />
        <CatalogPage />
      </>,
      { initialEntries: ["/?sort=titleAsc&tagIds=26"] },
    );

    await userEvent.click(await screen.findByText("Сбросить все"));

    expect(screen.getByTestId("loc").textContent).toBe("/?sort=titleAsc");
  });
});
