// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import PdfReader, { attachPdfInputListeners, attachPdfKeyboardListener } from "../pdf-reader";
import type { PdfReaderCallbacks } from "../pdf-reader";
import { DEFAULT_PDF_TAP_ZONES } from "../../constants/reader-defaults";

// Stub <foliate-view>: the real element needs pdf.js and a live iframe render.
// The stub keeps the element contract the component uses (open/goTo/close +
// "relocate"/"load" events) so page-index plumbing can be driven from tests.
vi.mock("../../vendor/foliate-js/view.js", () => {
  class StubFoliateView extends HTMLElement {
    renderer = { setAttribute: vi.fn(), destroy: vi.fn() };
    book = { toc: [] };
    open = vi.fn().mockResolvedValue(undefined);
    close = vi.fn();
    goTo = vi.fn().mockResolvedValue(undefined);
    prev = vi.fn().mockResolvedValue(undefined);
    next = vi.fn().mockResolvedValue(undefined);
  }
  customElements.define("foliate-view", StubFoliateView);
  return {};
});

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
  afterEach(() => { sb.cleanup(); });

  it("click in top-left → view.prev (DEFAULT_PDF_TAP_ZONES: topLeft=prev)", () => {
    dispatchClick(sb.doc, 100, 100);
    expect(sb.view.prev).toHaveBeenCalledTimes(1);
    expect(sb.view.next).not.toHaveBeenCalled();
    expect(sb.zoomIn).not.toHaveBeenCalled();
  });

  it("click in top-right → view.next", () => {
    dispatchClick(sb.doc, 900, 100);
    expect(sb.view.next).toHaveBeenCalledTimes(1);
  });

  it("click in top-center → zoomIn (DEFAULT_PDF_TAP_ZONES: topCenter=zoom_in)", () => {
    dispatchClick(sb.doc, 500, 100);
    expect(sb.zoomIn).toHaveBeenCalledTimes(1);
    expect(sb.view.prev).not.toHaveBeenCalled();
  });

  it("click in bottom-center → zoomOut (DEFAULT_PDF_TAP_ZONES: bottomCenter=zoom_out)", () => {
    dispatchClick(sb.doc, 500, 700);
    expect(sb.zoomOut).toHaveBeenCalledTimes(1);
  });

  it("click on a link is ignored (foliate handles link navigation)", () => {
    const a = sb.doc.createElement("a");
    a.href = "#section";
    sb.doc.body.appendChild(a);
    dispatchClick(sb.doc, 100, 100, a);
    expect(sb.view.prev).not.toHaveBeenCalled();
  });

  it("custom zones override defaults (topCenter remapped to next)", () => {
    sb.zonesRef.current = {
      ...DEFAULT_PDF_TAP_ZONES,
      topCenter: "next",
    };
    dispatchClick(sb.doc, 500, 100);
    expect(sb.view.next).toHaveBeenCalledTimes(1);
    expect(sb.zoomIn).not.toHaveBeenCalled();
  });
});

describe("attachPdfInputListeners — touch", () => {
  let sb: ReturnType<typeof makeSandbox>;
  beforeEach(() => { sb = makeSandbox(); });
  afterEach(() => { sb.cleanup(); });

  it("single tap (touchstart→touchend, no movement) fires zone action", () => {
    sb.doc.dispatchEvent(makeTouchEvent("touchstart", [{ clientX: 100, clientY: 100 }]));
    sb.doc.dispatchEvent(makeTouchEvent("touchend", [], [{ clientX: 100, clientY: 100 }]));
    expect(sb.view.prev).toHaveBeenCalledTimes(1);
  });

  it("touch with >10px movement is treated as a swipe (no zone action)", () => {
    sb.doc.dispatchEvent(makeTouchEvent("touchstart", [{ clientX: 100, clientY: 100, screenX: 100, screenY: 100 }]));
    sb.doc.dispatchEvent(makeTouchEvent("touchmove", [{ clientX: 200, clientY: 100, screenX: 200, screenY: 100 }]));
    sb.doc.dispatchEvent(makeTouchEvent("touchend", [], [{ clientX: 200, clientY: 100 }]));
    expect(sb.view.prev).not.toHaveBeenCalled();
    expect(sb.view.next).not.toHaveBeenCalled();
  });

  it("multi-touch (pinch) does not fire a zone action", () => {
    sb.doc.dispatchEvent(makeTouchEvent("touchstart", [
      { clientX: 100, clientY: 100 },
      { clientX: 200, clientY: 200 },
    ]));
    sb.doc.dispatchEvent(makeTouchEvent("touchend", [], [{ clientX: 100, clientY: 100 }]));
    expect(sb.view.prev).not.toHaveBeenCalled();
  });

  it("touch on a link is ignored (foliate handles link)", () => {
    const a = sb.doc.createElement("a");
    a.href = "#x";
    sb.doc.body.appendChild(a);
    sb.doc.dispatchEvent(makeTouchEvent("touchstart", [{ clientX: 100, clientY: 100, target: a }]));
    sb.doc.dispatchEvent(makeTouchEvent("touchend", [], [{ clientX: 100, clientY: 100, target: a }]));
    expect(sb.view.prev).not.toHaveBeenCalled();
  });

  it("synthesized click after touch is swallowed (touchActive guard)", () => {
    // Real iOS: touchstart → touchend → click. The click must not double-fire.
    sb.doc.dispatchEvent(makeTouchEvent("touchstart", [{ clientX: 100, clientY: 100 }]));
    sb.doc.dispatchEvent(makeTouchEvent("touchend", [], [{ clientX: 100, clientY: 100 }]));
    expect(sb.view.prev).toHaveBeenCalledTimes(1);
    // Now the synthesised click — must be ignored.
    dispatchClick(sb.doc, 100, 100);
    expect(sb.view.prev).toHaveBeenCalledTimes(1);
  });
});

interface StubbedView extends HTMLElement {
  goTo: ReturnType<typeof vi.fn>;
}

type RelocateHandler = NonNullable<PdfReaderCallbacks["onRelocate"]>;

/**
 * Renders PdfReader over the stubbed <foliate-view> and returns the element so
 * tests can drive "relocate" the way foliate does: section.current counts pages
 * from one (progress.js, SectionProgress.getProgress — every PDF page counts,
 * see pdf.js `size: 1000`), while goTo() takes an index counting from zero.
 */
async function renderPdfReader(props: { initialPage?: number; onRelocate?: RelocateHandler } = {}) {
  const { container } = render(
    <PdfReader
      bookBlob={new Blob(["%PDF-1.4"], { type: "application/pdf" })}
      initialPage={props.initialPage}
      pdfTapZones={DEFAULT_PDF_TAP_ZONES}
      callbacks={{ onRelocate: props.onRelocate }}
    />,
  );
  const view = container.querySelector("foliate-view") as StubbedView;
  await waitFor(() => expect(view.goTo).toHaveBeenCalled());
  return view;
}

function dispatchRelocate(view: HTMLElement, sectionCurrent: number, total = 122): void {
  view.dispatchEvent(new CustomEvent("relocate", {
    detail: {
      section: { current: sectionCurrent, total },
      fraction: sectionCurrent / total,
    },
  }));
}

describe("PdfReader page index — reported outward vs accepted inward", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("reports the page it opened at, not the next one", async () => {
    // The saved position (index 49 = page 50) is fed back in; foliate then
    // relocates on that page and reports section.current = 50. What comes out
    // must equal what went in, otherwise every open walks a page forward.
    const onRelocate = vi.fn<RelocateHandler>();
    const view = await renderPdfReader({ initialPage: 49, onRelocate });
    expect(view.goTo).toHaveBeenCalledWith(49);

    dispatchRelocate(view, 50);

    expect(onRelocate).toHaveBeenCalledTimes(1);
    // total passes through as-is — only the index shifts units.
    expect(onRelocate).toHaveBeenCalledWith(expect.objectContaining({ index: 49, total: 122 }));
  });

  it("reports zero on the first page", async () => {
    const onRelocate = vi.fn<RelocateHandler>();
    const view = await renderPdfReader({ onRelocate });
    expect(view.goTo).toHaveBeenCalledWith(0);

    dispatchRelocate(view, 1);

    expect(onRelocate).toHaveBeenCalledTimes(1);
    expect(onRelocate).toHaveBeenCalledWith(expect.objectContaining({ index: 0 }));
  });

  it("still reports a page only once when foliate relocates on it twice", async () => {
    // Catches a half-converted same-page filter: comparing against the raw
    // section.current while storing the converted index lets every repeat
    // (zoom re-render) through, because the two never match.
    const onRelocate = vi.fn<RelocateHandler>();
    const view = await renderPdfReader({ onRelocate });

    dispatchRelocate(view, 50);
    dispatchRelocate(view, 50);

    expect(onRelocate).toHaveBeenCalledTimes(1);
  });
});
