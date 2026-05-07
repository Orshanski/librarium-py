const normalizeWhitespace = str => str ? str
    .replace(/[\t\n\f\r ]+/g, ' ')
    .replace(/^[\t\n\f\r ]+/, '')
    .replace(/[\t\n\f\r ]+$/, '') : ''
const getElementText = el => normalizeWhitespace(el?.textContent)
const getSrcLength = el => el.getAttribute?.('src')?.length ?? 0
const getEmbeddedSrcLength = el =>
    getSrcLength(el) + Array.from(el.querySelectorAll('[src]'), getSrcLength)
        .reduce((a, b) => a + b, 0)

const NS = {
    XLINK: 'http://www.w3.org/1999/xlink',
    EPUB: 'http://www.idpf.org/2007/ops',
}

const MIME = {
    XML: 'application/xml',
    XHTML: 'application/xhtml+xml',
}

const STYLE = {
    'strong': ['strong', 'self'],
    'emphasis': ['em', 'self'],
    'style': ['span', 'self'],
    'a': 'anchor',
    'strikethrough': ['s', 'self'],
    'sub': ['sub', 'self'],
    'sup': ['sup', 'self'],
    'code': ['code', 'self'],
    'image': 'image',
}

const TABLE = {
    'tr': ['tr', {
        'th': ['th', STYLE, ['colspan', 'rowspan', 'align', 'valign']],
        'td': ['td', STYLE, ['colspan', 'rowspan', 'align', 'valign']],
    }, ['align']],
}

const POEM = {
    'epigraph': ['blockquote'],
    'subtitle': ['h2', STYLE],
    'text-author': ['p', STYLE],
    'date': ['p', STYLE],
    'stanza': 'stanza',
}

const makeSectionDef = (level) => {
    const hTag = level <= 1 ? 'h1' : level === 2 ? 'h2' : level === 3 ? 'h3' : 'h4'
    const nextLevel = Math.min(level + 1, 4)
    const def = {
        'title': ['header', {
            'p': [hTag, STYLE],
            'empty-line': ['br'],
        }],
        'epigraph': ['blockquote', 'self'],
        'image': 'image',
        'annotation': ['aside'],
        'p': ['p', STYLE],
        'poem': ['blockquote', POEM],
        'subtitle': [level <= 2 ? 'h3' : 'h4', STYLE],
        'cite': ['blockquote', 'self'],
        'empty-line': ['br'],
        'table': ['table', TABLE],
        'text-author': ['p', STYLE],
    }
    // Lazy reference to avoid infinite recursion
    Object.defineProperty(def, 'section', {
        get() { return ['section', makeSectionDef(nextLevel)] },
        enumerable: true,
    })
    return def
}
const SECTION = makeSectionDef(1)
POEM['epigraph'].push(SECTION)

const BODY = {
    'image': 'image',
    'title': ['section', {
        'p': ['h1', STYLE],
        'empty-line': ['br'],
    }],
    'epigraph': ['section', SECTION],
    'section': ['section', SECTION],
}

// Frontmatter merging (b4ci.1): see spec at
// project_documentation/specs/2026-05-07-b4ci.1-fb2-frontmatter-merging-design.md
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
        // walker stops at root: root-decorative shortcut handled in Step 1 above
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

class FB2Converter {
    constructor(fb2) {
        this.fb2 = fb2
        this.doc = document.implementation.createDocument(NS.XHTML, 'html')
        // use this instead of `getElementById` to allow images like
        // `<image l:href="#img1.jpg" id="img1.jpg" />`
        this.bins = new Map(Array.from(this.fb2.getElementsByTagName('binary'),
            el => [el.id, el]))
    }
    getImageSrc(el) {
        const href = el.getAttributeNS(NS.XLINK, 'href')
        if (!href) return 'data:,'
        const [, id] = href.split('#')
        if (!id) return href
        const bin = this.bins.get(id)
        return bin
            ? `data:${bin.getAttribute('content-type')};base64,${bin.textContent}`
            : href
    }
    image(node) {
        const el = this.doc.createElement('img')
        el.alt = node.getAttribute('alt')
        el.title = node.getAttribute('title')
        el.setAttribute('src', this.getImageSrc(node))
        return el
    }
    anchor(node) {
        const el = this.convert(node, { 'a': ['a', STYLE] })
        el.setAttribute('href', node.getAttributeNS(NS.XLINK, 'href'))
        if (node.getAttribute('type') === 'note') {
            el.setAttributeNS(NS.EPUB, 'epub:type', 'noteref')
            // Clean brackets from note text: [178] → 178
            el.textContent = el.textContent.replace(/^\[|\]$/g, '')
            const sup = this.doc.createElement('sup')
            sup.appendChild(el)
            return sup
        }
        return el
    }
    stanza(node) {
        const el = this.convert(node, {
            'stanza': ['p', {
                'title': ['header', {
                    'p': ['strong', STYLE],
                    'empty-line': ['br'],
                }],
                'subtitle': ['p', STYLE],
            }],
        })
        for (const child of node.children) if (child.nodeName === 'v') {
            for (const vChild of child.childNodes) {
                if (vChild.nodeType === 3) el.append(this.doc.createTextNode(vChild.textContent))
                else if (vChild.nodeName === 'a') el.append(this.anchor(vChild))
                else if (vChild.nodeName === 'emphasis') {
                    const em = this.doc.createElement('em')
                    em.textContent = vChild.textContent
                    el.append(em)
                }
                else if (vChild.nodeName === 'strong') {
                    const strong = this.doc.createElement('strong')
                    strong.textContent = vChild.textContent
                    el.append(strong)
                }
                else el.append(this.doc.createTextNode(vChild.textContent))
            }
            el.append(this.doc.createElement('br'))
        }
        return el
    }
    convert(node, def) {
        // not an element; return text content
        if (node.nodeType === 3) return this.doc.createTextNode(node.textContent)
        if (node.nodeType === 4) return this.doc.createCDATASection(node.textContent)
        if (node.nodeType === 8) return this.doc.createComment(node.textContent)

        const d = def?.[node.nodeName]
        if (!d) return null
        if (typeof d === 'string') return this[d](node)

        const [name, opts, attrs] = d
        const el = this.doc.createElement(name)

        // copy the ID, and set class name from original element name
        if (node.id) el.id = node.id
        el.classList.add(node.nodeName)

        // copy attributes
        if (Array.isArray(attrs)) for (const attr of attrs) {
            const value = node.getAttribute(attr)
            if (value) el.setAttribute(attr, value)
        }

        // process child elements recursively
        const childDef = opts === 'self' ? def : opts
        let child = node.firstChild
        while (child) {
            const childEl = this.convert(child, childDef)
            if (childEl) el.append(childEl)
            child = child.nextSibling
        }
        return el
    }
}

const parseXML = async blob => {
    const buffer = await blob.arrayBuffer()
    const str = new TextDecoder('utf-8').decode(buffer)
    const parser = new DOMParser()
    const doc = parser.parseFromString(str, MIME.XML)
    const encoding = doc.xmlEncoding
        // `Document.xmlEncoding` is deprecated, and already removed in Firefox
        // so parse the XML declaration manually
        || str.match(/^<\?xml\s+version\s*=\s*["']1.\d+"\s+encoding\s*=\s*["']([A-Za-z0-9._-]*)["']/)?.[1]
    if (encoding && encoding.toLowerCase() !== 'utf-8') {
        const str = new TextDecoder(encoding).decode(buffer)
        return parser.parseFromString(str, MIME.XML)
    }
    return doc
}

const style = URL.createObjectURL(new Blob([`
@namespace epub "http://www.idpf.org/2007/ops";

/* User settings via CSS variables */
html {
    -webkit-text-size-adjust: 100%;
    text-size-adjust: 100%;
    background: var(--user-bg, #fff);
    color: var(--user-color, #000);
}
body {
    background: var(--user-bg, #fff);
    color: var(--user-color, #000);
    font-family: var(--user-font, Georgia, serif);
    font-size: var(--user-font-size, 16px);
    line-height: var(--user-line-height, 1.4);
}
p, li, dd {
    text-align: var(--user-text-align, start);
    -webkit-hyphens: var(--user-hyphens, manual);
    hyphens: var(--user-hyphens, manual);
}
a:link { color: var(--user-accent, #0066cc); }

/* Structural styles */
body > img, section > img {
    display: block;
    margin: auto;
}
.title h1 { text-align: center; font-size: 1.5em; }
.title h2 { text-align: center; font-size: 1.3em; }
.title h3 { text-align: center; font-size: 1.1em; }
.title h4 { text-align: center; font-size: 1em; }
body > section > .title, body.notesBodyType > .title {
    margin: 0 0 1em;
}
.title + .title {
    margin-top: 0.5em;
}
body.notesBodyType > section .title h1 {
    text-align: start;
}
body.notesBodyType > section .title {
    margin: 1em 0;
}
p {
    text-indent: 2em;
    margin: 0;
}
.poem p {
    text-indent: 0;
    margin: 1em 0;
    text-align: start;
}
.epigraph {
    font-style: italic;
    font-size: 0.85em;
}
.poem + br { display: none; }
.poem + br + .poem { margin-top: 0.5em; }
.text-author, .date {
    text-align: end;
}
.text-author:before {
    content: "—";
}
table {
    border-collapse: collapse;
}
td, th {
    padding: .25em;
}
a[epub|type~="noteref"] {
    font-size: .75em;
    vertical-align: super;
}
body:not(.notesBodyType) > .title, body:not(.notesBodyType) > .epigraph {
    margin: 3em 0 1em;
}
`], { type: 'text/css' }))

const template = html => `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
    <head><link href="${style}" rel="stylesheet" type="text/css"/></head>
    <body>${html}</body>
</html>`

// name of custom ID attribute for TOC items
const dataID = 'data-foliate-id'

export const makeFB2 = async blob => {
    const book = {}
    const doc = await parseXML(blob)
    const converter = new FB2Converter(doc)

    const $ = x => doc.querySelector(x)
    const $$ = x => [...doc.querySelectorAll(x)]
    const getPerson = el => {
        const nick = getElementText(el.querySelector('nickname'))
        if (nick) return nick
        const first = getElementText(el.querySelector('first-name'))
        const middle = getElementText(el.querySelector('middle-name'))
        const last = getElementText(el.querySelector('last-name'))
        const name = [first, middle, last].filter(x => x).join(' ')
        const sortAs = last
            ? [last, [first, middle].filter(x => x).join(' ')].join(', ')
            : null
        return { name, sortAs }
    }
    const getDate = el => el?.getAttribute('value') ?? getElementText(el)
    const annotation = $('title-info annotation')
    book.metadata = {
        title: getElementText($('title-info book-title')),
        identifier: getElementText($('document-info id')),
        language: getElementText($('title-info lang')),
        author: $$('title-info author').map(getPerson),
        translator: $$('title-info translator').map(getPerson),
        contributor: $$('document-info author').map(getPerson)
            // techincially the program probably shouldn't get the `bkp` role
            // but it has been so used by calibre, so ¯\_(ツ)_/¯
            .concat($$('document-info program-used').map(getElementText))
            .map(x => Object.assign(typeof x === 'string' ? { name: x } : x,
                { role: 'bkp' })),
        publisher: getElementText($('publish-info publisher')),
        published: getDate($('title-info date')),
        modified: getDate($('document-info date')),
        description: annotation ? converter.convert(annotation,
            { annotation: ['div', SECTION] }).innerHTML : null,
        subject: $$('title-info genre').map(getElementText),
    }
    if ($('coverpage image')) {
        const src = converter.getImageSrc($('coverpage image'))
        book.getCover = () => fetch(src).then(res => res.blob())
    } else book.getCover = () => null

    // get convert each body
    const bodyData = Array.from(doc.querySelectorAll('body'), body => {
        const converted = converter.convert(body, { body: ['body', BODY] })
        return [Array.from(converted.children, el => {
            // get list of IDs in the section
            const ids = [el, ...el.querySelectorAll('[id]')].map(el => el.id)
            return { el, ids }
        }), converted]
    })

    const urls = []

    // Step 1: Collect TOC from original structure BEFORE splitting
    let tocCounter = 0
    const collectTitles = (parentEl) => {
        const sections = parentEl.querySelectorAll(':scope > section')
        return Array.from(sections, (section) => {
            const titleEl = section.querySelector(':scope > .title')
            if (!titleEl) return null
            const index = tocCounter++
            titleEl.setAttribute(dataID, index)
            const subitems = collectTitles(section)
            return {
                title: getElementText(titleEl),
                index,
                subitems: subitems.length ? subitems : null,
            }
        }).filter(x => x)
    }
    // Collect TOC from each top-level element before any splitting
    // Assign data-foliate-id to top-level title elements too
    const originalToc = bodyData[0][0].map(({ el }) => {
        const titleEl = el.querySelector(':scope > .title')
        let topIndex = null
        if (titleEl) {
            topIndex = tocCounter++
            titleEl.setAttribute(dataID, topIndex)
        }
        return {
            title: normalizeWhitespace(
                el.querySelector('.title, .subtitle, p')?.textContent
                ?? (el.classList.contains('title') ? el.textContent : '')),
            titles: collectTitles(el),
            topIndex,
        }
    })

    // Step 2: Adaptive section splitting
    const MAX_CHARS = 180000
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
        const frontmatterIds = [...preamble.flatMap(p => p.ids)]

        // Lone-author-title special case: pull first thin segment from
        // items[i] into frontmatter so that author and book-title sit together.
        let remainingFirstSegments = null
        if (preamble.length === 1) {
            const targetSegments = splitSection(items[i])
            if (targetSegments.length > 1 && isThinSegment(targetSegments[0])) {
                frontmatterEl.appendChild(cloneForFrontmatter(targetSegments[0].el))
                frontmatterIds.push(...targetSegments[0].ids)
                remainingFirstSegments = targetSegments.slice(1)
            }
        }

        const frontmatterSegment = {
            el: frontmatterEl,
            ids: frontmatterIds,
            charCount: frontmatterEl.textContent?.length ?? 0,
        }
        const renderedContent = remainingFirstSegments !== null
            ? [
                ...mergeThinSegments(remainingFirstSegments),
                ...items.slice(i + 1).flatMap(item =>
                    mergeThinSegments(splitSection(item))),
            ]
            : items.slice(i).flatMap(item =>
                mergeThinSegments(splitSection(item)))
        return [frontmatterSegment, ...renderedContent]
    }

    // Step 3: Build render sections with el preserved for anchor mapping
    const renderSections = applyPassA(bodyData[0][0])
        .concat(bodyData.slice(1).map(([sections, body]) => {
            const ids = sections.map(s => s.ids).flat()
            body.classList.add('notesBodyType')
            return { ids, el: body, linear: 'no' }
        }))
        .map(({ ids, el, linear, charCount }) => {
            const str = template(el.outerHTML)
            const blob = new Blob([str], { type: MIME.XHTML })
            const url = URL.createObjectURL(blob)
            urls.push(url)
            const title = normalizeWhitespace(
                el.querySelector('.title, .subtitle, p')?.textContent
                ?? (el.classList.contains('title') ? el.textContent : ''))
            return {
                ids, el, title, load: () => url,
                createDocument: () => new DOMParser().parseFromString(str, MIME.XHTML),
                size: blob.size - getEmbeddedSrcLength(el),
                charCount: charCount ?? el.textContent?.length ?? 0,
                linear,
            }
        })

    // Step 4: Build foliateId -> render section index map
    const foliateIdToSection = new Map()
    for (let i = 0; i < renderSections.length; i++) {
        const el = renderSections[i].el
        if (!el) continue
        const selfFid = el.getAttribute?.(dataID)
        if (selfFid && !foliateIdToSection.has(selfFid)) {
            foliateIdToSection.set(selfFid, i)
        }
        for (const titled of el.querySelectorAll(`[${dataID}]`)) {
            const fid = titled.getAttribute(dataID)
            if (fid && !foliateIdToSection.has(fid)) {
                foliateIdToSection.set(fid, i)
            }
        }
    }

    // Whether Pass A produced a <section class="frontmatter"> wrapper as
    // render-section[0]. If yes, TOC entries pointing to render-section 0
    // are author/copyright/epigraph (preamble items) — drop them, they're
    // not navigable content for the reader's table of contents.
    const frontmatterExists = renderSections[0]?.el?.classList?.contains('frontmatter') ?? false

    // Release DOM references — no longer needed after mapping
    for (const s of renderSections) delete s.el

    // Step 5: Build book.sections
    const idMap = new Map()
    book.sections = renderSections.map((section, index) => {
        const { ids, load, createDocument, size, linear, charCount } = section
        for (const id of ids) if (id) idMap.set(id, index)
        return { id: index, load, createDocument, size, linear, charCount }
    })

    // Build TOC from original structure, resolving to render section indices
    const buildTocItems = (titles) =>
        titles?.map(({ title, index, subitems }) => {
            const sectionIdx = foliateIdToSection.get(String(index)) ?? 0
            return {
                label: title,
                href: `${sectionIdx}#${index}`,
                subitems: subitems?.length ? buildTocItems(subitems) : null,
            }
        }) ?? null

    const rawToc = originalToc.map(({ title, titles, topIndex }) => {
        const sectionIdx = topIndex != null
            ? (foliateIdToSection.get(String(topIndex)) ?? 0)
            : 0
        return {
            label: title,
            href: topIndex != null ? `${sectionIdx}#${topIndex}` : String(sectionIdx),
            subitems: buildTocItems(titles),
        }
    }).filter(item => item.label)

    // If frontmatter wrapper exists, drop TOC entries that resolve into
    // render-section[0] (author title, copyrights, dedication, epigraphs
    // pulled in via lone-author special case). When such an entry has
    // subitems pointing into content (e.g. lone-author case where the
    // whole-book section has inner chapters), promote those to the top
    // level. Subitems that also point at render-section[0] — e.g. praise
    // pages whose <cite>-wrapped endorsements made the whole praise block
    // count as decorative and slip into frontmatter — are dropped, not
    // promoted; they'd just be broken navigation links.
    book.toc = frontmatterExists
        ? rawToc.flatMap(item => {
            const sectionIdx = Number(item.href.split('#')[0])
            if (sectionIdx === 0) {
                return (item.subitems ?? []).filter(sub =>
                    Number(sub.href.split('#')[0]) > 0)
            }
            return [item]
        })
        : rawToc

    book.resolveHref = href => {
        const [a, b] = href.split('#')
        if (!a) {
            // link from within the page: #someId
            return { index: idMap.get(b), anchor: doc => doc.getElementById(b) }
        }
        if (b != null) {
            // TOC link with fragment: sectionIndex#foliateId
            return { index: Number(a), anchor: doc => doc.querySelector(`[${dataID}="${b}"]`) }
        }
        // TOC link without fragment: just section index
        return { index: Number(a) }
    }
    book.splitTOCHref = href => href?.split('#')?.map(x => Number(x)) ?? []
    book.getTOCFragment = (doc, id) => doc.querySelector(`[${dataID}="${id}"]`)

    book.destroy = () => {
        for (const url of urls) URL.revokeObjectURL(url)
    }
    return book
}
