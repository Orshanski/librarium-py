// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MobileBookCard from "../mobile-book-card";
import type { Book } from "../../../types";

const baseBook: Book = {
  id: 7,
  title: "Война и мир",
  authors: ["Толстой Л.Н."],
  series: null,
  seriesNumber: null,
  tags: [],
  rating: 5,
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

describe("MobileBookCard (composition)", () => {
  it("renders cover img with aspect-ratio 2/3", () => {
    const { container } = renderWithRouter(<MobileBookCard book={baseBook} />);
    const img = container.querySelector("img")!;
    expect(img.style.aspectRatio).toMatch(/2\s*\/\s*3/);
    expect(img.style.objectFit).toBe("cover");
  });

  it("title and authors rendered, series omitted when null", () => {
    const { container } = renderWithRouter(<MobileBookCard book={baseBook} />);
    expect(container.textContent).toContain("Война и мир");
    expect(container.textContent).toContain("Толстой Л.Н.");
  });

  it("hasOffline + progressPercent → both overlays rendered, offline bottom shifts to 7", () => {
    const { container, getByTestId } = renderWithRouter(
      <MobileBookCard book={baseBook} hasOffline progressPercent={50} />,
    );
    expect(container.querySelector("svg")).not.toBeNull();
    const offlineDiv = getByTestId("cover-offline-badge") as HTMLElement;
    expect(offlineDiv.style.bottom).toBe("7px");
  });

  it("onRemove button uses 44×44 tokens (touch-target)", () => {
    const onRemove = vi.fn();
    const { container } = renderWithRouter(<MobileBookCard book={baseBook} onRemove={onRemove} />);
    const btn = container.querySelector("button")! as HTMLElement;
    expect(btn.style.width).toBe("44px");
    expect(btn.style.height).toBe("44px");
    fireEvent.click(btn);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
