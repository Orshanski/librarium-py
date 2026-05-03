import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import BookActionButton from "../book-action-button";

function withRouter(ui: React.ReactNode) {
  return <MemoryRouter>{ui}</MemoryRouter>;
}

describe("BookActionButton", () => {
  it("renders a button root and triggers onClick", () => {
    const onClick = vi.fn();
    render(
      <BookActionButton kind="button" variant="neutral" onClick={onClick}>
        Test
      </BookActionButton>,
    );

    const button = screen.getByRole("button", { name: "Test" });
    expect(button.tagName).toBe("BUTTON");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders a React Router link with the target href", () => {
    render(
      withRouter(
        <BookActionButton kind="link" to="/book/7/read/epub" variant="accent">
          Читать EPUB
        </BookActionButton>,
      ),
    );

    expect(screen.getByRole("link", { name: "Читать EPUB" })).toHaveAttribute(
      "href",
      "/book/7/read/epub",
    );
  });

  it("invokes optional onClick for a React Router link", () => {
    const onClick = vi.fn();
    render(
      withRouter(
        <BookActionButton kind="link" to="/x" variant="accent" onClick={onClick}>
          X
        </BookActionButton>,
      ),
    );

    fireEvent.click(screen.getByRole("link", { name: "X" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders an anchor root with the target href", () => {
    render(
      <BookActionButton
        kind="anchor"
        href="/api/books/7/download?format=EPUB"
        variant="neutral"
      >
        Скачать EPUB
      </BookActionButton>,
    );

    expect(screen.getByRole("link", { name: /Скачать EPUB/ })).toHaveAttribute(
      "href",
      "/api/books/7/download?format=EPUB",
    );
  });

  it("renders aside text next to the main label", () => {
    render(
      <BookActionButton kind="anchor" href="/x" variant="neutral" aside="2.4 MB">
        Скачать EPUB
      </BookActionButton>,
    );

    expect(screen.getByText("Скачать EPUB")).toBeInTheDocument();
    expect(screen.getByText("2.4 MB")).toBeInTheDocument();
  });

  it("passes ARIA attributes to the button root", () => {
    render(
      <BookActionButton
        kind="button"
        variant="accent"
        onClick={() => {}}
        aria-haspopup="true"
        aria-expanded={true}
        aria-controls="menu-id"
      >
        На полку
      </BookActionButton>,
    );

    const button = screen.getByRole("button", { name: "На полку" });
    expect(button).toHaveAttribute("aria-haspopup", "true");
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(button).toHaveAttribute("aria-controls", "menu-id");
  });
});
