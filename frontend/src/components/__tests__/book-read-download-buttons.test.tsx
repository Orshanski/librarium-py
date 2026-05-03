import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import BookReadDownloadButtons from "../book-read-download-buttons";

const formats = [
  { format: "EPUB", size: "1.2 MB" },
  { format: "FB2", size: "850 KB" },
  { format: "PDF", size: "5.4 MB" },
];

function withRouter(ui: React.ReactNode) {
  return <MemoryRouter>{ui}</MemoryRouter>;
}

describe("BookReadDownloadButtons", () => {
  it("renders nothing when there are no formats", () => {
    const { container } = render(
      withRouter(<BookReadDownloadButtons bookId={7} formats={[]} readableFormats={["EPUB"]} />),
    );

    expect(container.firstChild).toBeNull();
  });

  it("renders Read links only for readable formats, case-insensitively", () => {
    render(
      withRouter(
        <BookReadDownloadButtons bookId={7} formats={formats} readableFormats={["epub", "fb2"]} />,
      ),
    );

    expect(screen.getByRole("link", { name: "Читать EPUB" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Читать FB2" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Читать PDF" })).toBeNull();
  });

  it("uses /book/{id}/read/{format-lower} for read links", () => {
    render(
      withRouter(
        <BookReadDownloadButtons
          bookId={42}
          formats={[{ format: "EPUB", size: "1 MB" }]}
          readableFormats={["EPUB"]}
        />,
      ),
    );

    expect(screen.getByRole("link", { name: "Читать EPUB" })).toHaveAttribute(
      "href",
      "/book/42/read/epub",
    );
  });

  it("encodes the read route format path segment", () => {
    render(
      withRouter(
        <BookReadDownloadButtons
          bookId={7}
          formats={[{ format: "A/B", size: "1 MB" }]}
          readableFormats={["A/B"]}
        />,
      ),
    );

    expect(screen.getByRole("link", { name: "Читать A/B" })).toHaveAttribute(
      "href",
      "/book/7/read/a%2Fb",
    );
  });

  it("renders Download links for all formats", () => {
    render(
      withRouter(<BookReadDownloadButtons bookId={7} formats={formats} readableFormats={["EPUB"]} />),
    );

    expect(screen.getByRole("link", { name: /Скачать EPUB/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Скачать FB2/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Скачать PDF/ })).toBeInTheDocument();
  });

  it("uses the download API href and shows file size", () => {
    render(
      withRouter(
        <BookReadDownloadButtons
          bookId={7}
          formats={[{ format: "PDF", size: "5.4 MB" }]}
          readableFormats={[]}
        />,
      ),
    );

    expect(screen.getByRole("link", { name: /Скачать PDF/ })).toHaveAttribute(
      "href",
      "/api/books/7/download?format=PDF",
    );
    expect(screen.getByText("5.4 MB")).toBeInTheDocument();
  });

  it("encodes the format query parameter", () => {
    render(
      withRouter(
        <BookReadDownloadButtons
          bookId={7}
          formats={[{ format: "A&B", size: "1 MB" }]}
          readableFormats={[]}
        />,
      ),
    );

    expect(screen.getByRole("link", { name: /Скачать A&B/ })).toHaveAttribute(
      "href",
      "/api/books/7/download?format=A%26B",
    );
  });
});
