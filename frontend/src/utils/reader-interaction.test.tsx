// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { attachReaderInteraction } from "./reader-interaction";
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
});
