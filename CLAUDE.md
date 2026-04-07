# CLAUDE.md

## Project Overview

**Librarium** — personal family web library, self-hosted Calibre-Web replacement. Python (FastAPI) + React (TypeScript) + SQLite.

## Commands

```bash
# Backend
cd backend && source venv/bin/activate
python run.py              # Production server :8000
python run.py --dev        # Dev server with reload

# Frontend
cd frontend
npm run dev                # Dev server :5173 (proxy /api → :8000)
npm run build              # Production build → dist/
```

## Architecture

- **Backend:** FastAPI, Uvicorn, SQLite (WAL), JWT auth (bcrypt + PyJWT)
- **Search:** LIKE substring search (title, author, series). No FTS5.
- **Frontend:** React 19, TypeScript, Vite, React Router 7, inline CSS, responsive (desktop/mobile)
- **Pattern:** React SPA → fetch /api/* → FastAPI routers → DAL → SQLite
- **Auth:** JWT in HTTP-only cookie, roles: admin / reader
- **Styling:** Inline CSS objects, theme in `frontend/src/theme.ts`

### Key Directories

- `backend/app/routers/` — API route modules
- `backend/app/dal/` — data access modules
- `backend/app/parsers/` — FB2, EPUB, PDF metadata extraction
- `backend/app/providers/` — Litres.ru, Google Books metadata search
- `backend/tests/` — pytest (auth, upload, delete, merge, parsers)
- `frontend/src/pages/` — page components
- `frontend/src/components/` — shared components (logic + types)
- `frontend/src/components/desktop/` — desktop layout components
- `frontend/src/components/mobile/` — mobile layout components
- `frontend/src/responsive.ts` — ResponsiveProvider, useIsMobile() (breakpoint 768px)
- `data/` — SQLite DB, library files, thumbs, uploads (not in git)

### Data Flow

```
Browser → React SPA (:5173 dev) → fetch /api/* → FastAPI (:8000) → DAL → SQLite
                                                                    → filesystem (data/)
```

## Code Rules

- **No `any` in TypeScript.** Never use `as any` or `any` type. Extend interfaces, add optional fields, or create union types instead.
- **Validate API inputs.** Use Pydantic `Field(ge=..., le=...)` for numeric ranges. Don't trust client data.
- **DB constraints.** Add UNIQUE indexes for business rules, don't rely only on application logic.

## Development Process

### Порядок разработки (ОБЯЗАТЕЛЬНЫЙ)

1. **Ветка.** Создать feature branch от main.
2. **План.** Согласовать подход с Alexey (plan mode для нетривиальных задач).
3. **Тесты.** Написать тесты ПЕРЕД реализацией (TDD).
4. **Реализация.** Код, прогон тестов.
5. **Ручное тестирование.** Alexey проверяет руками. Ждать результат.
6. **Коммит.** Только после одобрения Alexey.
7. **Код-ревью.** Запустить ревьюера, показать ВСЕ findings.
8. **Фикс findings.** Исправить все замечания, повторить тесты.
9. **Мерж.** ТОЛЬКО по явной команде Alexey ("мержи", "мерж", "да").
10. **Пуш.** ТОЛЬКО по явной команде Alexey. Мерж ≠ пуш, разрешение на каждое действие отдельно.

### Правила

- **Показывать ВСЕ findings из код-ревью.** Не фильтровать, не предлагать "отложить". Решение о приоритете — только за Alexey.
- **НИКОГДА не мержить/пушить без явного разрешения.** При любой двусмысленности — переспросить.
- **Never work in main.** Always create a feature branch.
- **TDD:** tests first, then implementation.
- CI/CD triggers only on push to `main` on GitHub. Local branch work does not deploy.


<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Use `bd remember` for project knowledge — NOT memory files
- Personal feedback (how to work with Alexey) stays in memory files
- Run `bd prime` for detailed command reference

## Session Completion

**When ending a work session**, complete these steps:

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **bd dolt push** - Push beads data to remote
5. **Hand off** - Provide context for next session
6. **Мерж/пуш** - ТОЛЬКО по явной команде Alexey (см. "Порядок разработки" выше)
<!-- END BEADS INTEGRATION -->
