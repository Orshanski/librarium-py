// Late keep-together grouping pass (kfl7 Phase 2). Runs after section splitting
// and front-matter handling, before render-section serialisation. Wraps small,
// bounded units in a neutral <div class="keep-together"> carrying
// `break-inside: avoid` (the only cross-engine keep-together; break-after is
// dead on WebKit). The wrapper never encloses a nested <section> (so section
// splitting and TOC recursion, which walk direct-child sections, are
// undisturbed) and never carries decorative styling. data-foliate-id stays on
// the title elements inside the wrapper; resolution is descendant-based.

import { isBlockImageParagraph } from './fb2-image-classify.js'

const FRONT_MATTER_CLASSES = new Set(['epigraph', 'annotation'])

const isTitle = el => el?.nodeType === 1 && el.classList.contains('title')
const isFrontMatter = el => {
    if (el?.nodeType !== 1) return false
    if (el.tagName.toLowerCase() === 'img') return true
    for (const cls of el.classList) if (FRONT_MATTER_CLASSES.has(cls)) return true
    return false
}

const isEmptyLine = el =>
    el?.nodeType === 1 && el.tagName.toLowerCase() === 'br' && el.classList.contains('empty-line')

// «Вступительный блок» для look-ahead = существующий front-matter ИЛИ абзац-с-картинкой.
// Шире, чем isFrontMatter (который абзац-с-картинкой не ловит — это <p>, не <img>).
const isIntroBlock = el => isFrontMatter(el) || isBlockImageParagraph(el)

const wrap = (ownerDoc, nodes) => {
    if (nodes.length === 0) return
    const box = ownerDoc.createElement('div')
    box.classList.add('keep-together')
    const parent = nodes[0].parentNode
    parent.insertBefore(box, nodes[0])
    for (const n of nodes) box.appendChild(n)
}

// Wrap a section opening into ONE flat keep-together block. Crucially it
// DESCENDS through immediately-nested container sections, gathering the whole
// run of opening titles (book -> part -> chapter) plus attached front matter,
// then the first leaf content block. Without the descent, СОДРУЖЕСТВО / ЧАСТЬ /
// Глава live in separate nested <section>s, each gets its own wrapper, and they
// never form an adjacent-title sibling run — so the compact-stack CSS
// (.title + .title, :has(+ .title)) matches nothing and the stack reads loose
// in every engine. Flattening them into one block makes the titles real
// siblings, so the spacing rules apply and the stack reads compact like the
// mockup. Each title keeps its data-foliate-id (TOC resolution is
// descendant-based), and the now-emptied nested sections keep their remaining
// prose in source order after the block.
const groupSectionOpening = (sectionEl) => {
    const ownerDoc = sectionEl.ownerDocument
    const opening = []
    let titleCount = 0
    let cursor = sectionEl
    while (cursor) {
        const children = Array.from(cursor.children)
        let i = 0
        while (i < children.length && isTitle(children[i])) { opening.push(children[i]); titleCount++; i++ }
        while (i < children.length && isFrontMatter(children[i])) { opening.push(children[i]); i++ }
        const next = children[i]
        // descend only into an immediately-nested CONTAINER divider — a section
        // whose own opening is a title — continuing to gather the title run
        if (next && next.tagName.toLowerCase() === 'section' && isTitle(next.firstElementChild)) {
            cursor = next
            continue
        }
        // look-ahead: перешагнуть отбивку(и) к вступительному блоку, чтобы заголовок не
        // оторвался от идущей за пустой строкой иллюстрации/эпиграфа/аннотации. Втягиваем
        // отбивки и сам блок в связку (один блок — множественные подряд идущие картинки
        // вне scope, 0q54.4).
        if (next && isEmptyLine(next)) {
            let j = i
            while (j < children.length && isEmptyLine(children[j])) j++
            // isIntroBlock может вернуть true для <section class="epigraph"> (isFrontMatter
            // матчит epigraph/annotation ПО КЛАССУ, на любом теге), поэтому section-guard —
            // единственное, что не даёт обернуть вложенную <section> (инвариант: keep-together
            // никогда не охватывает <section>, см. шапку файла). Сейчас такой section не приходит
            // сюда как ребёнок обрабатываемой секции (body-level epigraph не вложен; внутри секции
            // epigraph→blockquote; frontmatter пропускается applyGrouping) — но гард держим явно,
            // это защита инварианта, а не мёртвый код.
            if (j < children.length && isIntroBlock(children[j])
                && children[j].tagName.toLowerCase() !== 'section') {
                for (let k = i; k <= j; k++) opening.push(children[k])
                break
            }
        }
        // leaf: attach the first content block, unless it is a nested section or a
        // poem (poems keep their own tail grouping and the .poem + br + .poem run)
        if (next && next.tagName.toLowerCase() !== 'section' && !next.classList?.contains('poem')) {
            opening.push(next)
        }
        break
    }
    // only group a genuine section opening — it must start with at least one title
    if (titleCount === 0) return
    // idempotency: a prior (outer) call may already have wrapped this run
    if (opening[0].parentElement?.classList?.contains('keep-together')) return
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
    // Section openings, OUTERMOST FIRST. The root section's groupSectionOpening
    // descends through its nested container sections and gathers the whole title
    // run, so it must run before its descendants — otherwise an inner section is
    // grouped first and the outer descent then trips over the box it created
    // (producing a separate wrapper per title instead of one flat stack). After
    // the outer call has consumed a chain, the descendant calls find no leading
    // title and no-op; sibling sections (separate chapter openings) still get
    // their own wrapper.
    if (rootEl.tagName?.toLowerCase() === 'section') groupSectionOpening(rootEl)
    for (const sectionEl of rootEl.querySelectorAll('section')) {
        groupSectionOpening(sectionEl)
    }
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
