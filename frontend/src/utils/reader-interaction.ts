import type { ReaderSettings } from "../types/reader-settings";
import { resolveDesktopZone, addCustomEventListener } from "./reader-input";
import type { NormalizedReaderInput, ReaderAction } from "./reader-input";
import type { ReaderLoadDetail, ReaderTapDetail } from "../types/reader-events";
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

/** Pure mapping from a keyboard event key to a reader action. */
export function resolveKeyboardAction(key: string): ReaderAction {
  if (key === "ArrowLeft") return { type: "goLeft" };
  if (key === "ArrowRight") return { type: "goRight" };
  if (key === "ArrowUp" || key === "PageUp") return { type: "prev" };
  if (key === "ArrowDown" || key === "PageDown") return { type: "next" };
  return { type: "noop" };
}

interface TapResolutionInput {
  tap: Extract<NormalizedReaderInput, { kind: "tap" }>;
  containerRect: DOMRect;
  isMobile: boolean;
  settings: ReaderSettings;
  footnoteOpen: boolean;
}

/**
 * Pure mapping from a tap (with surrounding context) to a reader action.
 * Order: link-target → footnote-dismiss → mobile zone → desktop tap-zone setting.
 */
export function resolveTapAction({ tap, containerRect, isMobile, settings, footnoteOpen }: TapResolutionInput): ReaderAction {
  const isLinkTarget = Boolean(tap.target?.closest("a[href]"));
  if (footnoteOpen && !isLinkTarget) return { type: "dismissFootnote" };
  if (isLinkTarget) return { type: "followLink" };

  const xFrac = (tap.x - containerRect.left) / containerRect.width;
  const yFrac = (tap.y - containerRect.top) / containerRect.height;

  if (isMobile) {
    if (xFrac < 0.33) return { type: "prev" };
    if (xFrac > 0.67) return { type: "next" };
    return { type: "toggleToolbar" };
  }

  const zoneAction = resolveDesktopZone(xFrac, yFrac, settings.desktopTapZones);
  if (zoneAction === "prev") return { type: "prev" };
  if (zoneAction === "next") return { type: "next" };
  return { type: "toggleToolbar" };
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
    if (input.kind === "keyboard") return resolveKeyboardAction(input.key);
    return resolveTapAction({
      tap: input,
      containerRect: container.getBoundingClientRect(),
      isMobile: config.current.isMobile,
      settings: callbacks.getSettings(),
      footnoteOpen: callbacks.isFootnoteOpen(),
    });
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
      x: e.detail.screenX - globalThis.screenX,
      y: e.detail.screenY - globalThis.screenY,
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

  // keydown does not bubble out of the foliate-view's iframe once focus moves into the
  // book content (Chrome + Safari), so the host-document listener above goes silent after
  // the first click. Subscribe inside the iframe doc too, same as the PDF reader does.
  // Per-doc listener is never removed — the iframe doc dies with the view.
  const removeLoadKeyboardListener = addCustomEventListener<ReaderLoadDetail>(view, "load", (e) => {
    e.detail?.doc?.addEventListener("keydown", handleKeyDown);
  });

  return () => {
    removeTapListener();
    removeLoadKeyboardListener();
    document.removeEventListener("keydown", handleKeyDown);
  };
}
