import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { BookDetail, BookFormat } from "../../../types";
import type { BookDetailViewProps } from "../../book-detail.types";
import DesktopBookDetail from "../desktop-book-detail";

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
    description: "<p>Описание книги.</p>",
    language: "ru",
    publisher: "Росмэн",
    pubDate: "2001",
    tags: [
      { id: 1, name: "фэнтези" },
      { id: 2, name: "детское" },
    ],
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
    offlineSeriesBookIds: new Set<number>(),
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
    renderDesktop(
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

  it("renders download formats as buttons so the app does not navigate away", () => {
    renderDesktop(makeProps(makeBook(), false));

    expect(screen.getByRole("button", { name: /Скачать PDF/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Скачать PDF/ })).toBeNull();
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
    renderDesktop(makeProps(makeBook(), false, []));

    expect(screen.queryByRole("link", { name: /Читать/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Скачать/ })).toBeNull();
  });

  it("suppresses the series rail when there are no sibling series books", () => {
    renderDesktop(makeProps(makeBook(), false));

    expect(screen.queryByText(/Другие книги серии/)).toBeNull();
  });
});
