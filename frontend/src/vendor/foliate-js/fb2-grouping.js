// Late keep-together grouping pass (kfl7 Phase 2). Runs after section splitting
// and front-matter handling, before render-section serialisation. Wraps small,
// bounded units in a neutral <div class="keep-together"> carrying
// `break-inside: avoid` (the only cross-engine keep-together; break-after is
// dead on WebKit). The wrapper never encloses a nested <section> (so section
// splitting and TOC recursion, which walk direct-child sections, are
// undisturbed) and never carries decorative styling. data-foliate-id stays on
// the title elements inside the wrapper; resolution is descendant-based.

const FRONT_MATTER_CLASSES = new Set(['epigraph', 'annotation'])

const isTitle = el => el?.nodeType === 1 && el.classList.contains('title')
const isFrontMatter = el => {
    if (el?.nodeType !== 1) return false
    if (el.tagName.toLowerCase() === 'img') return true
    for (const cls of el.classList) if (FRONT_MATTER_CLASSES.has(cls)) return true
    return false
}

const wrap = (ownerDoc, nodes) => {
    if (nodes.length === 0) return
    const box = ownerDoc.createElement('div')
    box.classList.add('keep-together')
    const parent = nodes[0].parentNode
    parent.insertBefore(box, nodes[0])
    for (const n of nodes) box.appendChild(n)
}

// Wrap the opening of a leaf section: the leading run of .title headers, the
// attached front matter (epigraph / annotation / opening image, in source
// order), and the first following content block. Never crosses a nested
// <section>.
const groupSectionOpening = (sectionEl) => {
    const ownerDoc = sectionEl.ownerDocument
    const children = Array.from(sectionEl.children)
    let i = 0
    const opening = []
    while (i < children.length && isTitle(children[i])) { opening.push(children[i]); i++ }
    if (opening.length === 0) return
    while (i < children.length && isFrontMatter(children[i])) { opening.push(children[i]); i++ }
    // first content block — only if it is not a nested section and not a poem
    // (poems have their own keep-together tail grouping; consuming a poem here
    // would break the .poem + br + .poem sibling relationship used by the CSS
    // run-spacing rules).
    // Known trade-off: when the first block IS a poem, the title is wrapped
    // alone, so a title that directly precedes a leading poem (no prose between)
    // can still orphan from the poem at a column edge. Accepted to keep poem runs
    // intact; flagged for visual acceptance on a real book.
    if (i < children.length) {
        const tag = children[i].tagName.toLowerCase()
        if (tag !== 'section' && !children[i].classList?.contains('poem')) {
            opening.push(children[i]); i++
        }
    }
    wrap(ownerDoc, opening)
}

// Wrap the OPENING of a cite/epigraph that leads with a label: the leading
// .subtitle run plus its first body line, so the label is not stranded at a
// column edge (same orphan failure mode as a section heading; fixture 27 has
// cites whose first line is exactly such a label).
const groupQuotationOpening = (groupEl) => {
    const ownerDoc = groupEl.ownerDocument
    const children = Array.from(groupEl.children)
    let i = 0
    const opening = []
    while (i < children.length && children[i].classList?.contains('subtitle')) {
        opening.push(children[i]); i++
    }
    if (opening.length === 0) return // no opening label to strand
    if (i < children.length) { opening.push(children[i]) } // plus the first body line
    wrap(ownerDoc, opening)
}

// Wrap the closing tail of a quotation/verse group: its last child line plus
// trailing .text-author / .date.
const groupQuotationTail = (groupEl) => {
    const ownerDoc = groupEl.ownerDocument
    const children = Array.from(groupEl.children)
    let end = children.length - 1
    const tail = []
    while (end >= 0 && (children[end].classList?.contains('text-author')
        || children[end].classList?.contains('date'))) {
        tail.unshift(children[end]); end--
    }
    if (tail.length === 0) return // no attribution to strand
    if (end >= 0) { tail.unshift(children[end]) } // include the preceding line
    wrap(ownerDoc, tail)
}

// Apply grouping to one render-section's root element (mutates in place).
export const applyGrouping = (rootEl) => {
    if (!rootEl || rootEl.nodeType !== 1) return
    // Section openings: every <section> in the render-section that has a leaf
    // opening (a leading title run followed by content, not only nested
    // sections) gets its opening wrapped. Walk sections shallow-to-deep.
    for (const sectionEl of rootEl.querySelectorAll('section')) {
        groupSectionOpening(sectionEl)
    }
    // Also the render-section root itself may carry the gathered opening when it
    // is a <section> with the flat title run at its head.
    if (rootEl.tagName?.toLowerCase() === 'section') groupSectionOpening(rootEl)
    // Quotation/verse opening labels (cite/epigraph): run BEFORE the tail so that
    // on a single-body-line quotation the tail pass simply nests the opening box
    // (label + line) inside the tail box (line-box + author + date) — both carry
    // break-inside, so the whole short quote stays together; no overlap conflict.
    for (const groupEl of rootEl.querySelectorAll('.cite, .epigraph')) {
        groupQuotationOpening(groupEl)
    }
    // Quotation/verse tails.
    for (const groupEl of rootEl.querySelectorAll('.cite, .epigraph, .poem')) {
        groupQuotationTail(groupEl)
    }
}
