# Librarium

Self-hosted home library for ebooks. Built as a replacement for Calibre-Web.

![Catalog](docs/screenshots/01-catalog.png)

## Why

We needed a simple way to keep our family book collection — FB2, EPUB, PDF — accessible from any device without installing Calibre or syncing files. Drop a book in, metadata gets extracted, cover appears, everyone reads through a browser.

## Features

### Catalog

Books are displayed as a grid of covers. Filters by author, series, genre, and language are interdependent — picking an author narrows down the available genres, and so on. Sort by date added, title, author, or rating. Infinite scroll that remembers your position when you come back.

![Catalog with filters](docs/screenshots/12-tag-detail.png)

### Upload

Drag and drop FB2, EPUB, PDF, or ZIP files. Metadata is extracted automatically — title, authors, series, description, language, genres, ISBN, cover. Batch uploads work. Before saving, you can edit metadata, search external catalogs (Litres.ru, Google Books), or swap the cover. Duplicates are detected on the fly.

**PDF metadata via LLM.** PDF files don't usually carry useful metadata in the file itself, so Librarium sends the filename to Claude (Anthropic API) with web search enabled, and gets back title, authors, publisher, year, ISBN, annotation, genres, and a direct cover URL. The cover is downloaded from the publisher's CDN; if that fails, the first page of the PDF is rendered as a fallback. Cover URL fetches go through SSRF protection (no redirects to internal IPs). Works even when the filename is mangled or transliterated ("Savelev_Statistika-i-kotiki.pdf" → "Владимир Савельев / Статистика и котики"). Requires `ANTHROPIC_API_KEY` in env; if absent, falls back to filename-as-title and rendered cover.

![Upload](docs/screenshots/08-upload.png)

### Book page

Cover, description, all metadata, read and download links for each format. Find similar books via Litres.ru. If the book belongs to a series, other books in the series are shown alongside. Rate it (1–5 stars), mark as read, or add to a shelf.

![Book](docs/screenshots/02-book-detail.png)

### Editing

Admins can edit everything — title, authors, series, description, genres, language, publisher, ISBN. Replace the cover, add or remove file formats. Pull better metadata from external catalogs in a couple of clicks.

![Edit](docs/screenshots/11-book-edit.png)

### Search

Searches across book titles, authors, and series names. Results are grouped by type.

![Search](docs/screenshots/07-search.png)

### Shelves

Two built-in smart shelves: "Best" collects books rated 4–5 stars, "Reading Now" shows books with saved reading progress (tap the cover to jump straight into the reader). Create your own shelves and add books to them. Each user has their own set.

### Authors, series, genres

Dedicated pages with filters and book counts. Genre cloud sized by popularity. Navigate freely: author → books → series → all books in series.

Admins can rename and merge authors and series. Genres support smart mapping: when a book arrives with a raw genre code (e.g., `fantasy_fight`), it's stored as-is. On the genre page, an admin can map it to an existing genre like "Боевое фэнтези" — all books are reassigned, and future imports with the same code are resolved automatically.

![Authors](docs/screenshots/03-authors.png)

![Series](docs/screenshots/04-series.png)

![Tags](docs/screenshots/05-tags.png)

### Multi-user

Two roles: admin (full access — upload, delete, manage users) and reader (browse, download, rate, shelves). Ratings and shelves are per-user. A reader can hide a book — it disappears from their catalog without affecting others.

### Admin panel

User management, app settings, SMTP configuration for email notifications.

![Admin](docs/screenshots/09-admin.png)

### Built-in reader

Read EPUB, FB2, MOBI, CBZ, and PDF directly in the browser. Powered by [foliate-js](https://github.com/johnfactotum/foliate-js). Customizable theme (dark/warm/light), font family, size, line spacing, hyphenation, and text justification. Reading progress and settings are saved per user, per device. Footnotes appear as inline popups without leaving the page.

![Reader](docs/screenshots/17-desktop-reader.png)

![Footnote popup](docs/screenshots/18-desktop-reader-footnote.png)

### Mobile

The entire UI adapts to phones and tablets. Bottom tab bar for navigation, swipeable drawer for shelves, and a dedicated mobile reader with optimized margins and safe area support. Install as a PWA from the home screen for a native app experience without browser chrome.

<p>
  <img src="docs/screenshots/13-mobile-catalog.png" width="240" alt="Mobile catalog" />
  <img src="docs/screenshots/14-mobile-book-detail.png" width="240" alt="Mobile book detail" />
  <img src="docs/screenshots/15-mobile-reader.png" width="240" alt="Mobile reader" />
</p>

### Security

- JWT authentication with HTTP-only cookies
- CSP, HSTS, TLS 1.2+
- All auth events and data mutations are logged
- SPA route whitelist — unknown paths return 404

#### Nginx CSP for the reader

The built-in reader uses iframes with `blob:` URLs. The following CSP directives are required:

```
add_header Content-Security-Policy "
  default-src 'self';
  style-src 'self' 'unsafe-inline' blob: https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com;
  img-src 'self' data:;
  connect-src 'self';
  frame-src 'self' blob:;
  script-src 'self' 'unsafe-inline' blob: https://static.cloudflareinsights.com;
  frame-ancestors 'self'
" always;
```

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python, FastAPI, Uvicorn |
| Database | SQLite (WAL mode) |
| Auth | JWT + bcrypt |
| Book parsing | lxml (FB2/EPUB), PyMuPDF (PDF cover render), Pillow (covers) |
| Metadata | Litres.ru, Google Books API, Anthropic Claude (PDF via web search) |
| Frontend | React 19, TypeScript, React Router 7 |
| Reader | [foliate-js](https://github.com/johnfactotum/foliate-js) (EPUB, FB2, MOBI, CBZ, PDF) |
| Responsive | Desktop + mobile layouts (820px breakpoint), PWA |
| Build | Vite 6 |
| Styling | Inline CSS, no framework |
| Tests | pytest (214 tests) |
| CI/CD | GitHub Actions |

## Getting started

### Prerequisites

- Python 3.12+
- Node.js 25+

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python run.py          # http://localhost:8000
python run.py --dev    # with auto-reload
```

#### Optional: LLM metadata extraction for PDFs

To enable LLM-based metadata extraction for PDF uploads, put your Anthropic API key in `backend/.env`:

```
ANTHROPIC_API_KEY=sk-ant-api03-...
# optional overrides:
# ANTHROPIC_MODEL=claude-sonnet-4-6
# ANTHROPIC_TIMEOUT_SEC=60
```

The file is auto-loaded at startup via `python-dotenv`. Without the key, PDF parsing falls back to filename-as-title and a rendered first-page cover.

### Frontend

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173 (proxies /api → :8000)
npm run build          # production build → dist/
```

### Create an admin user

```bash
cd backend
source venv/bin/activate
python -c "
from app.database import get_db, init_db
from app.auth import hash_password
init_db()
db = get_db()
db.execute(
    'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
    ('admin', hash_password('admin'), 'admin')
)
db.commit()
"
```

### Seed tag mappings

Populate the FB2 genre code → human-readable tag mapping table:

```bash
cd backend
source venv/bin/activate
python scripts/seed_tag_mappings.py ../data/db.sqlite
```

## Project structure

```
librarium-py/
├── backend/
│   ├── run.py              # Uvicorn entry point
│   ├── schema.sql          # DB schema
│   ├── requirements.txt
│   └── app/
│       ├── main.py         # FastAPI app, SPA fallback
│       ├── config.py       # Paths, JWT settings, limits
│       ├── database.py     # SQLite connection pool
│       ├── auth.py         # JWT + bcrypt
│       ├── routers/        # API endpoints (14 modules)
│       ├── dal/            # Data access layer (8 modules)
│       ├── parsers/        # FB2, EPUB, PDF metadata extraction
│       ├── providers/      # Litres, Google Books lookup
│       └── tests/          # pytest suite
├── frontend/
│   ├── src/
│   │   ├── pages/              # Page components
│   │   ├── components/         # Shared components
│   │   ├── components/desktop/ # Desktop layout
│   │   ├── components/mobile/  # Mobile layout
│   │   └── responsive.ts       # Breakpoint provider
│   └── vite.config.ts
├── docs/
│   ├── spec.md                 # Technical specification
│   └── screenshots/            # UI screenshots
└── data/                       # Not in git
    ├── db.sqlite
    ├── library/{id}/           # Book files and covers
    ├── thumbs/                 # Thumbnail cache
    └── uploads/                # Temporary upload staging
```
