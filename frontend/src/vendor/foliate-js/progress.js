// assign a unique ID for each TOC item
const assignIDs = toc => {
    let id = 0
    const assignID = item => {
        item.id = id++
        if (item.subitems) for (const subitem of item.subitems) assignID(subitem)
    }
    for (const item of toc) assignID(item)
    return toc
}

const flatten = items => items
    .map(item => item.subitems?.length
        ? [item, flatten(item.subitems)].flat()
        : item)
    .flat()

export class TOCProgress {
    async init({ toc, ids, splitHref, getFragment }) {
        assignIDs(toc)
        const items = flatten(toc)
        const grouped = new Map()
        for (const [i, item] of items.entries()) {
            const [id, fragment] = await splitHref(item?.href) ?? []
            const value = { fragment, item }
            if (grouped.has(id)) grouped.get(id).items.push(value)
            else grouped.set(id, { prev: items[i - 1], items: [value] })
        }
        const map = new Map()
        for (const [i, id] of ids.entries()) {
            if (grouped.has(id)) map.set(id, grouped.get(id))
            else map.set(id, map.get(ids[i - 1]))
        }
        this.ids = ids
        this.map = map
        this.getFragment = getFragment
    }
    getProgress(index, range) {
        if (!this.ids) return
        const id = this.ids[index]
        const obj = this.map.get(id)
        if (!obj) return null
        const { prev, items } = obj
        if (!items) return prev
        if (!range || items.length === 1 && !items[0].fragment) return items[0].item

        const doc = range.startContainer.getRootNode()
        for (const [i, { fragment }] of items.entries()) {
            const el = this.getFragment(doc, fragment)
            if (!el) continue
            if (range.comparePoint(el, 0) > 0)
                return (items[i - 1]?.item ?? prev)
        }
        return items[items.length - 1].item
    }
}

export class SectionProgress {
    constructor(sections, sizePerLoc, sizePerTimeUnit) {
        this.sections = sections
        this.sizes = sections.map(s =>
            s.counted !== false && s.linear != 'no' && s.size > 0 ? s.size : 0)
        this.sizePerLoc = sizePerLoc
        this.sizePerTimeUnit = sizePerTimeUnit
        this.sizeTotal = this.sizes.reduce((a, b) => a + b, 0)
        this.sectionFractions = this.#getSectionFractions()
    }
    #getSectionFractions() {
        const { sizeTotal } = this
        const results = [0]
        let sum = 0
        for (const size of this.sizes)
            results.push(sizeTotal > 0 ? (sum += size) / sizeTotal : 0)
        return results
    }
    // get progress given index of and fractions within a section
    getProgress(index, fractionInSection, pageFraction = 0) {
        const { sizes, sizePerLoc, sizePerTimeUnit, sizeTotal } = this
        const section = this.sections[index]
        const isCover = section?.isCover === true
        const isOpening = isCover || section?.isOpening === true
        const sizeInSection = sizes[index] ?? 0
        const sizeBefore = sizes.slice(0, index).reduce((a, b) => a + b, 0)
        const size = sizeBefore + fractionInSection * sizeInSection
        const nextSize = size + pageFraction * sizeInSection
        const remainingTotal = sizeTotal - size
        const remainingSection = (1 - fractionInSection) * sizeInSection
        const countedSectionIndex = sizes.slice(0, index + 1)
            .filter(size => size > 0).length
        return {
            fraction: sizeTotal > 0 ? nextSize / sizeTotal : 0,
            isCover,
            isOpening,
            section: {
                current: isOpening ? 0 : countedSectionIndex,
                total: sizes.filter(size => size > 0).length,
            },
            location: {
                current: Math.floor(size / sizePerLoc),
                next: Math.floor(nextSize / sizePerLoc),
                total: Math.ceil(sizeTotal / sizePerLoc),
            },
            time: {
                section: remainingSection / sizePerTimeUnit,
                total: remainingTotal / sizePerTimeUnit,
            },
        }
    }
    // the inverse of `getProgress`
    // get index of and fraction in section based on total fraction
    getSection(fraction) {
        if (fraction <= 0) {
            const first = this.sizes.findIndex(size => size > 0)
            return [first < 0 ? 0 : first, 0]
        }
        if (fraction >= 1) {
            const last = this.sizes.findLastIndex(size => size > 0)
            return [last < 0 ? this.sizes.length - 1 : last, 1]
        }
        fraction = fraction + Number.EPSILON
        const { sizeTotal } = this
        let index = this.sectionFractions.findIndex(x => x > fraction) - 1
        if (index < 0) {
            const first = this.sizes.findIndex(size => size > 0)
            return [first < 0 ? 0 : first, 0]
        }
        while (!this.sizes[index]) index++
        const fractionInSection = (fraction - this.sectionFractions[index])
            / (this.sizes[index] / sizeTotal)
        return [index, fractionInSection]
    }
}
