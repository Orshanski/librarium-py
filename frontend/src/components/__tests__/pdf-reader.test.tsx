// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { attachPdfInputListeners, attachPdfKeyboardListener } from "../pdf-reader";
import { DEFAULT_PDF_TAP_ZONES } from "../../constants/reader-defaults";

interface TestView {
  prev: ReturnType<typeof vi.fn>;
  next: ReturnType<typeof vi.fn>;
}

function makeView(): TestView {
  return {
    prev: vi.fn().mockResolvedValue(undefined),
    next: vi.fn().mockResolvedValue(undefined),
  };
}

function makeKeyboardHandlers() {
  return {
    prev: vi.fn(),
    next: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
  };
}

function dispatchKey(target: EventTarget, key: string, opts: KeyboardEventInit = {}): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...opts }));
}

describe("attachPdfKeyboardListener", () => {
  it.each([
    ["ArrowLeft", "prev"],
    ["ArrowUp", "prev"],
    ["PageUp", "prev"],
    ["ArrowRight", "next"],
    ["ArrowDown", "next"],
    ["PageDown", "next"],
    ["+", "zoomIn"],
    ["=", "zoomIn"],
    ["-", "zoomOut"],
  ] as const)("key %s invokes handlers.%s", (key, handlerName) => {
    const handlers = makeKeyboardHandlers();
    const detach = attachPdfKeyboardListener(document, handlers);
    dispatchKey(document, key);
    expect(handlers[handlerName]).toHaveBeenCalledTimes(1);
    // Other handlers must stay untouched.
    for (const name of ["prev", "next", "zoomIn", "zoomOut"] as const) {
      if (name !== handlerName) expect(handlers[name]).not.toHaveBeenCalled();
    }
    detach();
  });

  it.each(["a", "Escape", "Enter", " ", "Tab"])("non-navigation key %s is ignored", (key) => {
    const handlers = makeKeyboardHandlers();
    const detach = attachPdfKeyboardListener(document, handlers);
    dispatchKey(document, key);
    expect(handlers.prev).not.toHaveBeenCalled();
    expect(handlers.next).not.toHaveBeenCalled();
    expect(handlers.zoomIn).not.toHaveBeenCalled();
    expect(handlers.zoomOut).not.toHaveBeenCalled();
    detach();
  });

  it("INPUT target suppresses navigation (typing in a search box)", () => {
    const handlers = makeKeyboardHandlers();
    const input = document.createElement("input");
    document.body.appendChild(input);
    const detach = attachPdfKeyboardListener(document, handlers);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(handlers.prev).not.toHaveBeenCalled();
    input.remove();
    detach();
  });

  it("contentEditable target suppresses navigation", () => {
    const handlers = makeKeyboardHandlers();
    const div = document.createElement("div");
    // jsdom doesn't reflect contenteditable="true" into isContentEditable — set directly.
    Object.defineProperty(div, "isContentEditable", { value: true, configurable: true });
    document.body.appendChild(div);
    const detach = attachPdfKeyboardListener(document, handlers);
    div.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(handlers.prev).not.toHaveBeenCalled();
    div.remove();
    detach();
  });

  it("detach() stops further events from firing handlers", () => {
    const handlers = makeKeyboardHandlers();
    const detach = attachPdfKeyboardListener(document, handlers);
    dispatchKey(document, "ArrowLeft");
    expect(handlers.prev).toHaveBeenCalledTimes(1);
    detach();
    dispatchKey(document, "ArrowLeft");
    expect(handlers.prev).toHaveBeenCalledTimes(1); // still 1 — listener removed
  });

  it("works on an arbitrary HTMLElement target (iframe doc surrogate)", () => {
    const handlers = makeKeyboardHandlers();
    const target = document.createElement("div");
    document.body.appendChild(target);
    const detach = attachPdfKeyboardListener(target, handlers);
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "PageDown" }));
    expect(handlers.next).toHaveBeenCalledTimes(1);
    detach();
    target.remove();
  });
});

/**
 * Build a sandbox where attachPdfInputListeners can be tested:
 * - host iframe (its contentDocument is the "doc" the listener attaches to)
 * - host container (the foliate-view shell — its rect drives tap-zone math)
 * - test view stub with prev/next as spies
 *
 * The iframe is positioned at (0,0) in the host doc, so iframe-coords == host-coords.
 */
function makeSandbox() {
  const iframe = document.createElement("iframe");
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;

  const container = document.createElement("div");
  document.body.appendChild(container);
  // Force a 1000x800 container at host origin so zone math is predictable.
  Object.defineProperty(container, "getBoundingClientRect", {
    value: () => ({ left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800, x: 0, y: 0, toJSON: () => ({}) } as DOMRect),
  });

  const view = makeView();
  const zonesRef = { current: DEFAULT_PDF_TAP_ZONES };
  const onCenterTap = vi.fn();
  const zoomIn = vi.fn();
  const zoomOut = vi.fn();

  // The iframe's bounding rect (used by handler to map iframe→host coords).
  // Keep it (0,0)-anchored so tests can pass clientX/Y straight through.
  Object.defineProperty(iframe, "getBoundingClientRect", {
    value: () => ({ left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800, x: 0, y: 0, toJSON: () => ({}) } as DOMRect),
  });

  attachPdfInputListeners({
    doc, container,
    view: view as unknown as Parameters<typeof attachPdfInputListeners>[0]["view"],
    zonesRef,
    onCenterTap, zoomIn, zoomOut,
  });

  function cleanup() {
    container.remove();
    iframe.remove();
  }

  return { doc, container, view, zonesRef, onCenterTap, zoomIn, zoomOut, cleanup };
}

function dispatchClick(doc: Document, clientX: number, clientY: number, target?: Element): void {
  // Two clicks because the handler installs both capture-phase (which records
  // coords) and bubble-phase (which acts on them) listeners on the same doc.
  // A single MouseEvent dispatch fires both.
  const event = new MouseEvent("click", { bubbles: true, cancelable: true, clientX, clientY });
  if (target) {
    target.dispatchEvent(event);
  } else {
    doc.body.dispatchEvent(event);
  }
}

interface TouchPoint {
  clientX: number;
  clientY: number;
  screenX?: number;
  screenY?: number;
  target?: Element | null;
}

function makeTouchEvent(type: string, touches: TouchPoint[], changedTouches: TouchPoint[] = touches): Event {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  const fill = (t: TouchPoint) => ({
    clientX: t.clientX, clientY: t.clientY,
    screenX: t.screenX ?? t.clientX,
    screenY: t.screenY ?? t.clientY,
    target: t.target ?? null,
  });
  Object.defineProperty(ev, "touches", { value: touches.map(fill) });
  Object.defineProperty(ev, "changedTouches", { value: changedTouches.map(fill) });
  return ev;
}

describe("attachPdfInputListeners — desktop click", () => {
  let sb: ReturnType<typeof makeSandbox>;
  beforeEach(() => { sb = makeSandbox(); });

  it("click in top-left → view.prev (DEFAULT_PDF_TAP_ZONES: topLeft=prev)", () => {
    dispatchClick(sb.doc, 100, 100);
    expect(sb.view.prev).toHaveBeenCalledTimes(1);
    expect(sb.view.next).not.toHaveBeenCalled();
    expect(sb.zoomIn).not.toHaveBeenCalled();
    sb.cleanup();
  });

  it("click in top-right → view.next", () => {
    dispatchClick(sb.doc, 900, 100);
    expect(sb.view.next).toHaveBeenCalledTimes(1);
    sb.cleanup();
  });

  it("click in top-center → zoomIn (DEFAULT_PDF_TAP_ZONES: topCenter=zoom_in)", () => {
    dispatchClick(sb.doc, 500, 100);
    expect(sb.zoomIn).toHaveBeenCalledTimes(1);
    expect(sb.view.prev).not.toHaveBeenCalled();
    sb.cleanup();
  });

  it("click in bottom-center → zoomOut (DEFAULT_PDF_TAP_ZONES: bottomCenter=zoom_out)", () => {
    dispatchClick(sb.doc, 500, 700);
    expect(sb.zoomOut).toHaveBeenCalledTimes(1);
    sb.cleanup();
  });

  it("click on a link is ignored (foliate handles link navigation)", () => {
    const a = sb.doc.createElement("a");
    a.href = "#section";
    sb.doc.body.appendChild(a);
    dispatchClick(sb.doc, 100, 100, a);
    expect(sb.view.prev).not.toHaveBeenCalled();
    sb.cleanup();
  });

  it("custom zones override defaults (topCenter remapped to next)", () => {
    sb.zonesRef.current = {
      ...DEFAULT_PDF_TAP_ZONES,
      topCenter: "next",
    };
    dispatchClick(sb.doc, 500, 100);
    expect(sb.view.next).toHaveBeenCalledTimes(1);
    expect(sb.zoomIn).not.toHaveBeenCalled();
    sb.cleanup();
  });
});

describe("attachPdfInputListeners — touch", () => {
  let sb: ReturnType<typeof makeSandbox>;
  beforeEach(() => { sb = makeSandbox(); });

  it("single tap (touchstart→touchend, no movement) fires zone action", () => {
    sb.doc.dispatchEvent(makeTouchEvent("touchstart", [{ clientX: 100, clientY: 100 }]));
    sb.doc.dispatchEvent(makeTouchEvent("touchend", [], [{ clientX: 100, clientY: 100 }]));
    expect(sb.view.prev).toHaveBeenCalledTimes(1);
    sb.cleanup();
  });

  it("touch with >10px movement is treated as a swipe (no zone action)", () => {
    sb.doc.dispatchEvent(makeTouchEvent("touchstart", [{ clientX: 100, clientY: 100, screenX: 100, screenY: 100 }]));
    sb.doc.dispatchEvent(makeTouchEvent("touchmove", [{ clientX: 200, clientY: 100, screenX: 200, screenY: 100 }]));
    sb.doc.dispatchEvent(makeTouchEvent("touchend", [], [{ clientX: 200, clientY: 100 }]));
    expect(sb.view.prev).not.toHaveBeenCalled();
    expect(sb.view.next).not.toHaveBeenCalled();
    sb.cleanup();
  });

  it("multi-touch (pinch) does not fire a zone action", () => {
    sb.doc.dispatchEvent(makeTouchEvent("touchstart", [
      { clientX: 100, clientY: 100 },
      { clientX: 200, clientY: 200 },
    ]));
    sb.doc.dispatchEvent(makeTouchEvent("touchend", [], [{ clientX: 100, clientY: 100 }]));
    expect(sb.view.prev).not.toHaveBeenCalled();
    sb.cleanup();
  });

  it("touch on a link is ignored (foliate handles link)", () => {
    const a = sb.doc.createElement("a");
    a.href = "#x";
    sb.doc.body.appendChild(a);
    sb.doc.dispatchEvent(makeTouchEvent("touchstart", [{ clientX: 100, clientY: 100, target: a }]));
    sb.doc.dispatchEvent(makeTouchEvent("touchend", [], [{ clientX: 100, clientY: 100, target: a }]));
    expect(sb.view.prev).not.toHaveBeenCalled();
    sb.cleanup();
  });

  it("synthesized click after touch is swallowed (touchActive guard)", () => {
    // Real iOS: touchstart → touchend → click. The click must not double-fire.
    sb.doc.dispatchEvent(makeTouchEvent("touchstart", [{ clientX: 100, clientY: 100 }]));
    sb.doc.dispatchEvent(makeTouchEvent("touchend", [], [{ clientX: 100, clientY: 100 }]));
    expect(sb.view.prev).toHaveBeenCalledTimes(1);
    // Now the synthesised click — must be ignored.
    dispatchClick(sb.doc, 100, 100);
    expect(sb.view.prev).toHaveBeenCalledTimes(1);
    sb.cleanup();
  });
});
