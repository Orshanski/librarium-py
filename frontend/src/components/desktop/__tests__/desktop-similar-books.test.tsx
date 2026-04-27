// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import DesktopSimilarBooks from "../desktop-similar-books";
import type { SimilarBook } from "../../similar-books.types";

const books: SimilarBook[] = [
  {
    title: "Анна Каренина",
    authors: "Толстой Л.Н., Шкловский В.",
    coverUrl: "https://litres/img/1.jpg",
    litresUrl: "https://litres.ru/anna-karenina",
    rating: 4.7,
    ratingCount: 12345,
  },
];

describe("DesktopSimilarBooks (composition)", () => {
  it("renders one card per book with cover, title, authors, rating chip, litres badge", () => {
    const { container } = render(<DesktopSimilarBooks books={books} />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://litres/img/1.jpg");
    expect(container.textContent).toContain("Анна Каренина");
    expect(container.textContent).toContain("Толстой Л.Н., Шкловский В.");
    expect(container.textContent).toContain("4.7");
    expect(container.textContent).toContain("litres.ru");
  });

  it("link uses litresUrl with target=_blank rel=noopener noreferrer", () => {
    const { container } = render(<DesktopSimilarBooks books={books} />);
    const a = container.querySelector("a")!;
    expect(a.getAttribute("href")).toBe("https://litres.ru/anna-karenina");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("litres badge has no inline opacity:0 (always visible)", () => {
    const { container } = render(<DesktopSimilarBooks books={books} />);
    const litresBadge = Array.from(container.querySelectorAll("div"))
      .find((d) => d.textContent?.includes("litres.ru"));
    expect(litresBadge).toBeDefined();
    expect((litresBadge as HTMLElement).style.opacity).toBe("");
  });
});
