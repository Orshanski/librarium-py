// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DesktopBookCard from "../desktop-book-card";
import type { Book } from "../../../types";

const baseBook: Book = {
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

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("DesktopBookCard (composition)", () => {
  it("renders cover, title, authors, series with seriesNumber", () => {
    const { container } = renderWithRouter(<DesktopBookCard book={baseBook} />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/api/covers/7");
    expect(container.textContent).toContain("Война и мир");
    expect(container.textContent).toContain("Толстой Л.Н.");
    expect(container.textContent).toContain("Серия (2)");
  });

  it("rating → stars overlay rendered", () => {
    const { container } = renderWithRouter(<DesktopBookCard book={baseBook} />);
    expect(container.textContent).toContain("★★★★");
  });

  it("progressPercent != null → progressbar rendered", () => {
    const { container } = renderWithRouter(<DesktopBookCard book={baseBook} progressPercent={42} />);
    const inners = Array.from(container.querySelectorAll("div"))
      .filter((d) => (d as HTMLElement).style.width === "42%");
    expect(inners.length).toBe(1);
  });

  it("hasOffline → offline badge rendered (svg present)", () => {
    const { container } = renderWithRouter(<DesktopBookCard book={baseBook} hasOffline />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("onRemove → button click invokes callback with stopped propagation", () => {
    const onRemove = vi.fn();
    const { container } = renderWithRouter(<DesktopBookCard book={baseBook} onRemove={onRemove} />);
    const btn = container.querySelector("button")!;
    fireEvent.click(btn);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("no rating → stars not rendered", () => {
    const noRating: Book = { ...baseBook, rating: null };
    const { container } = renderWithRouter(<DesktopBookCard book={noRating} />);
    expect(container.textContent).not.toContain("★");
  });
});
