// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import CoverProgressBar from "../cover-progress-bar";

describe("CoverProgressBar", () => {
  it("inner bar width = progressPercent% (50)", () => {
    const { container } = render(<CoverProgressBar progressPercent={50} />);
    const inner = container.querySelector("div > div > div") as HTMLElement;
    expect(inner.style.width).toBe("50%");
  });

  it("boundary values 0 and 100 render correctly", () => {
    const { container: c0 } = render(<CoverProgressBar progressPercent={0} />);
    expect((c0.querySelector("div > div > div") as HTMLElement).style.width).toBe("0%");

    const { container: c100 } = render(<CoverProgressBar progressPercent={100} />);
    expect((c100.querySelector("div > div > div") as HTMLElement).style.width).toBe("100%");
  });
});
