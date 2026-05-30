// pxb2: классификация картинок внутри боди-<p> по их ПОЗИЦИИ в абзаце.
// Поздний проход (по образцу fb2-grouping.applyGrouping) — после сборки DOM, когда
// позиция картинки в абзаце известна. Класс вешается на сам <img>, чтобы CSS доставал
// его при любой вложенности (<p> внутри .keep-together direct-child селектором не цепляется).
// Различить block-картинку от inline-глифа CSS не может (не видит текстовые узлы) — отсюда JS.

// Цитатные контейнеры владеют своим layout (text-indent:0, свои поля) — их картинки не трогаем.
// Гард по КЛАССУ: эпиграф полиморфен (<section class="epigraph"> на body-уровне,
// <blockquote class="epigraph"> вложенный) — класс ловит оба, тег — нет.
const QUOTE_CONTAINER = '.cite, .epigraph, .poem, .annotation'

// Классифицирует <img> внутри боди-<p> одного render-section root'а (мутирует на месте).
export const classifyImages = (rootEl) => {
    if (!rootEl || rootEl.nodeType !== 1) return
    for (const img of rootEl.querySelectorAll('p > img')) {
        if (img.closest(QUOTE_CONTAINER)) continue // не наш случай — оставляем как есть
        const p = img.parentElement
        const text = (p.textContent ?? '').trim()
        // «первый по СОДЕРЖАНИЮ» — перед картинкой нет предшествующего элемента и нет непустого текста.
        // firstElementChild здесь НЕ годится: он игнорит ВЕСЬ ведущий текст (не только
        // whitespace), поэтому "<p>До <img> после</p>" принял бы за first → float (баг).
        let hasContentBefore = false
        for (let n = img.previousSibling; n; n = n.previousSibling) {
            // любой предшествующий элемент (вторая картинка, <strong>, note-anchor) ИЛИ
            // непустой текст = «контент перед» → картинка не первая. Только пробельные
            // текст-узлы игнорируются. Иначе 2-я картинка в "<p><img><img>текст</p>" уплыла
            // бы во float (spec: классифицируется только первая, остальные inline).
            if (n.nodeType === 1 || (n.textContent && n.textContent.trim() !== '')) {
                hasContentBefore = true
                break
            }
        }
        const isFirst = !hasContentBefore
        if (isFirst && text === '' && p.children.length === 1) {
            img.classList.add('block-image')   // единственное содержимое абзаца → центр-блок
        } else if (isFirst && text !== '') {
            img.classList.add('float-image')    // первая + текст → обтекание
        } else {
            img.classList.add('inline-glyph')   // по тексту / прочее → inline, ужать по высоте
        }
    }
}
