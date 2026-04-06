# Librarium — Technical Specification

Personal digital library for family use. Self-hosted replacement for Calibre-Web with in-app reader.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.12, FastAPI, Uvicorn |
| Database | SQLite 3 (WAL) |
| Auth | JWT (bcrypt + PyJWT), HTTP-only cookies |
| Book parsing | lxml (FB2/EPUB), Pillow, PyMuPDF (PDF), pikepdf (PDF linearize) |
| PDF metadata | Anthropic Claude API (Sonnet 4.6) with web search + PyMuPDF cover render |
| Metadata search | Litres.ru, Google Books API |
| In-app reader | foliate-js (EPUB/FB2 paginator, PDF via PDF.js fixed-layout) |
| Frontend | React 19, TypeScript, React Router 7 |
| Build | Vite 6 |
| Styling | Inline CSS, theme in `theme.ts`, no framework |
| Responsive | Desktop/Mobile layout (breakpoint 820px) |
| Tests | pytest (backend), Vitest (frontend) |
| CI/CD | GitHub Actions → SSH deploy |

## Architecture

```
Browser → React SPA (:5173 dev / static prod)
           ↓ fetch /api/*
         FastAPI (:8000)
           ├── Routers (16 modules)
           ├── DAL (11 modules)
           ├── Parsers (FB2, EPUB, PDF, PDF-LLM, PDF-render, cover-fetcher)
           ├── Providers (Litres, Google Books)
           └── Utils (cover-embedder, pdf-linearize)
           ↓ SQL
         SQLite (WAL)
           ↓ fs
         data/ (library files, thumbs, uploads)
```

### Data Flow

- Frontend — client-only React SPA, fetches all data from `/api/*`
- Backend — FastAPI app, serves API + static frontend build (SPA fallback)
- Auth — JWT in HTTP-only cookie `librarium_token`, 72h TTL
- Roles: `admin` (full access), `reader` (view, rate, shelves, download, in-app reader)

### File Storage

```
data/
├── db.sqlite            # Database (WAL mode)
├── library/{book_id}/   # Book files + covers
│   ├── cover.jpg
│   ├── book.fb2
│   ├── book.epub
│   └── book.pdf         # Linearized (Fast Web View)
├── thumbs/{book_id}.jpg # Cached thumbnails (300px height)
└── uploads/             # Temp staging for uploads
```

## Database Schema

### Core Tables

**books** — id, title, sort_title, description, language, publisher, pub_date, series_id, series_number, cover_path, added_at, updated_at

**authors** — id, name, sort_name

**series** — id, name, sort_name

**tags** — id, name, code

**tag_mappings** — raw_tag (PK), tag_id → maps raw genre codes (e.g. `sf_fantasy`) to tags. Populated by seed script from FB2 genre dictionary. Unknown genres at import time create a self-mapping (raw_tag = name). Admins remap via tag page UI.

**users** — id, username, display_name, email, password_hash, role, created_at

**shelves** — id, name, user_id, is_system, created_at

**settings** — key, value (app_name, smtp_*)

**password_reset_tokens** — id, user_id, token, expires_at, created_at

### Junction Tables

**book_authors** — book_id, author_id

**book_tags** — book_id, tag_id

**book_files** — id, book_id, format (FB2/EPUB/PDF), file_path, file_size, file_hash

**book_identifiers** — id, book_id, type (ISBN, LITRES_ID, ...), value

**shelf_books** — shelf_id, book_id, added_at

**user_books** — user_id, book_id, is_read, is_hidden, rating (1-5)

### Reader Tables

**reader_settings** — user_id, device_type, settings (JSON) — PK (user_id, device_type). Stores font, theme, tap zones, hyphenation, justify, PDF tap zones per device.

**reading_progress** — user_id, book_id, position (JSON: `{kind: "cfi"|"page", value: ...}`), last_device, last_format, fraction (0..1), last_read_at — PK (user_id, book_id). Indexed on book_id.

### Search

LIKE-based substring search on title, author name, series name. No FTS5.

### Indexes

On: books(series_id, added_at, sort_title), book_authors(author_id), book_tags(tag_id), tag_mappings(tag_id), book_files(book_id), book_identifiers(book_id, type+value), shelf_books(book_id), user_books(book_id), reading_progress(book_id), authors(sort_name), series(sort_name).

## API Endpoints

### Auth

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /api/auth/login | — | Login → JWT cookie |
| GET | /api/auth/me | yes | Current user |
| POST | /api/auth/logout | — | Clear cookie |

### Books

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/books | yes | List with filters (author, series, tag, language), sort, cursor pagination |
| GET | /api/books/{id} | yes | Detail (metadata, files, identifiers) |
| PUT | /api/books/{id} | admin | Update metadata |
| DELETE | /api/books/{id} | admin | Delete book + files |
| POST | /api/books/{id}/files | admin | Upload format (direct to existing book) |
| DELETE | /api/books/{id}/files?format= | admin | Delete format |
| GET | /api/books/{id}/similar | yes | Similar books by shared authors/tags/series |
| GET | /api/books/{id}/download?format= | yes | Download file |

### Covers

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/covers/{id} | — | Thumbnail (300px); `?full=1` original; `?t=` cache bust |
| POST | /api/books/{id}/cover | admin | Upload cover |
| PUT | /api/books/{id}/cover | admin | Replace cover |
| DELETE | /api/books/{id}/cover | admin | Remove cover |
| GET | /api/uploads/cover/{temp_id} | admin | Temp cover preview during upload |

### User–Book Interaction

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/books/{id}/status | yes | Rating, read, hidden |
| PUT | /api/books/{id}/rating | yes | Set 1-5 or null |
| PUT | /api/books/{id}/read | yes | Mark read/unread |
| PUT | /api/books/{id}/hidden | yes | Hide/unhide |

### Reader

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/reader/settings | yes | Get reader settings (font, theme, tap zones) per device |
| PUT | /api/reader/settings | yes | Save reader settings |
| GET | /api/reader/progress/{book_id} | yes | Get reading position (JSON `{kind, value}` + fraction) |
| PUT | /api/reader/progress/{book_id} | yes | Save position, device, format, fraction |

### Authors / Series / Tags

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/authors | yes | List with book counts, filters |
| GET | /api/authors/{id} | yes | Detail + books |
| PUT | /api/authors/{id} | admin | Update author name/sort_name |
| POST | /api/authors/{id}/merge | admin | Merge author into another |
| DELETE | /api/authors/{id} | admin | Delete author (if no books) |
| GET | /api/series | yes | List with book counts, filters |
| GET | /api/series/{id} | yes | Detail + ordered books |
| PUT | /api/series/{id} | admin | Update series name/sort_name |
| POST | /api/series/{id}/merge | admin | Merge series into another |
| DELETE | /api/series/{id} | admin | Delete series (if no books) |
| GET | /api/tags | yes | List with book counts |
| GET | /api/tags/{id} | yes | Detail + books with filters |
| PUT | /api/tags/{id}/map | admin | Map tag to existing (merge) or new name (rename). Updates tag_mappings for future imports |

### Shelves

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/shelves | yes | User shelves (+ system "Лучшее" for 4-5★) |
| POST | /api/shelves | yes | Create shelf |
| GET | /api/shelves/{id} | yes | Shelf + books |
| PUT | /api/shelves/{id} | yes | Rename |
| DELETE | /api/shelves/{id} | yes | Delete (not system) |
| POST | /api/shelves/{id}/books | yes | Add book |
| DELETE | /api/shelves/{id}/books/{bid} | yes | Remove book |

### Search, Upload, Metadata

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/search?q= | yes | LIKE search (title, author, series) |
| POST | /api/upload | admin | Upload book file (FB2/EPUB/PDF/ZIP) → parse metadata → temp storage |
| POST | /api/books/create | admin | Create book from temp upload (with edited metadata) |
| POST | /api/books/{id}/add-format | admin | Add format to existing book from temp upload |
| DELETE | /api/uploads/{temp_id} | admin | Clean temp files |
| GET | /api/metadata/search?q= | yes | Search Litres + Google Books |
| GET | /api/metadata/cover-proxy?url= | yes | Proxy cover image (whitelisted domains) |

### Admin

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/admin/users | admin | List users |
| POST | /api/admin/users | admin | Create user |
| PUT | /api/admin/users/{id} | admin | Update user |
| DELETE | /api/admin/users/{id} | admin | Delete user |
| GET | /api/admin/settings | admin | Get settings |
| PUT | /api/admin/settings | admin | Update settings |
| POST | /api/admin/smtp-test | admin | Send test email |

### Other

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/options | yes | All authors, series, tags, languages, publishers |
| GET | /api/health | — | Health check |

## Backend Structure

```
backend/
├── run.py              # Uvicorn entry (--dev for reload)
├── requirements.txt
├── schema.sql
├── scripts/            # One-off migrations
│   ├── seed_tag_mappings.py
│   └── normalize_tag_names.py
└── app/
    ├── main.py         # FastAPI app, SPA fallback, CORS
    ├── config.py       # Paths, JWT, limits, env loading (.env via python-dotenv)
    ├── database.py     # SQLite pool (thread-local)
    ├── auth.py         # JWT create/verify, bcrypt, get_current_user, require_admin
    ├── cover_embedder.py # Embed cover into FB2/EPUB for exported files
    ├── pdf_linearize.py  # pikepdf linearize in place (Fast Web View)
    ├── routers/        # 16 route modules
    ├── dal/            # 11 data access modules
    ├── parsers/        # Book format parsers
    │   ├── fb2.py
    │   ├── epub.py
    │   ├── pdf.py          # Main PDF parser (delegates to LLM)
    │   ├── pdf_llm.py      # Claude API metadata extraction
    │   ├── pdf_render.py   # PyMuPDF first-page → cover JPEG
    │   └── cover_fetcher.py # External cover URL → bytes (validated)
    ├── providers/      # Litres, Google Books → MetadataResult
    └── templates/      # Email templates (SMTP test)
```

### Book Parsing

- **FB2**: XML parsing via lxml — title, authors, series, genres, description, language, cover (base64). Parser returns raw genre codes; mapping to human-readable names happens in upload flow via `tag_mappings` table (~270 codes seeded from FB2 spec)
- **EPUB**: ZIP → META-INF/container.xml → OPF → metadata + cover image
- **PDF**: Metadata extracted via Anthropic Claude API (Sonnet 4.6) with web search grounding, using the first few pages as context + original filename as hint. Cover rendered from first page via PyMuPDF. File is linearized (pikepdf) on upload for Fast Web View streaming.

### PDF Linearization

All uploaded PDFs are linearized in-place on entry to the library using pikepdf (qpdf backend). Linearization reorders the PDF so PDF.js can begin rendering the first page before the whole file is fetched — important for serving large books over a network.

### Metadata Providers

- **Litres.ru**: Search by title/author, returns metadata + cover URL
- **Google Books**: Volumes API, international coverage
- **Cover proxy**: Whitelist of allowed domains, fetched via `/api/metadata/cover-proxy`, redirect-validated (SSRF protection)

## Frontend Structure

```
frontend/
├── index.html
├── vite.config.ts          # Port 5173, /api proxy to :8000
├── package.json
└── src/
    ├── main.tsx            # React root, BrowserRouter, AuthProvider
    ├── App.tsx             # Routes (all behind ProtectedRoute)
    ├── auth.tsx            # AuthContext, useAuth(), ProtectedRoute
    ├── api.ts              # Fetch wrapper (credentials, JSON)
    ├── types.ts            # TypeScript interfaces
    ├── theme.ts            # Color palette + layout constants (breakpoint 820)
    ├── responsive.ts       # ResponsiveProvider, useIsMobile()
    ├── vendor/foliate-js/  # Local patched copy of foliate-js reader
    ├── pages/              # 18 page components (desktop/, mobile/ subdirs)
    ├── components/         # 27 shared components (logic + types)
    ├── components/desktop/ # 10 desktop layout components
    └── components/mobile/  # 13 mobile layout components
```

Public `frontend/public/pdfjs/` — PDF.js distribution (cmaps, fonts, worker). Loaded via `<script type=module>` tag to bypass Vite dev server's .mjs transform that breaks PDF.js workers.

### Responsive Architecture

Desktop/mobile separation via `ResponsiveProvider` (breakpoint 820px). Shared components contain business logic and type definitions. Platform-specific layout components in `desktop/` and `mobile/` directories render the UI using shared logic.

Pattern: `BookDetail` (logic) → `useIsMobile()` → `DesktopBookDetail` | `MobileBookDetail` (layout)

Tablets (iPad, ~820-834px in portrait) use desktop layout. PWA safe-area insets respected in reader pages.

Key mobile adaptations:
- `MobileShell` — bottom tab bar navigation instead of sidebar
- `MobilePageHeader` — compact header with action menu
- `MobileFilterBar` — collapsible filter panel
- `MobileBookCard` — touch-friendly card layout
- `MobileBookDetail` / `MobileBookEditForm` — stacked vertical layout
- `MobileReaderToolbar` — bottom sheet for TOC/settings

### Routes

| Path | Page | Access |
|------|------|--------|
| /login | LoginPage | public |
| / | CatalogPage | reader |
| /book/:id | BookPage | reader |
| /book/:id/edit | BookEditPage | admin |
| /book/:id/read/:format | ReaderPage (dispatches EPUB/FB2/PDF) | reader |
| /book/:id/similar | SimilarBooksPage | reader |
| /authors | AuthorsPage | reader |
| /authors/:id | AuthorPage | reader |
| /series | SeriesListPage | reader |
| /series/:id | SeriesPage | reader |
| /tags | TagsPage | reader |
| /tags/:id | TagPage | reader |
| /shelves/:id | ShelfPage | reader |
| /search | SearchPage | reader |
| /upload | UploadPage | admin |
| /admin | AdminPage | admin |
| /* | NotFoundPage | — |

All routes render in desktop or mobile layout automatically based on screen width (820px breakpoint).

### In-App Reader

Built on a locally-patched foliate-js reader (`src/vendor/foliate-js/`).

- **Flow reader** (EPUB/FB2) — `EbookReader` + `DesktopReaderPage` / `MobileReaderPage`. Paginated columns with font/theme/hyphenation settings, tap zones, TOC highlighting, progress bar.
- **PDF reader** — `PdfReader` + `DesktopPdfReaderPage`. fixed-layout paginator, tap zones (prev/next/zoom_in/zoom_out), zoom steps, TOC cutoff at depth 3, bottom nav bar with draggable slider + editable page number input. Mobile shows "not supported" stub.
- **Position format**: JSON `{kind, value}` — `kind="cfi"` for flow (CFI string), `kind="page"` for PDF (page index).
- **Progress persistence**: debounced save (3s) on relocate, flush on unmount. Per-device settings + per-book progress.
- **Tap zones**: 6-zone desktop grid (corners × top/bottom) + 2 center zones, configurable per-format. PDF gets zoom actions as defaults.
- **Keyboard**: arrows (prev/next), +/- (zoom) work both on host doc and inside reader iframe.

### Key UI Patterns

- **Catalog**: Grid layout, cursor-based infinite scroll, sessionStorage cache, scroll restoration
- **Tag page**: Book grid with filters, sessionStorage cache + scroll restoration
- **Filters**: Multi-select dropdowns for authors, series, tags, language
- **Sort**: Added date, title (A-Z/Z-A), author, rating
- **Breadcrumbs**: Dynamic — reflect source page (tag, author, series, shelf, search). Stored in sessionStorage
- **Book detail**: Metadata, series context, available formats, user rating/read/hidden, shelves, similar books
- **Upload**: Drag-drop, batch processing, duplicate detection, metadata editor, LLM extraction for PDFs with progress spinner
- **Responsive**: Desktop/mobile layout switch at 820px via `useIsMobile()`, separate layout components
- **PWA**: manifest, installable, safe-area respected in reader
- **Styling**: Inline CSS objects, theme.ts color palette, no CSS framework

## Features

### Reader (user)
- Browse catalog with filters and sort
- Search (title, author, series)
- Rate books (1-5★)
- Mark as read/unread
- Hide books from library view
- Create custom shelves
- System shelf "Лучшее" (auto: 4-5★ books)
- Download books (FB2/EPUB/PDF)
- Similar books recommendations
- In-app reading (FB2/EPUB flow + PDF fixed-layout)
- Cross-device progress sync per book
- Per-device reader settings (font, theme, tap zones)
- Explore by author, series, tag

### Admin
- Upload books (FB2/EPUB/PDF/ZIP) with auto metadata extraction (incl. LLM for PDF)
- Edit book metadata, manage formats, change cover
- Search external metadata (Litres, Google Books)
- Delete books
- Merge authors and series
- Tag mapping (rename/merge tags with history)
- User management (create, edit roles, delete)
- App settings (name, SMTP)
- Email test

## Testing

### Backend (pytest)

Test harness: `conftest.py` (temp DB, admin/reader clients), `seed.py` (factory builder), fixture books (FB2, EPUB, PDF).

21 test files covering: auth, upload flow (create/rollback/duplicate), book delete, book update, add format, merge entities (authors/series), admin users, parsers (FB2/EPUB/PDF/PDF-LLM), cover embedder/fetcher/download, PDF render, PDF linearize, catalog filters, tag mapping, reader (settings + progress), similar books, user-book interaction, SPA fallback.

### Frontend (Vitest)

Unit tests for sanitize-html utility.

## Configuration

| Variable | Source | Default |
|----------|--------|---------|
| SECRET_KEY | env or data/.secret_key | auto-generated |
| SECURE_COOKIE | env | false |
| ANTHROPIC_API_KEY | env (backend/.env) | — (required for PDF LLM metadata) |
| ANTHROPIC_MODEL | env | claude-sonnet-4-6 |
| JWT_EXPIRE_HOURS | config.py | 72 |
| MAX_BOOK_SIZE | config.py | 100 MB |
| MAX_COVER_SIZE | config.py | 10 MB |
