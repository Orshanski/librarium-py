// Cover-page image fit: scale the cover into the page column, width-driven, capped by
// the page content height, centered vertically. Pure (no DOM) so it is unit-tested with
// numbers — jsdom does not compute layout. See applyCoverFit below for the DOM glue.
//
// W      = columnWidth (one column, NOT the spread #layout.width).
// Hfull  = height (container height; the paginator's margins live OUTSIDE the container,
//          grid-rows `margin 1fr margin`) — the CENTERING base.
// Hcap   = Hfull - 2*margin — the SIZE cap (same as setImageSize's image cap, so the cover
//          keeps the same inner margin as other images). targetH never exceeds Hcap.
export const computeCoverFit = ({ columnWidth, height, margin, imgWidth, imgHeight }) => {
    const W = columnWidth
    const Hfull = height
    if (!(W > 0) || !(Hfull > 0) || !(imgWidth > 0) || !(imgHeight > 0)) return null
    const Hcap = Math.max(0, Hfull - 2 * margin)
    let targetW = W
    let targetH = W * (imgHeight / imgWidth)
    if (targetH > Hcap) {
        targetH = Hcap
        targetW = Hcap * (imgWidth / imgHeight)
    }
    const marginTop = Math.round((Hfull - targetH) / 2)
    return { width: Math.round(targetW), height: Math.round(targetH), marginTop }
}

// Find the cover image in a cover document and size it via computeCoverFit. Works for
// FB2 / synthetic-EPUB (`.cover-page img`) and native-EPUB (publisher's doc — fall back to
// the first <img>; a native cover may be SVG-wrapped or text-only, then there is no <img>
// and we do nothing, leaving the paginator's caps). Image dims come from naturalWidth/Height
// or the width/height attributes; if neither is known yet, retry once on image load.
export const applyCoverFit = (doc, layout) => {
    if (!doc?.body || !layout) return
    const img = doc.querySelector('.cover-page img') ?? doc.querySelector('img')
    if (!img) return
    const imgWidth = img.naturalWidth || Number(img.getAttribute('width')) || 0
    const imgHeight = img.naturalHeight || Number(img.getAttribute('height')) || 0
    if (!(imgWidth > 0) || !(imgHeight > 0)) {
        img.addEventListener('load', () => applyCoverFit(doc, layout), { once: true })
        return
    }
    const fit = computeCoverFit({
        columnWidth: layout.columnWidth, height: layout.height, margin: layout.margin,
        imgWidth, imgHeight,
    })
    if (!fit) return
    Object.assign(img.style, {
        width: `${fit.width}px`,
        height: `${fit.height}px`,
        marginTop: `${fit.marginTop}px`,
    })
}
