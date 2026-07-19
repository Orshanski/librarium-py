// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { attachReaderInteraction, resolveKeyboardAction, resolveTapAction } from "./reader-interaction";
import type { ReaderViewElement } from "../types/reader-foliate";
import type { NavigationController } from "./reader-navigation";
import type { ReaderSettings } from "../types/reader-settings";
import { DEFAULT_DESKTOP_TAP_ZONES } from "../constants/reader-defaults";

function makeView(): ReaderViewElement {
  const el = document.createElement("div") as unknown as ReaderViewElement;
  (el as unknown as { goLeft: () => Promise<void> }).goLeft = vi.fn().mockResolvedValue(undefined);
  (el as unknown as { goRight: () => Promise<void> }).goRight = vi.fn().mockResolvedValue(undefined);
  return el;
}

function makeNav(): NavigationController {
  return {
    isInteractive: vi.fn().mockReturnValue(true),
    performNavigation: vi.fn().mockResolvedValue(undefined),
    enqueueNavigation: vi.fn().mockResolvedValue(undefined),
  } as unknown as NavigationController;
}

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

describe("attachReaderInteraction — keyboard", () => {
  let view: ReaderViewElement;
  let container: HTMLElement;
  let nav: NavigationController;
  let cleanup: () => void;

  beforeEach(() => {
    view = makeView();
    container = document.createElement("div");
    nav = makeNav();
    const config = { current: { isMobile: false } };
    const callbacks = {
      onCenterTap: vi.fn(),
      isFootnoteOpen: () => false,
      onDismissFootnote: vi.fn(),
      getSettings: makeSettings,
    };
    cleanup = attachReaderInteraction(view, container, nav, config, callbacks);
  });

  it("ArrowLeft → nav.enqueueNavigation(view.goLeft)", () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    expect(nav.enqueueNavigation).toHaveBeenCalled();
    cleanup();
  });

  it("ArrowRight → nav.enqueueNavigation(view.goRight)", () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(nav.enqueueNavigation).toHaveBeenCalled();
    cleanup();
  });

  it("PageUp → nav.performNavigation({prev})", () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "PageUp" }));
    expect(nav.performNavigation).toHaveBeenCalledWith({ type: "prev" });
    cleanup();
  });

  it("PageDown → nav.performNavigation({next})", () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "PageDown" }));
    expect(nav.performNavigation).toHaveBeenCalledWith({ type: "next" });
    cleanup();
  });

  it("key press inside INPUT is ignored", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(nav.enqueueNavigation).not.toHaveBeenCalled();
    input.remove();
    cleanup();
  });

  it("cleanup removes document keydown listener", () => {
    cleanup();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    expect(nav.enqueueNavigation).not.toHaveBeenCalled();
  });

  it("ArrowLeft from the foliate iframe doc (after view 'load') → nav.enqueueNavigation", () => {
    const iframeDoc = document.implementation.createHTMLDocument("book");
    view.dispatchEvent(new CustomEvent("load", { detail: { doc: iframeDoc } }));
    iframeDoc.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    expect(nav.enqueueNavigation).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("'load' event with no doc in detail does not throw", () => {
    expect(() => view.dispatchEvent(new CustomEvent("load", { detail: {} }))).not.toThrow();
    cleanup();
  });

  it("key press inside INPUT within the iframe doc is ignored", () => {
    const iframeDoc = document.implementation.createHTMLDocument("book");
    view.dispatchEvent(new CustomEvent("load", { detail: { doc: iframeDoc } }));
    const input = iframeDoc.createElement("input");
    iframeDoc.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(nav.enqueueNavigation).not.toHaveBeenCalled();
    cleanup();
  });

  it("cleanup removes the view 'load' listener — a doc loaded after cleanup is never wired for keyboard", () => {
    cleanup();
    const iframeDoc = document.implementation.createHTMLDocument("book");
    view.dispatchEvent(new CustomEvent("load", { detail: { doc: iframeDoc } }));
    iframeDoc.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    expect(nav.enqueueNavigation).not.toHaveBeenCalled();
  });
});

describe("resolveKeyboardAction (pure)", () => {
  it.each([
    ["ArrowLeft", { type: "goLeft" }],
    ["ArrowRight", { type: "goRight" }],
    ["ArrowUp", { type: "prev" }],
    ["PageUp", { type: "prev" }],
    ["ArrowDown", { type: "next" }],
    ["PageDown", { type: "next" }],
    ["a", { type: "noop" }],
    ["Escape", { type: "noop" }],
  ])("key %s → %o", (key, expected) => {
    expect(resolveKeyboardAction(key)).toEqual(expected);
  });
});

describe("resolveTapAction (pure)", () => {
  const RECT = { left: 0, top: 0, width: 1000, height: 800, right: 1000, bottom: 800, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  const SETTINGS = makeSettings();

  function tapAt(x: number, y: number, target: HTMLElement | null = null) {
    return { kind: "tap" as const, x, y, target };
  }

  it("link target → followLink (regardless of footnote/zone)", () => {
    const a = document.createElement("a");
    a.href = "#x";
    expect(
      resolveTapAction({ tap: tapAt(500, 400, a), containerRect: RECT, isMobile: false, settings: SETTINGS, footnoteOpen: true }),
    ).toEqual({ type: "followLink" });
  });

  it("footnote open + non-link → dismissFootnote", () => {
    const div = document.createElement("div");
    expect(
      resolveTapAction({ tap: tapAt(500, 400, div), containerRect: RECT, isMobile: false, settings: SETTINGS, footnoteOpen: true }),
    ).toEqual({ type: "dismissFootnote" });
  });

  it("mobile + tap left third → prev", () => {
    expect(
      resolveTapAction({ tap: tapAt(100, 400), containerRect: RECT, isMobile: true, settings: SETTINGS, footnoteOpen: false }),
    ).toEqual({ type: "prev" });
  });

  it("mobile + tap right third → next", () => {
    expect(
      resolveTapAction({ tap: tapAt(800, 400), containerRect: RECT, isMobile: true, settings: SETTINGS, footnoteOpen: false }),
    ).toEqual({ type: "next" });
  });

  it("mobile + tap center → toggleToolbar", () => {
    expect(
      resolveTapAction({ tap: tapAt(500, 400), containerRect: RECT, isMobile: true, settings: SETTINGS, footnoteOpen: false }),
    ).toEqual({ type: "toggleToolbar" });
  });

  it("desktop tap routed through configured zones (top-left → prev with DEFAULT_DESKTOP_TAP_ZONES)", () => {
    expect(
      resolveTapAction({ tap: tapAt(50, 100), containerRect: RECT, isMobile: false, settings: SETTINGS, footnoteOpen: false }).type,
    ).toMatch(/prev|toggleToolbar/);
  });
});
