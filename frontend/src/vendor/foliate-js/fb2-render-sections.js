// Adaptive section splitting + front-matter merging (b4ci.1).
const MAX_CHARS = 180000

// Decorative-wrapper detection: tags/classes treated as non-prose front-matter.
const DECORATIVE_TAGS = new Set(['header', 'aside', 'blockquote'])
const DECORATIVE_CLASSES = new Set([
    'title', 'subtitle', 'epigraph', 'cite', 'annotation',
    'text-author', 'date', 'poem', 'stanza',
])
const PROSE_BUDGET = 1500

const isDecorativeWrapper = el => {
    if (!el || el.nodeType !== 1) return false
    if (DECORATIVE_TAGS.has(el.tagName?.toLowerCase())) return true
    for (const cls of el.classList) {
        if (DECORATIVE_CLASSES.has(cls)) return true
    }
    return false
}

const hasProseContent = (root, budget = PROSE_BUDGET) => {
    if (isDecorativeWrapper(root)) return false
    let chars = 0
    for (const p of root.querySelectorAll('p')) {
        let cursor = p
        let decorative = false
        // walker terminates at root: the early-return above already handled
        // the case where root itself is decorative
        while (cursor && cursor !== root) {
            if (isDecorativeWrapper(cursor)) {
                decorative = true
                break
            }
            cursor = cursor.parentElement
        }
        if (!decorative) {
            chars += p.textContent?.length ?? 0
            if (chars >= budget) return true
        }
    }
    return false
}

// buildContentSegments splits the first body's top-level items, merges thin
// segments, and applies Pass A front-matter wrapping; returns the ordered
// segment list ({ el, ids, charCount }).
export const buildContentSegments = (topLevelItems, { dataID }) => {
    const splitSection = ({ el, ids }) => {
        const charCount = el.textContent?.length ?? 0
        const childSections = el.querySelectorAll(':scope > section')
        if (charCount <= MAX_CHARS || childSections.length === 0) {
            return [{ ids, el, charCount }]
        }
        // Remember parent's own id to attach to first segment
        const parentId = el.id
        const segments = []
        const ownerDoc = el.ownerDocument
        let currentNodes = []
        const flushNodes = () => {
            if (!currentNodes.some(n => n.textContent?.trim())) return
            const wrapper = ownerDoc.createElement('section')
            for (const n of currentNodes) wrapper.appendChild(n.cloneNode(true))
            const wIds = [wrapper, ...wrapper.querySelectorAll('[id]')].map(e => e.id)
            segments.push({ el: wrapper, ids: wIds, charCount: wrapper.textContent?.length ?? 0 })
        }
        for (const child of Array.from(el.childNodes)) {
            if (child.nodeType === 1 && child.tagName?.toLowerCase() === 'section') {
                flushNodes()
                currentNodes = []
                const childIds = [child, ...child.querySelectorAll('[id]')].map(e => e.id)
                segments.push(...splitSection({ el: child, ids: childIds }))
            } else {
                currentNodes.push(child)
            }
        }
        flushNodes()
        // Attach parent's id to first segment so anchors resolve correctly
        if (parentId && segments.length > 0) {
            if (!segments[0].ids.includes(parentId)) {
                segments[0].ids.push(parentId)
            }
        }
        return segments
    }

    // Post-process: merge thin segments into next via wrapper-clone primitive (b4ci.1).
    // Pass B — per-top-level-item, no cross-boundary merges (Part I tail can't reach
    // Part II head). Predicate isThinSegment uses hasProseContent + checks for
    // nested sections.
    const isThinSegment = (seg) =>
        seg.el.querySelectorAll('section').length === 0
        && !hasProseContent(seg.el, PROSE_BUDGET)

    const mergeThinSegments = (segments) => {
        let merged = true
        while (merged) {
            merged = false
            const result = []
            for (let i = 0; i < segments.length; i++) {
                const seg = segments[i]
                const next = segments[i + 1]
                if (next && isThinSegment(seg)) {
                    const beforeFirst = next.el.firstChild
                    next.el.insertBefore(seg.el.cloneNode(true), beforeFirst)
                    next.ids = [...seg.ids, ...next.ids]
                    next.charCount = next.el.textContent?.length ?? 0
                    merged = true
                    continue
                }
                result.push(seg)
            }
            segments = result
        }
        return segments
    }

    // Pass A — wraps decorative top-level prefix into a separate frontmatter
    // render-section. Content items follow standard flatMap, untouched.
    // The first content item (Prologue / Part I / Foreword) gets its own
    // render-section, paginator opens it on a fresh spread.
    //
    // Special case for "lone author title" pattern (e.g. Erikson "Gardens of
    // the Moon": body-level <title> contains only the author name, while
    // book-title + epigraphs are inside the first content section): when
    // preamble has exactly one item, also pull the first segment of
    // splitSection(items[i]) into frontmatter if it's thin. That gathers
    // author + book-title + epigraphs into one cohesive frontmatter block.
    const applyPassA = (items) => {
        const preamble = []
        let i = 0
        while (i < items.length && !hasProseContent(items[i].el, PROSE_BUDGET)) {
            preamble.push(items[i])
            i += 1
        }
        if (preamble.length === 0 || i === items.length) {
            return items.flatMap(item => mergeThinSegments(splitSection(item)))
        }
        // When cloning into the frontmatter wrapper, strip data-foliate-id
        // attributes — those ids stay on the original elements (still rendered
        // inside their content render-section), and a duplicate in frontmatter
        // collides in foliateIdToSection map (frontmatter is index 0, scanned
        // first, so the original chapter resolves to the wrong section).
        const cloneForFrontmatter = (el) => {
            const cloned = el.cloneNode(true)
            cloned.removeAttribute(dataID)
            for (const inner of cloned.querySelectorAll(`[${dataID}]`)) {
                inner.removeAttribute(dataID)
            }
            return cloned
        }

        const ownerDoc = items[0].el.ownerDocument
        const frontmatterEl = ownerDoc.createElement('section')
        frontmatterEl.classList.add('frontmatter')
        for (const src of preamble) {
            frontmatterEl.appendChild(cloneForFrontmatter(src.el))
        }
        const frontmatterIds = preamble.flatMap(p => p.ids)

        // Lone-author special case: when preamble is a single body-level title
        // (just the author name) and the first content item is a big section
        // whose first segment is decorative (book-title + dedication + epigraph),
        // pull that first segment into frontmatter so author and book-title sit
        // together. Otherwise use the same splitSection result for the standard
        // pipeline below — avoids re-splitting the same large item twice.
        let firstItemSegments = null
        if (preamble.length === 1) {
            firstItemSegments = splitSection(items[i])
            if (firstItemSegments.length > 1 && isThinSegment(firstItemSegments[0])) {
                frontmatterEl.appendChild(cloneForFrontmatter(firstItemSegments[0].el))
                frontmatterIds.push(...firstItemSegments[0].ids)
                firstItemSegments = firstItemSegments.slice(1)
            }
        }

        const frontmatterSegment = {
            el: frontmatterEl,
            ids: frontmatterIds,
            charCount: frontmatterEl.textContent?.length ?? 0,
        }
        const renderedContent = firstItemSegments !== null
            ? [
                ...mergeThinSegments(firstItemSegments),
                ...items.slice(i + 1).flatMap(item =>
                    mergeThinSegments(splitSection(item))),
            ]
            : items.slice(i).flatMap(item =>
                mergeThinSegments(splitSection(item)))
        return [frontmatterSegment, ...renderedContent]
    }

    return applyPassA(topLevelItems)
}
