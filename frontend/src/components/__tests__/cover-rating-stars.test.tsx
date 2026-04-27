// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import CoverRatingStars from "../cover-rating-stars";

describe("CoverRatingStars", () => {
  it("rating: 4 → 4 stars rendered", () => {
    const { container } = render(
      <CoverRatingStars rating={4} tokens={{ top: 4, right: 4, fontSize: 8 }} />,
    );
    expect(container.textContent).toBe("★★★★");
  });

  it("tokens applied to outer div (fontSize, letterSpacing)", () => {
    const { container } = render(
      <CoverRatingStars rating={3} tokens={{ top: 4, right: 4, fontSize: 7, letterSpacing: 0.3 }} />,
    );
    const el = container.firstChild as HTMLElement;
    expect(el.style.fontSize).toBe("7px");
    expect(el.style.letterSpacing).toBe("0.3px");
    expect(el.style.top).toBe("4px");
    expect(el.style.right).toBe("4px");
  });
});
