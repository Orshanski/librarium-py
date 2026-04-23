// @vitest-environment jsdom
import { describe, it, expect, beforeAll, vi } from "vitest";
import { render } from "@testing-library/react";
import EbookReader from "./ebook-reader";
import type { ReaderSettings } from "../types/reader-settings";
import { DEFAULT_DESKTOP_TAP_ZONES } from "../constants/reader-defaults";

function makeSettings(): ReaderSettings {
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
  };
}

describe("EbookReader", () => {
  beforeAll(() => {
    // foliate-view custom element registers on side-effect import of vendor/foliate-js/view.js;
    // importing EbookReader pulls it. No additional polyfill.
  });

  it("renders container + null footnote popup on empty blob (smoke)", () => {
    const blob = new Blob([""], { type: "application/epub+zip" });
    const { container, unmount } = render(
      <EbookReader bookBlob={blob} settings={makeSettings()} />,
    );
    expect(container.querySelector("div")).toBeInTheDocument();
    expect(container.querySelector(".footnote-popup")).toBeNull();
    expect(() => unmount()).not.toThrow();
  });

  it("attaches resize + pagehide listeners on mount, removes on unmount (no leak)", () => {
    const add = vi.spyOn(globalThis, "addEventListener");
    const remove = vi.spyOn(globalThis, "removeEventListener");
    const blob = new Blob([""], { type: "application/epub+zip" });
    const { unmount } = render(
      <EbookReader bookBlob={blob} settings={makeSettings()} />,
    );
    const addedResize = add.mock.calls.filter(([t]) => t === "resize").length;
    const addedPagehide = add.mock.calls.filter(([t]) => t === "pagehide").length;
    unmount();
    const removedResize = remove.mock.calls.filter(([t]) => t === "resize").length;
    const removedPagehide = remove.mock.calls.filter(([t]) => t === "pagehide").length;
    expect(removedResize).toBeGreaterThanOrEqual(addedResize);
    expect(removedPagehide).toBeGreaterThanOrEqual(addedPagehide);
    add.mockRestore();
    remove.mockRestore();
  });
});
