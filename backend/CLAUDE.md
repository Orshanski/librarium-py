# Backend — CLAUDE.md

Python (FastAPI) + SQLite. Конвенции, специфичные для `backend/`.
Общие правила проекта — в корневом `CLAUDE.md`.

## Commands

```bash
cd backend && source venv/bin/activate
python run.py              # Production server :8000
python run.py --dev        # Dev server with reload
pytest                     # Тесты — ВСЕГДА последовательно, не параллельно
```

## Key Directories

- `app/routers/` — API route modules
- `app/dal/` — data access modules (aiosql + sqlite3)
- `app/parsers/` — FB2, EPUB, PDF metadata extraction
- `app/providers/` — Litres.ru, Google Books metadata search
- `app/services/` — бизнес-логика поверх DAL
- `tests/` — pytest (auth, upload, delete, merge, parsers)

## Code Rules

- **Валидация API inputs.** Pydantic `Field(ge=..., le=...)` для числовых диапазонов.
  Не доверять данным от клиента.
- **DB constraints.** UNIQUE индексы для бизнес-правил — не полагаться только
  на application logic.
- **aiosql.** DAL-методы (`get_authors`, `insert_book` etc.) генерируются
  динамически из `*.sql` файлов. Pyright не видит их без stub'а
  (`backend/typings/aiosql/`); если правишь stub — проверь, что
  `Queries.__getattr__ → Any` сохранён.
- **Логирование user-provided значений — defense-in-depth cast.**
  Параметры из path/body/query (даже когда Pydantic валидирует их как
  `int`/`str` через type-аннотацию или `Field(ge=, le=)`) при попадании
  в `log.info`/`log.warning`/`log.error` оборачивай в явный `int(x)` /
  `str(x)`. Pydantic-валидация не видна CodeQL и SonarCloud
  taint-tracker'ам — без cast'а они поднимают `py/log-injection`. Cast
  — no-op runtime (`int(int)` → тот же int, `str` от `%s` идентичен
  `%s` от int), но обрывает taint-flow для статанализа. Пример —
  `app/routers/shelves.py:90-95` (`log.warning(..., int(shelf_id),
  int(body.book_id), str(user.user_id))`).

- **CodeQL `py/path-injection` — sanitizer, не suppression.** Не глушить
  `# codeql[py/path-injection]`. Канонический barrier перед FS-sink'ом
  (`os.remove`/`os.rename`/`shutil.rmtree`):

  ```python
  path = os.path.normpath(os.path.join(_LIBRARY_ROOT, str(int(book_id)), name))
  if not path.startswith(_LIBRARY_ROOT_PREFIX):
      raise BadInputError(f"Path escapes allowed root: {path}")
  ```

  Тонкости: `normpath`, не `realpath` (CodeQL trace'ит только синтаксис);
  префикс с `+ os.sep` (иначе `/lib/books` пройдёт `startswith("/lib/book")`);
  inline у sink'а — через helper barrier CodeQL не доказывает. Для UPLOADS_DIR
  — готовый `fs_utils.assert_within(UPLOADS_DIR, candidate)`. Примеры —
  `book_service.py:135-136`, `:244-251`, `:188`.

## Type Checking (pyright)

Конфиг в корне репо: `pyrightconfig.json`. Запуск:

```bash
# Из корня репо
pyright                    # Полный прогон
# Или из backend/ — конфиг найдётся вверх по дереву
```

- `include`: только `backend/app`. Тесты исключены — паттерн
  «insert → assert после» даёт шум, runtime валидация важнее.
- `typeCheckingMode: basic`. Strict не включён — слишком много
  cast'ов потребуется.
- Известные «чужие» проблемы (заглушены `# pyright: ignore`):
  lxml `etree`, `requests.compat`, Pydantic `Field(default_factory=...)`,
  PyMuPDF `fitz`.

## LSP (Python)

Принцип «LSP вместо grep» из корневого `CLAUDE.md`. Для backend используется
тот же language server, который читает `pyrightconfig.json` (см. выше — pyright).
Работает на файлах `.py` в `backend/app/`.

Типичные операции (через инструмент `LSP`):

- `workspaceSymbol` — найти где определён символ во всём backend. Полезно для
  «существует ли функция / класс / Pydantic-модель X», «в каком модуле она
  объявлена».
- `documentSymbol` — структура одного `.py`-файла: классы, функции, методы,
  глобальные константы. Полезно для проверки «есть ли в роутере такой
  endpoint», «какова структура DAL-модуля» без полного Read.
- `findReferences` — все использования символа. Полезно для проверки «где
  вызывается DAL-метод X», «кто импортирует service Y», «затронут ли мой
  endpoint при рефакторинге типа Z».
- `goToDefinition` — куда указывает имя при impl-чтении. Полезно для перехода
  от router handler'а к DAL-функции.
- `hover` — сигнатура и docstring. Полезно для проверки «совпадает ли
  Pydantic-модель в роутере с тем, что я думал».
- `incomingCalls` / `outgoingCalls` — кто вызывает функцию / кому она звонит.
  Полезно для трассировки «service → DAL → SQL» при ревью изменений.

**Особенность aiosql:** методы `Queries.get_books()`, `Queries.insert_book()`
и т.п. генерируются динамически из `*.sql` файлов. Pyright их видит через
stub'ы в `backend/typings/aiosql/`. LSP `workspaceSymbol` на конкретный DAL-метод
их найдёт через stub-файл, но `goToDefinition` укажет на stub, не на реальный
`.sql`-файл — это известное ограничение. Для понимания SQL — Read соответствующего
`.sql`-файла в `backend/app/dal/`.

Позиция в `LSP`-вызове — 1-based `line`/`character`. Курсор ставится на любой
character внутри identifier'а символа.

**Когда LSP не помогает:** проверка отсутствия конкретного текстового
шаблона (`grep -n 'log.warning(' file.py`), дифф-сверка веток (`git diff main`),
инспекция полного тела функции (Read), SQL-запросы в `.sql`-файлах
(LSP их не индексирует — Read).

## SonarCloud

Прогон только локальный — через wrapper:

```bash
./scripts/sonar-scan.sh
```

Wrapper подтягивает `SONAR_TOKEN` из `~/.zshrc` и запускает scanner из
корня репо. Голый `sonar-scanner -Dsonar.token=$SONAR_TOKEN` из
non-interactive shell отправляет пустой токен и загружает мусорный
анализ в SonarCloud — не вызывать напрямую.

Чтобы посмотреть существующие findings без перепрогона —
`mcp__sonarqube__search_sonar_issues_in_projects`. SonarCloud держит
данные последнего успешного скана.
