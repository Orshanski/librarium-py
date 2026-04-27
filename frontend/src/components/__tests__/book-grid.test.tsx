// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("../../responsive", () => ({
  useIsMobile: vi.fn(),
}));

import { useIsMobile } from "../../responsive";
import BookGrid from "../book-grid";

const mockUseIsMobile = vi.mocked(useIsMobile);

describe("BookGrid (unified)", () => {
  it("desktop → DESKTOP_BOOK_GRID tokens applied + display:grid hardcoded", () => {
    mockUseIsMobile.mockReturnValue(false);
    const { container } = render(
      <BookGrid>
        <span>x</span>
      </BookGrid>,
    );
    const div = container.firstChild as HTMLElement;
    expect(div.style.display).toBe("grid");
    expect(div.style.gridTemplateColumns).toBe("repeat(auto-fill, 150px)");
    expect(div.style.gap).toBe("24px");
  });

  it("mobile → MOBILE_BOOK_GRID tokens applied (incl. alignItems)", () => {
    mockUseIsMobile.mockReturnValue(true);
    const { container } = render(
      <BookGrid>
        <span>x</span>
      </BookGrid>,
    );
    const div = container.firstChild as HTMLElement;
    expect(div.style.gridTemplateColumns).toBe("repeat(3, minmax(0, 1fr))");
    expect(div.style.gap).toBe("12px");
    expect(div.style.alignItems).toBe("start");
  });
});
