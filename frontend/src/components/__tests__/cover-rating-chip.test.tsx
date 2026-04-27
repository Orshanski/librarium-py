// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import CoverRatingChip from "../cover-rating-chip";

describe("CoverRatingChip", () => {
  it("renders ★ and rating value", () => {
    const { container } = render(
      <CoverRatingChip
        rating={4.7}
        tokens={{ top: 6, right: 6, padding: "2px 6px", fontSize: 11, iconFontSize: 10 }}
      />,
    );
    expect(container.textContent).toContain("★");
    expect(container.textContent).toContain("4.7");
  });

  it("tokens applied (top/right/padding/fontSize)", () => {
    const { container } = render(
      <CoverRatingChip
        rating={5}
        tokens={{ top: 4, right: 4, padding: "2px 5px", fontSize: 10, iconFontSize: 9 }}
      />,
    );
    const chip = container.firstChild as HTMLElement;
    expect(chip.style.top).toBe("4px");
    expect(chip.style.right).toBe("4px");
    expect(chip.style.padding).toBe("2px 5px");
    expect(chip.style.fontSize).toBe("10px");
  });
});
