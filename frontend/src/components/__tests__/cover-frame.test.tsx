// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import CoverFrame, { type CoverFrameTokens } from "../cover-frame";
import { COVER_FRAME_ASPECT_RATIO } from "../book-card-tokens";

const BASE_TOKENS: CoverFrameTokens = {
  width: 150,
  radius: 4,
  border: "1px solid rgba(255, 255, 255, 0.15)",
  marginBottom: 8,
};

describe("CoverFrame", () => {
  it("applies width from tokens to the frame", () => {
    const { container } = render(<CoverFrame src="/x.png" alt="cover" tokens={BASE_TOKENS} />);
    const frame = container.firstElementChild as HTMLElement;
    expect(frame.style.width).toBe("150px");
  });

  it("applies fixed aspect ratio (150 / 230) to the frame", () => {
    const { container } = render(<CoverFrame src="/x.png" alt="cover" tokens={BASE_TOKENS} />);
    const frame = container.firstElementChild as HTMLElement;
    expect(frame.style.aspectRatio).toMatch(/150\s*\/\s*230/);
    expect(COVER_FRAME_ASPECT_RATIO).toBe("150 / 230");
  });

  it("applies border, border-radius and margin-bottom from tokens", () => {
    const { container } = render(<CoverFrame src="/x.png" alt="cover" tokens={BASE_TOKENS} />);
    const frame = container.firstElementChild as HTMLElement;
    expect(frame.style.border).toBe("1px solid rgba(255, 255, 255, 0.15)");
    expect(frame.style.borderRadius).toBe("4px");
    expect(frame.style.marginBottom).toBe("8px");
    expect(frame.style.boxSizing).toBe("border-box");
  });

  it("applies opacity when provided in tokens", () => {
    const tokens: CoverFrameTokens = { ...BASE_TOKENS, opacity: 0.6 };
    const { container } = render(<CoverFrame src="/x.png" alt="cover" tokens={tokens} />);
    const frame = container.firstElementChild as HTMLElement;
    expect(frame.style.opacity).toBe("0.6");
  });

  it("renders the image with correct src, alt, lazy loading and fixed style", () => {
    const { container } = render(<CoverFrame src="/x.png" alt="cover-alt" tokens={BASE_TOKENS} />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("/x.png");
    expect(img.getAttribute("alt")).toBe("cover-alt");
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.style.width).toBe("auto");
    expect(img.style.height).toBe("100%");
    expect(img.style.maxWidth).toBe("100%");
    expect(img.style.display).toBe("block");
  });

  it("renders children inside the frame", () => {
    const { container } = render(
      <CoverFrame src="/x.png" alt="x" tokens={BASE_TOKENS}>
        <span data-testid="overlay">OV</span>
      </CoverFrame>,
    );
    expect(container.querySelector('[data-testid="overlay"]')).not.toBeNull();
  });
});
