# Frontend — CLAUDE.md

React 19 + TypeScript + Vite. Конвенции, специфичные для `frontend/`.
Общие правила проекта — в корневом `CLAUDE.md`.

## Commands

```bash
cd frontend
npm run dev                # Dev server :5173 (proxy /api → :8000)
npm run build              # Production build → dist/
npm test                   # vitest — ВСЕГДА последовательно, не параллельно
npx tsc --noEmit           # Type check
```

## Key Directories

- `src/pages/` — page components
- `src/components/` — shared components (logic + types)
- `src/components/desktop/` — desktop layout components
- `src/components/mobile/` — mobile layout components
- `src/responsive.ts` — ResponsiveProvider, `useIsMobile()` (breakpoint в `theme.ts:layout.mobileBreakpoint`)
- `src/cache/` — `useCachedResource` hook + metadata cache store
- `src/hooks/` — общие hooks
- `src/theme.ts` — токены темы: `colors`, `fonts`, `layout`

## Code Rules

- **No `any` in TypeScript.** Never use `as any` or `any` type. Extend interfaces,
  add optional fields, or create union types instead.
- **Inline CSS objects.** Стили — inline-объектами, не CSS-файлами. Токены через
  `theme.ts`.
- **Responsive.** Mobile vs desktop через `useIsMobile()` из `responsive.ts`,
  не CSS media queries напрямую в компонентах.
- **Производное состояние из свойства на странице-карточке сущности и ложно
  проходящий тест.** Компонент, который копирует серверное поле в локальное
  состояние через `useState(...)` ради оптимистичного переключателя (`isRead`,
  `rating`), застревает на старом значении, когда свойство меняется без
  перемонтирования. На маршруте `/<entity>/:id` ошибка проявляется только при
  переходе на запись, уже лежащую в кэше: при промахе кэша родитель выполняет
  `if (loading) return <StatusScreen/>` и перемонтирует дочерний компонент
  (ошибка скрыта), при попадании в кэш перемонтирования нет (ошибка видна).
  Поэтому тест, воспроизводящий только переход с промахом кэша, проходит ложно —
  если тест, обязанный падать, неожиданно зелёный, значит он не воспроизводит
  условие, а не «ошибки нет»; разберись в механизме. Исправление —
  `key={entity.id}` на дочернем компоненте: перемонтирует только его, данные уже
  приходят свойствами из кэша родителя, без повторного запроса. Случай:
  BookPage/BookDetail — отметка «прочитано» и рейтинг при переходе по списку
  книг серии.

## LSP (TypeScript)

Принцип «LSP вместо grep» из корневого `CLAUDE.md`. Для frontend используется
language server поверх `tsserver` (через инструмент `LSP`). Работает на файлах
`.ts` и `.tsx`.

Типичные операции:

- `workspaceSymbol` — найти где определён символ во всём проекте. Полезно для
  проверки «существует ли экспорт X», «в каком файле объявлен Y».
- `documentSymbol` — все символы (функции, классы, типы, константы) в одном
  файле. Полезно для проверки «есть ли в файле такой-то экспорт», «какова
  структура файла» без полного Read.
- `findReferences` — все использования символа. Полезно для проверки «где
  вызывается helper X», «сколько call-sites у функции Y», «мигрирован ли
  хук в правильное число потребителей».
- `goToDefinition` — куда указывает импорт или вызов. Полезно для перехода
  от call-site к определению при review.
- `goToImplementation` — для интерфейсов и абстрактных методов. На frontend
  редко (мало interfaces).
- `hover` — сигнатура и docstring символа на позиции. Полезно для проверки
  «совпадает ли сигнатура X с тем, что я ожидаю».
- `outgoingCalls` / `incomingCalls` — кому звонит функция / кто звонит ей.
  Полезно для проверки «компонент действительно render-only — не вызывает
  useEffect/useCachedResource в outgoing». Требует
  `prepareCallHierarchy` сначала.

Позиция в `LSP`-вызове — 1-based `line`/`character`, как в редакторе. Курсор
ставится на любой character внутри identifier'а символа.

**Когда LSP не помогает:** проверка отсутствия конкретного текстового
шаблона (`grep -n 'metadataCache.set(' file.tsx`), дифф-сверка между
ветками (`git diff main`), инспекция полного тела функции (Read).

## Vendored Code

- **`src/vendor/foliate-js/` — полный форк, не upstream vendor copy.** Upstream
  больше не тянется, апдейты от оригинального maintainer'а не забираются.
  Код под `vendor/foliate-js/` — такой же owned code, как и всё остальное во
  frontend. Править можно наравне с остальным проектным кодом. Не воспринимать
  как third-party или "untouchable vendor".

- **Размеры/раскладку в рендер-коде ридера НЕ вычислять через JS-замер layout**
  (`offsetHeight` / `getBoundingClientRect`) элементов в момент рендера —
  результат расходится между Blink / WebKit / PWA (зависит от тайминга
  колонизации и загрузки шрифтов: один движок успел посчитать, другой нет).
  Величины, зависящие от раскладки/шрифтов, отдавать **браузеру через CSS**
  (flex/grid) — он считает консистентно и пересчитывает при загрузке шрифта.
  JS использовать только для **стабильных** величин из `#layout` (геометрия
  страницы: высота колонки, поля — одинаковы во всех движках). Образец —
  `cover-fit.js` (считает от naturalSize + `#layout`, не от измеренного layout
  соседних элементов). Кейс, родивший правило: 0q54.4 — замер `offsetHeight`
  заголовка в `setImageSize` работал в Chrome, но пересжимал картинку в Safari
  и рвал связку в PWA; починилось переходом на CSS-flex.

- **Sizing/layout-код ридера принимать ВИЗУАЛЬНО в нескольких движках**
  (Chrome + Safari + PWA), не только юнитами. Зелёные vitest + чистое ревью
  кода НЕ доказывают cross-browser корректность раскладки: jsdom не считает
  layout, mock'и не воспроизводят движковые различия. Юнит покрывает чистую
  логику/предикаты; реальную раскладку — глаза в каждом движке.
