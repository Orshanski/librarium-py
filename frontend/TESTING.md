# Frontend Testing

## Philosophy

1. **Тестируем поведение, не реализацию.** Переименование internal-функции не должно ломать тест.
2. **Ценность > coverage.** Каждый тест отвечает на вопрос "что сломается в продукте, если я его удалю".
3. **Критические UX-флоу > внутренности.** Лучше 1 integration, чем 10 unit на presentation.
4. **Не всё автоматизируется.** Reader interactions и визуал — ручной прогон.

## Категории тестов

- **Logic unit** (`*.test.ts` рядом с модулем) — чистые функции без DOM. Пример: `src/utils/sanitize-html.test.ts`.
- **Infrastructure unit** — модули с edge side-effects (storage, api client). Mocks только на границе.
- **Page / integration** (`*.test.tsx`) — через `renderWithProviders` + MSW. Пример: `src/test/references/integration.test.tsx`.
- **Error-handling** — частный случай integration. Пример: `src/test/references/error-handling.test.tsx`.
- **E2E** — не пишем по умолчанию.

## Что НЕ тестируем

- Inline styles, pixel-perfect layout.
- Каждый presentational component по отдельности.
- Internal state хуков, private helpers.
- Reader interactions глубоко (foliate tap zones, pagination).
- Vendor foliate-js — покрывается через integration reader-слоя.
- Third-party library behavior (React Router, PDF.js).

## TDD-first per-test

Применяется nuanced:
- **Logic / infrastructure unit:** классический TDD.
- **Integration для рефакторинговых эпиков:** тест baseline → рефактор → тест зелёный.
- **Integration для новых фич:** тест → реализация.
- **Adapter boundary:** тест и код в одном коммите.
- **Presentational components:** не требуется.

## Definition of done для теста

- Название описывает ЧТО проверяется, а не КАК.
- Осмысленная причина падения.
- Не зависит от порядка выполнения.
- Mocks isolated per test (гарантируется `server.resetHandlers()` в `afterEach`).
- Остаётся зелёным при рефакторе внутренностей.
- Читается без нужды лезть в source.

## How to write an integration test

1. Импортируй `renderWithProviders` из `@/test/render`.
2. Импортируй `server` из `@/test/msw/server`.
3. В `it(...)`: вызывай `server.use(http.METHOD("/api/...", () => HttpResponse.json({...})))` чтобы заявить API response для этого теста.
4. Вызывай `renderWithProviders(<Page />, { initialEntries: [...] })` если страница читает URL query params.
5. Используй `screen.getByText` / `findByText` / `waitFor` для наблюдаемых выходов.

Минимальный пример — `src/test/references/integration.test.tsx`.

## How to write an error-handling test

Тот же pattern integration, но:
1. MSW handler возвращает `HttpResponse.json({detail: ...}, { status: <4xx|5xx> })`.
2. Assertion — на стабильный chrome элемент страницы (проверка что страница не крашнулась) + отсутствие результатов happy-path.

Пример — `src/test/references/error-handling.test.tsx`.

## Как override auth в тесте

По умолчанию `/api/auth/me` возвращает admin с полным shape (см. `src/test/msw/handlers.ts`). Для reader / anon в `beforeEach` или внутри `it`:

```ts
server.use(http.get("/api/auth/me", () =>
  HttpResponse.json({ id: 2, username: "reader", displayName: "Reader",
                     email: null, role: "reader" })
));
// Для anon:
server.use(http.get("/api/auth/me", () => new HttpResponse(null, { status: 401 })));
```

## Страницы с dynamic route params

`renderWithProviders` использует `MemoryRouter` — `useSearchParams` работает сразу через initial entry query string, но `useParams()` (например `SimilarBooksPage` c `/book/:id/similar` — см. `src/App.tsx:96`) требует локальной обёртки:

```tsx
import { Routes, Route } from "react-router-dom";

renderWithProviders(
  <Routes>
    <Route path="/book/:id/similar" element={<SimilarBooksPage />} />
  </Routes>,
  { initialEntries: ["/book/1/similar"] }
);
```

Это локальный pattern — не тянем в `renderWithProviders`, чтобы helper оставался простым.

## Команды

- `npm run test` — один прогон.
- `npm run test -- --watch` — watch mode для dev.
- `npm run test -- src/path/to/file.test.tsx` — один файл.
