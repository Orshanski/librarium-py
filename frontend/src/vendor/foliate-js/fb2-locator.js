import * as CFI from './epubcfi.js'

// Book navigation: resolve TOC/CFI/hash hrefs to a render-section index and an
// in-document anchor.
export const createNavigation = ({ idMap, dataID }) => {
    const resolveHref = href => {
        if (href === '__cover__') return { index: 0 }
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
    const resolveCFI = cfi => {
        if (cfi === '__cover__') return { index: 0 }
        const parts = CFI.parse(cfi)
        const oldIndex = CFI.fake.toIndex((parts.parent ?? parts).shift())
        return { index: oldIndex + 1, anchor: doc => CFI.toRange(doc, parts) }
    }
    const splitTOCHref = href =>
        href === '__cover__' ? [0] : href?.split('#')?.map(x => Number(x)) ?? []
    const getTOCFragment = (doc, id) => doc.querySelector(`[${dataID}="${id}"]`)
    return { resolveHref, resolveCFI, splitTOCHref, getTOCFragment }
}
