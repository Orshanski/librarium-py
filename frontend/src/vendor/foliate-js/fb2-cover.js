// Builds the reader cover render-section: the FB2 cover image when present,
// otherwise a generated title/author page.
const XHTML = 'application/xhtml+xml'

const escapeCoverText = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')

export const createCoverSection = ({ coverSrc, metadata, template }) => {
    const coverAuthor = metadata.author
        ?.map(author => author.name).filter(Boolean).join(', ') ?? ''
    const coverInnerHTML = coverSrc
        ? `<img src="${coverSrc}" alt=""/>`
        : `<h1>${escapeCoverText(metadata.title ?? '')}</h1>`
            + `<p>${escapeCoverText(coverAuthor)}</p>`
    const coverHTML = template(`<section class="cover-page">${coverInnerHTML}</section>`)
    const coverBlob = new Blob([coverHTML], { type: XHTML })
    const url = URL.createObjectURL(coverBlob)
    const section = {
        ids: [],
        title: 'Обложка',
        load: () => url,
        createDocument: () => new DOMParser().parseFromString(coverHTML, XHTML),
        size: 0,
        charCount: 0,
        counted: false,
        isCover: true,
        isOpening: true,
        cfi: '__cover__',
    }
    return { section, url }
}
