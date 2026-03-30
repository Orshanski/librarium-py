# Librarium — Technical Specification

Personal digital library for family use. Self-hosted replacement for Calibre-Web.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3, FastAPI, Uvicorn |
| Database | SQLite 3 (WAL) |
| Auth | JWT (bcrypt + PyJWT), HTTP-only cookies |
| Book parsing | lxml (FB2/EPUB), Pillow (covers) |
| Metadata search | Litres.ru, Google Books API |
| Frontend | React 19, TypeScript, React Router 7 |
| Build | Vite 6 |
| Styling | Inline CSS, no framework |
| Responsive | Desktop/Mobile layout (breakpoint 768px) |
| Tests | pytest (backend), Vitest (frontend) |
| CI/CD | GitHub Actions |

## Architecture

```
Browser → React SPA (:5173 dev / static prod)
           ↓ fetch /api/*
         FastAPI (:8000)
           ├── Routers (14 modules)
           ├── DAL (8 modules)
           ├── Parsers (FB2, EPUB, PDF)
           └── Providers (Litres, Google Books)
           ↓ SQL
         SQLite (WAL)
           ↓ fs
         data/ (library files, thumbs, uploads)
```

### Data Flow

- Frontend — client-only React SPA, fetches all data from `/api/*`
- Backend — FastAPI app, serves API + static frontend build (SPA fallback)
- Auth — JWT in HTTP-only cookie, roles: `admin` (full access), `reader` (view, rate, shelves, download)

### File Storage

```
data/
├── db.sqlite            # Database
├── library/{book_id}/   # Book files + covers
│   ├── cover.jpg
│   ├── book.fb2
│   ├── book.epub
│   └── book.pdf
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

### Search

LIKE-based substring search on title, author name, series name. No FTS5.

### Indexes

On: books(series_id, added_at, sort_title), book_authors(author_id), book_tags(tag_id), book_files(book_id), book_identifiers(book_id, type+value), shelf_books(book_id), user_books(book_id), authors(sort_name), series(sort_name).

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
| GET | /api/books | yes | List with filters (author, series, tag, language), sort, pagination |
| GET | /api/books/{id} | yes | Detail (metadata, files, identifiers) |
| PUT | /api/books/{id} | admin | Update metadata |
| DELETE | /api/books/{id} | admin | Delete book + files |
| POST | /api/books/{id}/files | admin | Upload format |
| DELETE | /api/books/{id}/files?format= | admin | Delete format |

### User–Book Interaction

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/books/{id}/status | yes | Rating, read, hidden |
| PUT | /api/books/{id}/rating | yes | Set 1-5 or null |
| PUT | /api/books/{id}/read | yes | Mark read/unread |
| PUT | /api/books/{id}/hidden | yes | Hide/unhide |

### Covers & Download

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/covers/{id} | — | Thumbnail (300px); ?full=1 for original |
| POST | /api/books/{id}/cover | admin | Upload cover |
| GET | /api/books/{id}/download?format= | yes | Download file |

### Authors / Series / Tags

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/authors | yes | List with book counts, filters |
| GET | /api/authors/{id} | yes | Detail + books |
| GET | /api/series | yes | List with book counts, filters |
| GET | /api/series/{id} | yes | Detail + ordered books |
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
| POST | /api/upload | admin | Upload book file (FB2/EPUB/PDF/ZIP) |
| POST | /api/books/create | admin | Create book from temp upload |
| DELETE | /api/uploads/{id} | admin | Clean temp files |
| GET | /api/metadata/search?q= | yes | Search Litres + Google Books |
| GET | /api/metadata/cover-proxy?url= | yes | Proxy cover image |

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
├── scripts/            # One-time migrations (seed_tag_mappings.py)
└── app/
    ├── main.py         # FastAPI app, SPA fallback, CORS
    ├── config.py       # Paths, JWT, limits
    ├── database.py     # SQLite pool (thread-local)
    ├── auth.py         # JWT create/verify, bcrypt, get_current_user
    ├── routers/        # 14 route modules
    ├── dal/            # 8 data access modules
    ├── parsers/        # FB2, EPUB, PDF → ParsedMetadata
    ├── providers/      # Litres, Google Books → MetadataResult
    └── templates/      # Email templates (SMTP test)
```

### Book Parsing

- **FB2**: XML parsing via lxml — title, authors, series, genres, description, language, cover (base64). Parser returns raw genre codes; mapping to human-readable names happens in upload flow via `tag_mappings` table (~270 codes seeded from FB2 spec)
- **EPUB**: ZIP → META-INF/container.xml → OPF → metadata + cover image
- **PDF**: Basic title/author extraction

### Metadata Providers

- **Litres.ru**: Search by title/author, returns metadata + cover URL
- **Google Books**: Volumes API, international coverage
- **Cover proxy**: Whitelist of allowed domains, fetched via `/api/metadata/cover-proxy`

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
    ├── theme.ts            # Color palette + layout constants
    ├── responsive.ts       # ResponsiveProvider, useIsMobile()
    ├── pages/              # 14 page components
    ├── components/         # 26 shared components (logic + types)
    ├── components/desktop/ # 8 desktop layout components
    └── components/mobile/  # 11 mobile layout components
```

### Responsive Architecture

Desktop/mobile separation via `ResponsiveProvider` (breakpoint 768px). Shared components contain business logic and type definitions (`.types.ts`). Platform-specific layout components in `desktop/` and `mobile/` directories render the UI using shared logic.

Pattern: `BookDetail` (logic) → `useIsMobile()` → `DesktopBookDetail` | `MobileBookDetail` (layout)

Key mobile adaptations:
- `MobileShell` — bottom tab bar navigation instead of sidebar
- `MobilePageHeader` — compact header with action menu
- `MobileFilterBar` — collapsible filter panel
- `MobileBookCard` — touch-friendly card layout
- `MobileBookDetail` / `MobileBookEditForm` — stacked vertical layout

### Routes

| Path | Page | Access |
|------|------|--------|
| /login | LoginPage | public |
| / | CatalogPage | reader |
| /book/:id | BookPage | reader |
| /book/:id/edit | BookEditPage | admin |
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

All routes render in desktop or mobile layout automatically based on screen width (768px breakpoint).

### Key UI Patterns

- **Catalog**: Grid layout, infinite scroll (30 initial + 15 per load), sessionStorage cache, scroll restoration
- **Tag page**: Book grid with filters, sessionStorage cache + scroll restoration
- **Filters**: Multi-select dropdowns for authors, series, tags, language
- **Sort**: Added date, title (A-Z/Z-A), author, rating
- **Breadcrumbs**: Dynamic — reflect source page (tag, author, series, shelf, search). Stored in sessionStorage
- **Book detail**: Metadata, series context, available formats, user rating/read/hidden, shelves
- **Upload**: Drag-drop, batch processing, duplicate detection, metadata editor
- **Responsive**: Desktop/mobile layout switch at 768px via `useIsMobile()`, separate layout components
- **Styling**: Inline CSS objects, theme.ts color palette, no CSS framework

## Features

### Reader
- Browse catalog with filters and sort
- Search (title, author, series)
- Rate books (1-5★)
- Mark as read/unread
- Hide books from library view
- Create custom shelves
- System shelf "Лучшее" (auto: 4-5★ books)
- Download books (FB2/EPUB/PDF)
- Explore by author, series, tag

### Admin
- Upload books (FB2/EPUB/PDF/ZIP) with auto metadata extraction
- Edit book metadata, manage formats, change cover
- Search external metadata (Litres, Google Books)
- Delete books
- User management (create, edit roles, delete)
- App settings (name, SMTP)
- Email test

## Security

- JWT auth with HTTP-only cookies
- CSP, HSTS, TLS 1.2+
- Logging of all auth events and data mutations
- SPA route whitelist — unknown paths return 404

## Testing

### Backend (pytest)

Test harness: `conftest.py` (temp DB, admin/reader clients), `seed.py` (factory builder), fixture books (FB2, EPUB).

Suites: auth (login/logout/roles), upload flow (create/rollback/duplicate), book delete, add format, merge entities (authors/series), admin users, parsers (FB2/EPUB/cover), sanitizer (XSS).

### Frontend (Vitest)

Unit tests for sanitize-html utility.

## Configuration

| Variable | Source | Default |
|----------|--------|---------|
| SECRET_KEY | env | auto-generated |
| SECURE_COOKIE | env | false |
| JWT_EXPIRE_HOURS | config.py | 72 |
| MAX_BOOK_SIZE | config.py | 100 MB |
| MAX_COVER_SIZE | config.py | 10 MB |
