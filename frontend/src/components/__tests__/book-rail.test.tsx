// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("../../responsive", () => ({
  useIsMobile: vi.fn(),
}));

import { useIsMobile } from "../../responsive";
import BookRail from "../book-rail";

const mockUseIsMobile = vi.mocked(useIsMobile);

describe("BookRail (unified)", () => {
  it("desktop → tokens + hardcoded literals applied", () => {
    mockUseIsMobile.mockReturnValue(false);
    const { container } = render(
      <BookRail>
        <span>x</span>
      </BookRail>,
    );
    const div = container.firstChild as HTMLElement;
    expect(div.style.display).toBe("grid");
    expect(div.style.gridAutoFlow).toBe("column");
    expect(div.style.gridAutoColumns).toBe("150px");
    expect(div.style.gap).toBe("24px");
    expect(div.style.overflowX).toBe("auto");
    expect(div.style.paddingBottom).toBe("8px");
    expect(div.style.justifyContent).toBe("start");
  });

  it("mobile → mobile tokens applied", () => {
    mockUseIsMobile.mockReturnValue(true);
    const { container } = render(
      <BookRail>
        <span>x</span>
      </BookRail>,
    );
    const div = container.firstChild as HTMLElement;
    // jsdom normalizes `calc(... / 3)` to `calc(0.333... * ...)`. Functionally equivalent.
    expect(div.style.gridAutoColumns).toMatch(/calc\(.*100% - 24px.*\)/);
    expect(div.style.gap).toBe("12px");
  });
});
