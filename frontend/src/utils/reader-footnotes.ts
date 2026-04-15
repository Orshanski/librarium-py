// Selectors that identify a footnote-style link in rendered book content.
// Covers three markup conventions:
//   1. EPUB3 canonical: <a epub:type="noteref"> / biblioref / glossref,
//      either as a namespaced attribute (XHTML parse) or as a literal
//      attribute name (HTML parse) — we handle both.
//   2. ARIA doc-* roles — same spec as above, alt markup.
//   3. Superscript heuristic for FB2 / plain HTML — <sup><a></a></sup>
//      or <a><sup></sup></a>.
// Used by both isFootnoteRef() (for the foliate 'link' event) and
// injectFootnoteHitAreaStyle() (for touch hit-area expansion). Keep both
// in sync by editing this list in one place.
export const FOOTNOTE_REF_SELECTORS = [
  'a[href][epub\\:type~="noteref"]',
  'a[href][epub\\:type~="biblioref"]',
  'a[href][epub\\:type~="glossref"]',
  'a[href][epub|type~="noteref"]',
  'a[href][epub|type~="biblioref"]',
  'a[href][epub|type~="glossref"]',
  'a[href][role~="doc-noteref"]',
  'a[href][role~="doc-biblioref"]',
  'a[href][role~="doc-glossref"]',
  'sup a[href]',
  'a[href]:has(sup)',
];

// Check if a link is a footnote reference. The getAttributeNS lookup
// mirrors the namespaced epub:type selector in FOOTNOTE_REF_SELECTORS;
// the role / sup checks mirror the other selectors. Logic kept in JS
// (rather than a.matches(FOOTNOTE_REF_SELECTORS.join(','))) because
// matches() in an XHTML-parsed doc can't reach namespaced attrs
// without a declared CSS namespace — getAttributeNS can.
export function isFootnoteRef(a: Element): boolean {
  const epubType = a.getAttributeNS("http://www.idpf.org/2007/ops", "type") || "";
  const role = a.getAttribute("role") || "";
  if (["noteref", "biblioref", "glossref"].some(t => epubType.includes(t))) return true;
  if (["doc-noteref", "doc-biblioref", "doc-glossref"].some(r => role.includes(r))) return true;
  // Heuristic: superscript link
  if (a.matches("sup") || a.closest("sup") || (a.children.length === 1 && a.children[0]?.matches("sup"))) return true;
  return false;
}

// Value must match NEAREST_LINK_RADIUS in paginator.js #onTouchStart so
// both hit-expansion paths (native click via this overlay + our JS
// synthetic-tap guard) agree on what "near a footnote" means.
export const FOOTNOTE_HIT_EXPANSION_PX = 20;

// Inject a stylesheet into a book iframe document that expands the click
// hit area of footnote-style links. Books wrap footnote markers in tiny
// <sup> elements; the native touch hit-test (and by extension our own
// tap-zone guard in paginator.js) is too strict to catch off-by-a-few-
// pixels taps. A zero-size ::after overlay extends the hit box by
// FOOTNOTE_HIT_EXPANSION_PX in every direction without shifting layout
// (no line-height grow, no neighbour push). Native click then picks up
// the fuzzy hit via foliate's #handleLinks → 'link' event → popup.
//
// @namespace declaration is required so the [epub|type~=...] selectors
// match namespaced attributes in XHTML-parsed EPUB3 documents; the
// literal [epub\:type~=...] form covers HTML-parsed docs.
export function injectFootnoteHitAreaStyle(doc: Document): void {
  const MARKER = "data-librarium-footnote-hitarea";
  if (doc.head?.querySelector(`style[${MARKER}]`)) return; // idempotent
  const selectorList = FOOTNOTE_REF_SELECTORS.join(",\n  ");
  const afterSelectorList = FOOTNOTE_REF_SELECTORS.map(s => `${s}::after`).join(",\n  ");
  const style = doc.createElement("style");
  style.setAttribute(MARKER, "");
  style.textContent = `
    @namespace epub url(http://www.idpf.org/2007/ops);
    ${selectorList} {
      position: relative;
    }
    ${afterSelectorList} {
      content: "";
      position: absolute;
      inset: -${FOOTNOTE_HIT_EXPANSION_PX}px;
    }
  `;
  (doc.head ?? doc.documentElement).appendChild(style);
}
