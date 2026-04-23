// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import FootnotePopup from "./FootnotePopup";
import type { ReaderSettings } from "../types/reader-settings";
import { DEFAULT_DESKTOP_TAP_ZONES } from "../constants/reader-defaults";

function makeSettings(overrides: Partial<ReaderSettings> = {}): ReaderSettings {
  return {
    fontSize: 16,
    lineSpacing: 1.5,
    fontFamily: "serif",
    flow: "paginated",
    theme: "dark",
    hyphenate: false,
    justify: false,
    desktopTapZones: DEFAULT_DESKTOP_TAP_ZONES,
    pdfTapZones: DEFAULT_DESKTOP_TAP_ZONES,
    ...overrides,
  };
}

function setViewportWidth(width: number) {
  Object.defineProperty(globalThis, "innerWidth", { value: width, configurable: true });
}

describe("FootnotePopup", () => {
  it("returns null when html is null (not in DOM)", () => {
    const { container } = render(
      <FootnotePopup html={null} side="left" settings={makeSettings()} />,
    );
    expect(container.querySelector(".footnote-popup")).toBeNull();
  });

  it("renders html content via dangerouslySetInnerHTML", () => {
    render(
      <FootnotePopup html="<p>footnote body</p>" side="left" settings={makeSettings()} />,
    );
    expect(screen.getByText("footnote body")).toBeInTheDocument();
  });

  it("narrow viewport (<=1000): popup fills both sides equally", () => {
    setViewportWidth(800);
    const { container } = render(
      <FootnotePopup html="<p>x</p>" side="left" settings={makeSettings()} />,
    );
    const popup = container.querySelector(".footnote-popup") as HTMLElement;
    expect(popup.style.left).toBe("5%");
    expect(popup.style.right).toBe("5%");
  });

  it("wide viewport + side=left: popup anchored to left half", () => {
    setViewportWidth(1400);
    const { container } = render(
      <FootnotePopup html="<p>x</p>" side="left" settings={makeSettings()} />,
    );
    const popup = container.querySelector(".footnote-popup") as HTMLElement;
    expect(popup.style.left).toBe("5%");
    expect(popup.style.right).toBe("55%");
  });

  it("wide viewport + side=right: popup anchored to right half", () => {
    setViewportWidth(1400);
    const { container } = render(
      <FootnotePopup html="<p>x</p>" side="right" settings={makeSettings()} />,
    );
    const popup = container.querySelector(".footnote-popup") as HTMLElement;
    expect(popup.style.left).toBe("55%");
    expect(popup.style.right).toBe("5%");
  });
});
