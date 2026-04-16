import type { ReaderSettings } from "../types/reader-settings";
import { DEFAULT_DESKTOP_TAP_ZONES } from "../constants/reader-defaults";
import { resolveDesktopZone, addCustomEventListener } from "./reader-input";
import type { NormalizedReaderInput, ReaderAction } from "./reader-input";
import type { ReaderTapDetail } from "../types/reader-events";
import type { NavigationController } from "./reader-navigation";
import type { ReaderViewElement } from "../types/reader-foliate";

interface InteractionConfig {
  isMobile: boolean;
}

interface InteractionCallbacks {
  onCenterTap: () => void;
  isFootnoteOpen: () => boolean;
  onDismissFootnote: () => void;
  getSettings: () => ReaderSettings;
}

/**
 * Creates interaction handlers for the reader and attaches event listeners.
 * Returns a cleanup function.
 */
export function attachReaderInteraction(
  view: ReaderViewElement,
  container: HTMLElement,
  nav: NavigationController,
  config: { current: InteractionConfig },
  callbacks: InteractionCallbacks,
): () => void {
  const resolveReaderAction = (input: NormalizedReaderInput): ReaderAction => {
    if (input.kind === "keyboard") {
      if (input.key === "ArrowLeft") return { type: "goLeft" };
      if (input.key === "ArrowRight") return { type: "goRight" };
      if (input.key === "ArrowUp" || input.key === "PageUp") return { type: "prev" };
      if (input.key === "ArrowDown" || input.key === "PageDown") return { type: "next" };
      return { type: "noop" };
    }

    const isLinkTarget = Boolean(input.target?.closest("a[href]"));
    if (callbacks.isFootnoteOpen() && !isLinkTarget) return { type: "dismissFootnote" };
    if (isLinkTarget) return { type: "followLink" };

    const rect = container.getBoundingClientRect();
    const xFrac = (input.x - rect.left) / rect.width;
    const yFrac = (input.y - rect.top) / rect.height;
    if (config.current.isMobile) {
      if (xFrac < 0.33) return { type: "prev" };
      if (xFrac > 0.67) return { type: "next" };
      return { type: "toggleToolbar" };
    }

    const zones = callbacks.getSettings().desktopTapZones ?? DEFAULT_DESKTOP_TAP_ZONES;
    const action = resolveDesktopZone(xFrac, yFrac, zones);
    if (action === "prev") return { type: "prev" };
    if (action === "next") return { type: "next" };
    return { type: "toggleToolbar" };
  };

  const performReaderAction = (action: ReaderAction): Promise<void> => {
    if (!nav.isInteractive() && action.type !== "followLink" && action.type !== "noop") return Promise.resolve();
    if (action.type === "prev") return nav.performNavigation({ type: "prev" });
    if (action.type === "next") return nav.performNavigation({ type: "next" });
    if (action.type === "goLeft") return nav.enqueueNavigation(() => view.goLeft());
    if (action.type === "goRight") return nav.enqueueNavigation(() => view.goRight());
    if (action.type === "toggleToolbar") {
      callbacks.onCenterTap();
      return Promise.resolve();
    }
    if (action.type === "dismissFootnote") {
      callbacks.onDismissFootnote();
      return Promise.resolve();
    }
    return Promise.resolve();
  };

  const dispatchInput = (input: NormalizedReaderInput): Promise<void> =>
    performReaderAction(resolveReaderAction(input));

  const removeTapListener = addCustomEventListener<ReaderTapDetail>(view, "tap", (e) => {
    void dispatchInput({
      kind: "tap",
      x: e.detail.screenX - window.screenX,
      y: e.detail.screenY - window.screenY,
      target: e.detail.target,
    });
  });

  const handleKeyDown = (e: KeyboardEvent) => {
    // Don't hijack keys when focus is inside an input/select/contenteditable (toolbar controls)
    const t = e.target;
    if (t instanceof HTMLElement) {
      const tag = t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable) return;
    }
    void dispatchInput({ kind: "keyboard", key: e.key });
  };
  document.addEventListener("keydown", handleKeyDown);

  return () => {
    removeTapListener();
    document.removeEventListener("keydown", handleKeyDown);
  };
}
