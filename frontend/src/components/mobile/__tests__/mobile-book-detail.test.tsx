import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { BookDetail, BookFormat } from "../../../types";
import type { BookDetailViewProps } from "../../book-detail.types";
import MobileBookDetail from "../mobile-book-detail";

function makeBook(overrides: Partial<BookDetail> = {}): BookDetail {
  return {
    id: 7,
    title: "Гарри Поттер и философский камень",
    authors: [{ id: 1, name: "Дж. К. Роулинг" }],
    series: { id: 1, name: "Гарри Поттер" },
    seriesNumber: 1,
    rating: 4,
    isRead: false,
    coverPath: "/api/covers/7",
    sortTitle: null,
    description: "<p>Описание.</p>",
    language: "ru",
    publisher: "Росмэн",
    pubDate: "2001",
    tags: [{ id: 1, name: "фэнтези" }],
    addedAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

const DEFAULT_FORMATS: BookFormat[] = [
  { format: "EPUB", size: "1.2 MB" },
  { format: "PDF", size: "5.4 MB" },
];

function makeProps(
  book: BookDetail,
  isAdmin: boolean,
  formats: BookFormat[] = DEFAULT_FORMATS,
  isbn: string | null = "978-5-353-00000-0",
): BookDetailViewProps {
  return {
    book,
    seriesBooks: [],
    formats,
    isbn,
    bookOrigin: { type: "catalog", url: "/", label: "Каталог" },
    isAdmin,
    rating: book.rating,
    isRead: book.isRead,
    onChangeRating: () => {},
    onToggleRead: () => {},
    onShowDeleteConfirm: () => {},
    hasOffline: false,
    offlineLoading: false,
    onToggleOffline: () => {},
    showOfflineToggle: false,
  };
}

function renderMobile(props: BookDetailViewProps) {
  return render(
    <MemoryRouter>
      <MobileBookDetail {...props} />
    </MemoryRouter>,
  );
}

describe("MobileBookDetail composition", () => {
  it("renders all major domain blocks", () => {
    renderMobile(makeProps(makeBook(), false));

    expect(screen.getByRole("img", { name: /Гарри Поттер/ })).toBeInTheDocument();
    expect(screen.getByText("Дж. К. Роулинг")).toBeInTheDocument();
    expect(screen.getByText(/Описание/)).toBeInTheDocument();
    expect(screen.getByText("фэнтези")).toBeInTheDocument();
  });

  it("renders authors as a plain comma-separated line", () => {
    renderMobile(
      makeProps(
        makeBook({
          authors: [
            { id: 1, name: "Автор 1" },
            { id: 2, name: "Автор 2" },
          ],
        }),
        false,
      ),
    );

    expect(screen.getByText("Автор 1, Автор 2")).toBeInTheDocument();
  });

  it("excludes PDF from mobile readable formats but keeps it downloadable", () => {
    renderMobile(makeProps(makeBook(), false));

    expect(screen.queryByRole("link", { name: "Читать PDF" })).toBeNull();
    expect(screen.getByRole("link", { name: "Читать EPUB" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Скачать PDF/ })).toBeInTheDocument();
  });

  it("mentions series once in the top block and not in BookFacts", () => {
    const { container } = renderMobile(makeProps(makeBook(), false));

    expect(container.querySelectorAll('[data-series-name="true"]')).toHaveLength(1);
    expect(screen.queryByText(/^Серия$/i)).toBeNull();
  });

  it("renders only the existing mobile delete admin action for admins", () => {
    renderMobile(makeProps(makeBook(), true));

    expect(screen.queryByRole("link", { name: "Редактировать" })).toBeNull();
    expect(screen.getByRole("button", { name: "Удалить" })).toBeInTheDocument();
  });

  it("shows the first format compact line", () => {
    renderMobile(makeProps(makeBook(), false));

    expect(screen.getByText(/EPUB · 1.2 MB/)).toBeInTheDocument();
  });

  it("omits first format line and read/download links when there are no formats", () => {
    renderMobile(makeProps(makeBook(), false, []));

    expect(screen.queryByText(/EPUB · /)).toBeNull();
    expect(screen.queryByRole("link", { name: /Читать/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Скачать/ })).toBeNull();
  });

  it("suppresses the series rail when there are no sibling series books", () => {
    renderMobile(makeProps(makeBook(), false));

    expect(screen.queryByText(/Другие книги серии/)).toBeNull();
  });
});
