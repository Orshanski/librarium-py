// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import CoverFrame from "../cover-frame";

describe("CoverFrame", () => {
  const baseTokens = {
    radius: 4,
    border: "1px solid rgba(255, 255, 255, 0.15)",
    marginBottom: 8,
  };

  it("kind:fixed → img has height + width:auto + display:block + loading:lazy", () => {
    const { container } = render(
      <CoverFrame
        src="/x.png"
        alt="cover"
        tokens={{ ...baseTokens, sizing: { kind: "fixed", height: 230, width: "auto", maxWidth: "100%" } }}
      />,
    );
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("/x.png");
    expect(img.getAttribute("alt")).toBe("cover");
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.style.height).toBe("230px");
    expect(img.style.width).toBe("auto");
    expect(img.style.display).toBe("block");
    expect(img.style.maxWidth).toBe("100%");
  });

  it("kind:aspect → img has width:100% + aspectRatio + objectFit + display:block", () => {
    const { container } = render(
      <CoverFrame
        src="/x.png"
        alt="cover"
        tokens={{ ...baseTokens, sizing: { kind: "aspect", aspectRatio: "2 / 3", objectFit: "cover" } }}
      />,
    );
    const img = container.querySelector("img")!;
    expect(img.style.width).toBe("100%");
    expect(img.style.aspectRatio).toMatch(/2\s*\/\s*3/);
    expect(img.style.objectFit).toBe("cover");
    expect(img.style.display).toBe("block");
  });

  it("renders children inside the frame div", () => {
    const { container } = render(
      <CoverFrame
        src="/x.png"
        alt="x"
        tokens={{ ...baseTokens, sizing: { kind: "fixed", height: 230 } }}
      >
        <span data-testid="overlay">OV</span>
      </CoverFrame>,
    );
    expect(container.querySelector('[data-testid="overlay"]')).not.toBeNull();
  });
});
