import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { Book } from "../../../types";
import type { BookDetailViewProps } from "../../book-detail.types";
import DesktopBookDetail from "../desktop-book-detail";

function makeBook(overrides: Partial<Book> = {}): Book {
  return {
    id: 7,
    title: "Гарри Поттер и философский камень",
    authors: ["Дж. К. Роулинг"],
    series: "Гарри Поттер",
    seriesNumber: 1,
    tags: ["фэнтези", "детское"],
    rating: 4,
    isRead: false,
    language: "ru",
    coverPath: "/api/covers/7",
    description: "<p>Описание книги.</p>",
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

function renderDesktop(props: BookDetailViewProps) {
  return render(
    <MemoryRouter>
      <DesktopBookDetail {...props} />
    </MemoryRouter>,
  );
}

describe("DesktopBookDetail composition", () => {
  it("renders all major domain blocks", () => {
    renderDesktop(makeProps(makeBook(), false));

    expect(screen.getByRole("img", { name: /Гарри Поттер/ })).toBeInTheDocument();
    expect(screen.getByText("Дж. К. Роулинг")).toBeInTheDocument();
    expect(screen.getByText(/книга 1/)).toBeInTheDocument();
    expect(screen.getByText(/Описание книги/)).toBeInTheDocument();
    expect(screen.getByText("фэнтези")).toBeInTheDocument();
    expect(screen.getByText("Язык")).toBeInTheDocument();
    expect(screen.getByText("Издатель")).toBeInTheDocument();
  });

  it("renders authors as plain accent text, not metadata pills", () => {
    renderDesktop(makeProps(makeBook({ authors: ["Автор 1", "Автор 2"] }), false));

    const authors = screen.getByTestId("desktop-book-authors");
    expect(authors).toHaveTextContent("Автор 1");
    expect(authors).toHaveTextContent("Автор 2");
  });

  it("links readable desktop formats to reader routes, including PDF", () => {
    renderDesktop(makeProps(makeBook(), false));

    expect(screen.getByRole("link", { name: "Читать EPUB" })).toHaveAttribute(
      "href",
      "/book/7/read/epub",
    );
    expect(screen.getByRole("link", { name: "Читать PDF" })).toHaveAttribute(
      "href",
      "/book/7/read/pdf",
    );
  });

  it("links download formats to the download API", () => {
    renderDesktop(makeProps(makeBook(), false));

    expect(screen.getByRole("link", { name: /Скачать PDF/ })).toHaveAttribute(
      "href",
      "/api/books/7/download?format=PDF",
    );
  });

  it("renders admin actions only for admins", () => {
    renderDesktop(makeProps(makeBook(), true));

    const adminActions = screen.getByTestId("desktop-book-admin-actions");
    expect(adminActions).toContainElement(screen.getByRole("link", { name: "Ред." }));
    expect(adminActions).toContainElement(screen.getByRole("button", { name: "Удалить" }));
  });

  it("omits admin actions for reader users", () => {
    renderDesktop(makeProps(makeBook(), false));

    expect(screen.queryByRole("link", { name: "Ред." })).toBeNull();
    expect(screen.queryByRole("button", { name: "Удалить" })).toBeNull();
  });

  it("renders no read or download links when there are no formats", () => {
    renderDesktop(makeProps(makeBook({ formats: [] }), false));

    expect(screen.queryByRole("link", { name: /Читать/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Скачать/ })).toBeNull();
  });

  it("suppresses the series rail when there are no sibling series books", () => {
    renderDesktop(makeProps(makeBook(), false));

    expect(screen.queryByText(/Другие книги серии/)).toBeNull();
  });
});
