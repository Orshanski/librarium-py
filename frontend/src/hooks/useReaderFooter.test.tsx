// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRef } from "react";
import { DEFAULT_DESKTOP_TAP_ZONES } from "../constants/reader-defaults";
import type { ReaderSettings } from "../types/reader-settings";
import { useReaderFooter } from "./useReaderFooter";

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

function makeContainer() {
  const container = document.createElement("div");
  Object.defineProperty(container, "getBoundingClientRect", {
    value: () => ({
      width: 800,
      height: 600,
      top: 0,
      left: 0,
      right: 800,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON: () => {},
    }),
  });
  return container;
}

describe("useReaderFooter cover state", () => {
  it("renders cover label instead of numeric page when current location is cover", () => {
    const foot = document.createElement("div");
    const container = makeContainer();

    const { result } = renderHook(() => {
      const containerRef = useRef(container);
      const settingsRef = useRef(makeSettings());
      const configRef = useRef({ showFooter: true });
      return useReaderFooter(containerRef, settingsRef, configRef);
    });

    result.current.startCharCount([{ charCount: 1600 }], () => false);
    result.current.updateFooter({ fraction: 0, isCover: true }, undefined, [foot]);

    expect(foot.textContent).toBe("Обложка");
  });

  it("excludes non-counted cover sections from virtual page totals", () => {
    const foot = document.createElement("div");
    const container = makeContainer();

    const { result } = renderHook(() => {
      const containerRef = useRef(container);
      const settingsRef = useRef(makeSettings());
      const configRef = useRef({ showFooter: true });
      return useReaderFooter(containerRef, settingsRef, configRef);
    });

    result.current.startCharCount([
      { charCount: 10_000, counted: false, isCover: true },
      { charCount: 1600 },
    ], () => false);
    result.current.updateFooter({ fraction: 0, isCover: false }, undefined, [foot]);

    expect(foot.textContent).toBe("1 / 2");
  });

  it("renders opening label instead of cover or numeric page on frontmatter", () => {
    const leftFoot = document.createElement("div");
    const rightFoot = document.createElement("div");
    const container = makeContainer();

    const { result } = renderHook(() => {
      const containerRef = useRef(container);
      const settingsRef = useRef(makeSettings());
      const configRef = useRef({ showFooter: true });
      return useReaderFooter(containerRef, settingsRef, configRef);
    });

    result.current.startCharCount([
      { charCount: 10_000, counted: false, isCover: true },
      { charCount: 800, counted: false },
      { charCount: 1600 },
    ], () => false);
    result.current.updateFooter(
      { fraction: 0, isCover: false, isOpening: true },
      { label: "Обложка" },
      [leftFoot, rightFoot],
    );

    expect(leftFoot.textContent).toBe("");
    expect(rightFoot.textContent).toBe("Начало книги");
  });
});
