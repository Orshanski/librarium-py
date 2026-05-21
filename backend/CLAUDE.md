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
