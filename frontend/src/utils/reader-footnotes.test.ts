// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { isFootnoteRef, injectFootnoteHitAreaStyle } from "./reader-footnotes";

function makeElement(html: string): Element {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.firstElementChild!;
}

describe("isFootnoteRef", () => {
  it("returns true for role doc-noteref", () => {
    const a = makeElement('<a href="#n1" role="doc-noteref">1</a>');
    expect(isFootnoteRef(a)).toBe(true);
  });

  it("returns true for epub:type noteref (namespaced attribute)", () => {
    const a = document.createElementNS("http://www.w3.org/1999/xhtml", "a");
    a.setAttribute("href", "#fn1");
    a.setAttributeNS("http://www.idpf.org/2007/ops", "epub:type", "noteref");
    a.textContent = "1";
    document.body.appendChild(a);
    try {
      expect(isFootnoteRef(a)).toBe(true);
    } finally {
      a.remove();
    }
  });

  it("returns true for role doc-biblioref", () => {
    const a = makeElement('<a href="#b1" role="doc-biblioref">ref</a>');
    expect(isFootnoteRef(a)).toBe(true);
  });

  it("returns true for role doc-glossref", () => {
    const a = makeElement('<a href="#g1" role="doc-glossref">term</a>');
    expect(isFootnoteRef(a)).toBe(true);
  });

  it("returns true for sup > a (superscript heuristic)", () => {
    const container = document.createElement("div");
    container.innerHTML = '<sup><a href="#fn1">1</a></sup>';
    const a = container.querySelector("a")!;
    expect(isFootnoteRef(a)).toBe(true);
  });

  it("returns true for a > sup (superscript heuristic)", () => {
    const a = makeElement('<a href="#fn1"><sup>1</sup></a>');
    expect(isFootnoteRef(a)).toBe(true);
  });

  it("returns false for regular link", () => {
    const a = makeElement('<a href="/page">Link</a>');
    expect(isFootnoteRef(a)).toBe(false);
  });

  it("returns false for link with unrelated role", () => {
    const a = makeElement('<a href="/page" role="button">Click</a>');
    expect(isFootnoteRef(a)).toBe(false);
  });
});

describe("injectFootnoteHitAreaStyle", () => {
  it("injects style element into document head", () => {
    const doc = document.implementation.createHTMLDocument("test");
    injectFootnoteHitAreaStyle(doc);
    const style = doc.head.querySelector("style[data-librarium-footnote-hitarea]");
    expect(style).not.toBeNull();
    expect(style!.textContent).toContain("position: relative");
    expect(style!.textContent).toContain("inset: -20px");
  });

  it("is idempotent — second call does not duplicate", () => {
    const doc = document.implementation.createHTMLDocument("test");
    injectFootnoteHitAreaStyle(doc);
    injectFootnoteHitAreaStyle(doc);
    const styles = doc.head.querySelectorAll("style[data-librarium-footnote-hitarea]");
    expect(styles.length).toBe(1);
  });
});
