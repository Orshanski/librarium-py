// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { setupFootnoteDocListeners } from "./reader-footnote-handler";

vi.mock("./reader-footnotes", () => ({
  isFootnoteRef: vi.fn(),
  injectFootnoteHitAreaStyle: vi.fn(),
}));

describe("setupFootnoteDocListeners", () => {
  it("click event updates lastClickX/Y refs (screen-relative)", () => {
    const doc = document.implementation.createHTMLDocument();
    const xRef = { current: 0 };
    const yRef = { current: 0 };

    setupFootnoteDocListeners(doc, xRef, yRef);

    const evt = new MouseEvent("click", { bubbles: true });
    Object.defineProperty(evt, "screenX", { value: 200 });
    Object.defineProperty(evt, "screenY", { value: 300 });
    Object.defineProperty(globalThis, "screenX", { value: 50, configurable: true });
    Object.defineProperty(globalThis, "screenY", { value: 100, configurable: true });

    doc.dispatchEvent(evt);

    expect(xRef.current).toBe(150); // 200 - 50
    expect(yRef.current).toBe(200); // 300 - 100
  });

  it("invokes injectFootnoteHitAreaStyle once on setup", async () => {
    const { injectFootnoteHitAreaStyle } = await import("./reader-footnotes");
    vi.mocked(injectFootnoteHitAreaStyle).mockClear();
    const doc = document.implementation.createHTMLDocument();
    setupFootnoteDocListeners(doc, { current: 0 }, { current: 0 });
    expect(injectFootnoteHitAreaStyle).toHaveBeenCalledWith(doc);
  });
});
