// 0q54.4 часть 2: определить картинку, стоящую в keep-together-связке с заголовком.
// Ужатие такой картинки под заголовок делает CSS-flex в paginator.setImageSize (браузер сам
// считает высоту заголовка и ужимает картинку — надёжно во всех движках). JS-замер высоты
// заголовка (offsetHeight) отвергнут: его результат расходится между Blink/WebKit/PWA.

// Структурный предикат: картинка лежит внутри keep-together-связки, у которой есть заголовок.
// Только такие картинки получают flex-удержание (обычные body-иллюстрации — нет).
export const isImageInTitleKeepTogether = (img) => {
    if (img?.nodeType !== 1) return false
    const kt = img.closest('.keep-together')
    if (!kt) return false
    return Boolean(kt.querySelector('.title'))
}
