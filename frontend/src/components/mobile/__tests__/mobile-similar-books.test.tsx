// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import MobileSimilarBooks from "../mobile-similar-books";
import type { SimilarBook } from "../../similar-books.types";

const books: SimilarBook[] = [
  {
    title: "Война и мир",
    authors: "Толстой Л.Н.",
    coverUrl: "https://litres/img/2.jpg",
    litresUrl: "https://litres.ru/war-peace",
    rating: 4.9,
    ratingCount: 9999,
  },
];

describe("MobileSimilarBooks (composition)", () => {
  it("renders cover with aspect-ratio 2/3, rating chip, title, authors, litres badge", () => {
    const { container } = render(<MobileSimilarBooks books={books} />);
    const img = container.querySelector("img")!;
    expect(img.style.aspectRatio).toMatch(/2\s*\/\s*3/);
    expect(container.textContent).toContain("Война и мир");
    expect(container.textContent).toContain("Толстой Л.Н.");
    expect(container.textContent).toContain("4.9");
    expect(container.textContent).toContain("litres.ru");
  });

  it("link target/rel correct", () => {
    const { container } = render(<MobileSimilarBooks books={books} />);
    const a = container.querySelector("a")!;
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noopener noreferrer");
  });
});
