import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import BookReadDownloadButtons from "../book-read-download-buttons";
import * as booksApi from "@/api/endpoints/books";

const formats = [
  { format: "EPUB", size: "1.2 MB" },
  { format: "FB2", size: "850 KB" },
  { format: "PDF", size: "5.4 MB" },
];

function withRouter(ui: React.ReactNode) {
  return <MemoryRouter>{ui}</MemoryRouter>;
}

describe("BookReadDownloadButtons", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing when there are no formats", () => {
    const { container } = render(
      withRouter(
        <BookReadDownloadButtons
          bookId={7}
          bookTitle="Карп, дракон и жук. Луна в тумане"
          formats={[]}
          readableFormats={["EPUB"]}
        />,
      ),
    );

    expect(container.firstChild).toBeNull();
  });

  it("renders Read links only for readable formats, case-insensitively", () => {
    render(
      withRouter(
        <BookReadDownloadButtons
          bookId={7}
          bookTitle="Карп, дракон и жук. Луна в тумане"
          formats={formats}
          readableFormats={["epub", "fb2"]}
        />,
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
          bookTitle="Карп, дракон и жук. Луна в тумане"
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
          bookTitle="Карп, дракон и жук. Луна в тумане"
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

  it("renders Download buttons for all formats", () => {
    render(
      withRouter(
        <BookReadDownloadButtons
          bookId={7}
          bookTitle="Карп, дракон и жук. Луна в тумане"
          formats={formats}
          readableFormats={["EPUB"]}
        />,
      ),
    );

    expect(screen.getByRole("button", { name: /Скачать EPUB/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Скачать FB2/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Скачать PDF/ })).toBeInTheDocument();
  });

  it("does not expose FB2 downloads as direct navigation links", () => {
    render(
      withRouter(
        <BookReadDownloadButtons
          bookId={7}
          bookTitle="Карп, дракон и жук. Луна в тумане"
          formats={[{ format: "FB2", size: "850 KB" }]}
          readableFormats={[]}
        />,
      ),
    );

    const button = screen.getByRole("button", { name: /Скачать FB2/ });
    expect(button).not.toHaveAttribute("href");
    expect(screen.queryByRole("link", { name: /Скачать FB2/ })).toBeNull();
    expect(screen.getByText("850 KB")).toBeInTheDocument();
  });

  it("downloads FB2 without navigating away from the app", async () => {
    const downloadSpy = vi
      .spyOn(booksApi, "downloadBook")
      .mockResolvedValue(new Blob(["fb2"], { type: "application/octet-stream" }));
    let clickedDownload = "";
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function captureDownloadName(this: HTMLAnchorElement) {
        clickedDownload = this.download;
      });
    const createUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:book-fb2");
    const revokeUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    render(
      withRouter(
        <BookReadDownloadButtons
          bookId={7}
          bookTitle="Карп, дракон и жук. Луна в тумане"
          formats={[{ format: "FB2", size: "850 KB" }]}
          readableFormats={[]}
        />,
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: /Скачать FB2/ }));

    await waitFor(() => expect(downloadSpy).toHaveBeenCalledWith(7, "FB2"));
    expect(clickedDownload).toBe("Карп, дракон и жук. Луна в тумане.fb2");
    expect(createUrlSpy).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeUrlSpy).toHaveBeenCalledWith("blob:book-fb2");
  });

  it("shares FB2 files when the browser supports file sharing", async () => {
    const downloadSpy = vi
      .spyOn(booksApi, "downloadBook")
      .mockResolvedValue(new Blob(["fb2"], { type: "application/octet-stream" }));
    const canShare = vi.fn().mockReturnValue(true);
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, canShare, share });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(
      withRouter(
        <BookReadDownloadButtons
          bookId={7}
          bookTitle="Карп, дракон и жук. Луна в тумане"
          formats={[{ format: "FB2", size: "850 KB" }]}
          readableFormats={[]}
        />,
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: /Скачать FB2/ }));

    await waitFor(() => expect(downloadSpy).toHaveBeenCalledWith(7, "FB2"));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(share.mock.calls[0][0].files[0].name).toBe("Карп, дракон и жук. Луна в тумане.fb2");
    expect(canShare).toHaveBeenCalled();
    expect(clickSpy).not.toHaveBeenCalled();
  });
});
