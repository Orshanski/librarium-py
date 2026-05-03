import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { Book } from "../../../types";
import type { BookDetailViewProps } from "../../book-detail.types";
import MobileBookDetail from "../mobile-book-detail";

function makeBook(overrides: Partial<Book> = {}): Book {
  return {
    id: 7,
    title: "Гарри Поттер и философский камень",
    authors: ["Дж. К. Роулинг"],
    series: "Гарри Поттер",
    seriesNumber: 1,
    tags: ["фэнтези"],
    rating: 4,
    isRead: false,
    language: "ru",
    coverPath: "/api/covers/7",
    description: "<p>Описание.</p>",
    publisher: "Росмэн",
    pubDate: "2001",
    formats: [
      { format: "EPUB", size: "1.2 MB" },
      { format: "PDF", size: "5.4 MB" },
    ],
    isbn: "978-5-353-00000-0",
    ...overrides,
  };
}

function makeProps(book: Book, isAdmin: boolean): BookDetailViewProps {
  return {
    book,
    seriesBooks: [],
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

  it("renders admin actions for admins", () => {
    renderMobile(makeProps(makeBook(), true));

    expect(screen.getByRole("link", { name: "Редактировать" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Удалить" })).toBeInTheDocument();
  });

  it("shows the first format compact line", () => {
    renderMobile(makeProps(makeBook(), false));

    expect(screen.getByText(/EPUB · 1.2 MB/)).toBeInTheDocument();
  });

  it("omits first format line and read/download links when there are no formats", () => {
    renderMobile(makeProps(makeBook({ formats: [] }), false));

    expect(screen.queryByText(/EPUB · /)).toBeNull();
    expect(screen.queryByRole("link", { name: /Читать/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Скачать/ })).toBeNull();
  });

  it("suppresses the series rail when there are no sibling series books", () => {
    renderMobile(makeProps(makeBook(), false));

    expect(screen.queryByText(/Другие книги серии/)).toBeNull();
  });
});
