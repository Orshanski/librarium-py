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

## Development Process

- **Never work in main.** Always create a feature branch.
- **TDD:** tests first, then implementation.
- **Commit only with user approval**, after manual testing.
- CI/CD triggers only on push to `main` on GitHub. Local branch work does not deploy.
- Never push without explicit confirmation.
