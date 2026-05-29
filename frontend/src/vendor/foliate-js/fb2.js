import * as CFI from './epubcfi.js'
import { createNavigation } from './fb2-locator.js'
import { createCoverSection } from './fb2-cover.js'
import { buildContentSegments } from './fb2-render-sections.js'
import { collectToc, buildFoliateIdToSection, buildToc } from './fb2-toc.js'

export const normalizeWhitespace = str => str ? str
    .replace(/[\t\n\f\r ]+/g, ' ')
    .replace(/^[\t\n\f\r ]+/, '')
    .replace(/[\t\n\f\r ]+$/, '') : ''

export const getElementText = el => normalizeWhitespace(el?.textContent)
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
    let coverSrc = null
    if ($('coverpage image')) {
        coverSrc = converter.getImageSrc($('coverpage image'))
        book.getCover = () => fetch(coverSrc).then(res => res.blob())
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

    // Collect TOC from the original structure, before splitting
    const originalToc = collectToc(bodyData[0][0], dataID)

    // Build render sections with el preserved for anchor mapping
    const renderSections = buildContentSegments(bodyData[0][0], { dataID })
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

    const { section: coverSection, url: coverUrl } = createCoverSection({
        coverSrc, metadata: book.metadata, template,
    })
    urls.push(coverUrl)
    renderSections.unshift(coverSection)

    // Build foliateId -> render section index map
    const foliateIdToSection = buildFoliateIdToSection(renderSections, dataID)

    // Whether Pass A produced a <section class="frontmatter"> wrapper as
    // render-section[0]. If yes, TOC entries pointing to render-section 0
    // are author/copyright/epigraph (preamble items) — drop them, they're
    // not navigable content for the reader's table of contents.
    const textStartIndex = 1
    const frontmatterExists =
        renderSections[textStartIndex]?.el?.classList?.contains('frontmatter') ?? false
    const frontmatterIndex = frontmatterExists ? textStartIndex : -1

    // Release DOM references — no longer needed after mapping
    for (const s of renderSections) delete s.el

    // Build book.sections
    const idMap = new Map()
    book.sections = renderSections.map((section, index) => {
        const {
            ids, load, createDocument, size, linear, charCount,
            counted, isCover, cfi,
        } = section
        for (const id of ids) if (id) idMap.set(id, index)
        const textIndex = index - 1
        const sectionCounted = index === frontmatterIndex ? false : counted
        return {
            id: index,
            load,
            createDocument,
            size,
            linear,
            charCount,
            counted: sectionCounted,
            isCover,
            isOpening: isCover === true || index === frontmatterIndex,
            cfi: cfi ?? (textIndex >= 0 ? CFI.fake.fromIndex(textIndex) : undefined),
        }
    })

    // Build TOC from original structure, resolving to render section indices
    book.toc = buildToc({ originalToc, foliateIdToSection, frontmatterIndex, textStartIndex })

    const navigation = createNavigation({ idMap, dataID })
    book.resolveHref = navigation.resolveHref
    book.resolveCFI = navigation.resolveCFI
    book.splitTOCHref = navigation.splitTOCHref
    book.getTOCFragment = navigation.getTOCFragment

    book.destroy = () => {
        for (const url of urls) URL.revokeObjectURL(url)
    }
    return book
}
