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

## SonarCloud (local scan)

Repo is private — SonarCloud branch automation does not run. Local scans only.

**Always use the wrapper:**

```bash
./scripts/sonar-scan.sh
```

It sources `~/.zshrc` for `SONAR_TOKEN` and runs from repo root. A naive
`sonar-scanner -Dsonar.token=$SONAR_TOKEN` from a non-interactive shell
sends an **empty** token and uploads garbage analysis. Do not run the
bare command.

To read existing findings without re-scan: use
`mcp__sonarqube__search_sonar_issues_in_projects`. SonarCloud has the
latest data from the last successful scan.
