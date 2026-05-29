import { normalizeWhitespace, getElementText } from './fb2.js'

// Collects the table of contents and assigns data-foliate-id to titles on the
// clean structure, before splitting. Preserves the exact tocCounter ordering.
export const collectToc = (topLevelItems, dataID) => {
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
    return topLevelItems.map(({ el }) => {
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
}

// Maps each foliate-id to its render-section index.
export const buildFoliateIdToSection = (renderSections, dataID) => {
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
    return foliateIdToSection
}

// Builds book.toc: nested TOC items, frontmatter-entry drop, cover prepend.
export const buildToc = ({ originalToc, foliateIdToSection, frontmatterIndex, textStartIndex }) => {
    const frontmatterExists = frontmatterIndex !== -1
    const buildTocItems = (titles) =>
        titles?.map(({ title, index, subitems }) => {
            const sectionIdx = foliateIdToSection.get(String(index)) ?? textStartIndex
            return {
                label: title,
                href: `${sectionIdx}#${index}`,
                subitems: subitems?.length ? buildTocItems(subitems) : null,
            }
        }) ?? null

    const rawToc = originalToc.map(({ title, titles, topIndex }) => {
        const sectionIdx = topIndex != null
            ? (foliateIdToSection.get(String(topIndex)) ?? textStartIndex)
            : textStartIndex
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
    // Subitems-of-subitems can never resolve to render-section[0]: their
    // elements live inside content render-sections, so depth-1 promotion
    // here suffices.
    const toc = frontmatterExists
        ? rawToc.flatMap(item => {
            const sectionIdx = Number(item.href.split('#')[0])
            if (sectionIdx === frontmatterIndex) {
                return (item.subitems ?? []).filter(sub =>
                    Number(sub.href.split('#')[0]) > frontmatterIndex)
            }
            return [item]
        })
        : rawToc
    return [{ label: 'Обложка', href: '__cover__' }, ...toc]
}
