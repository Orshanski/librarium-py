# Librarium — Technical Specification

Personal digital library for family use. Self-hosted replacement for Calibre-Web with in-app reader.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.12, FastAPI, Uvicorn |
| Database | SQLite 3.44+ (WAL); `json_group_array(... ORDER BY ...)` for read-model aggregates |
| Auth | JWT (bcrypt + PyJWT), HTTP-only cookies, rolling refresh |
| Book parsing | lxml (FB2/EPUB), Pillow, PyMuPDF (PDF cover render), pikepdf (PDF linearize) |
| PDF metadata | Anthropic Claude API (`claude-sonnet-4-6`) with web search + PyMuPDF cover render |
| Metadata search | Litres.ru, Google Books API |
| Catalog search | Fuzzy in-process via rapidfuzz, custom `token_min_ratio` scorer (LCS coverage + Levenshtein) |
| Wire DTO | Pydantic v2 with `alias_generator=to_camel`: snake-case Python ↔ camelCase wire |
| SQL access | aiosql (`.sql` files in `dal/queries/`) |
| In-app reader | Local fork of foliate-js (EPUB/FB2 paginator), PDF via PDF.js fixed-layout |
| Frontend | React 19, TypeScript, React Router 7 |
| Build | Vite 6 |
| Styling | Inline CSS, theme in `theme.ts`, no framework |
| Responsive | Desktop/Mobile layout (breakpoint 820px) |
| Offline | Service Worker (precache), IndexedDB (idb), local-first reader |
| Live data | Durable domain publications over SSE + sessionStorage metadata cache |
| Tests | pytest, Vitest, TypeScript |
| Quality gate | SonarCloud (coverage tracked from `coverage.xml` / `lcov.info`; current values live on SonarCloud) |
| CI/CD | GitHub Actions → SSH deploy |

## Architecture

```
Browser → React SPA (:5173 dev / static prod)
           ↓ fetch /api/*  (camelCase wire)
         FastAPI (:8000)
           ├── Routers (API endpoints + SSE event stream)
           ├── Services (business logic)
           ├── DAL (domain modules + _parsers.py + aiosql queries/)
           ├── DTOs (Pydantic v2, alias_generator)
           ├── Parsers (FB2, EPUB)
           ├── Enrichers (PDF, PDF-LLM, PDF-render, cover-fetcher)
           ├── Providers (Litres, Google Books)
           └── Utils (cover-embedder, pdf-linearize, ssrf)
           ↓ SQL
         SQLite (WAL, FK on)
           ↓ fs
         data/ (library files, thumbs, uploads)
```

### Data Flow

- Frontend — client-only React SPA, fetches all data from `/api/*`
- Backend — FastAPI app, serves API + static frontend build (SPA fallback)
- Auth — JWT in HTTP-only cookie `librarium_token`, 168h (7-day) TTL with rolling refresh after 84h
- Roles: `admin` (full access), `reader` (view, rate, shelves, download, in-app reader)
- CSRF — every non-GET/HEAD/OPTIONS request to `/api/*` must carry `X-Requested-With: XMLHttpRequest` (middleware in `main.py`)
- Live data — authenticated clients open `/api/events/stream` with EventSource. Backend publishes typed domain events after DB commit, persists each SSE publication in `sse_publications`, and streams durable catch-up events after the client cursor. Frontend validates envelopes, applies events through the local domain event bus, and advances the cursor only after successful application.

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

### Junction Tables

**book_authors** — book_id, author_id

**book_tags** — book_id, tag_id

**book_files** — id, book_id, format (FB2/EPUB/PDF), file_path, file_size, file_hash

**book_identifiers** — id, book_id, type (ISBN, LITRES_ID, ...), value

**shelf_books** — shelf_id, book_id, added_at

**user_books** — user_id, book_id, is_read, is_hidden, rating (1-5)

### Reader Tables

**reader_settings** — user_id, device_type, settings (JSON) — PK (user_id, device_type). Despite the historical column name `device_type`, the value stored is a per-browser-instance UUID issued via the `device_id` cookie (see `get_or_create_device_id` in `reader_service.py`), not a device class. Settings JSON: font, theme, tap zones, hyphenation, justify, PDF tap zones.

**reading_progress** — user_id, book_id, position (JSON: `{kind: "cfi"|"page", value: ...}`), last_device, last_format, fraction (0..1), last_read_at, version (CAS counter for conflict resolution) — PK (user_id, book_id). Indexed on book_id. `PUT /api/books/{id}/read` with `isRead=true` deletes this row, so marking a book read resets the reading position.

### Event Tables

**sse_publications** — durable SSE publication log. `event_id` is the monotonic stream cursor; `scope_kind` is `library` or `user`; `user_id` is set only for user-scoped publications; `event_type` and `payload_json` mirror the domain event for diagnostics; `envelope_json` stores the exact wire envelope sent to clients; `published_at` is the publication timestamp. This is a publication stream for SSE replay, not event sourcing or a domain outbox.

### Search

UI catalog search is **fuzzy**, not LIKE — see «Catalog search» under Backend Structure for the scorer and parameters. SQL side just SELECTs all rows (`search_books_books.sql` / `_authors.sql` / `_series.sql`) and ranking happens in Python via rapidfuzz. There is no FTS5 (dropped in `migrations/002_drop_fts5.sql`).

Two narrow callsites still use LIKE — they are intentionally separate from the UI search and not fuzzy:
- `find_duplicates_by_title` — upload-time duplicate detection.
- Litres / Google Books provider matching — when reconciling external metadata to existing books.

### Indexes

On: books(series_id, added_at DESC, sort_title), book_authors(author_id), book_tags(tag_id), tag_mappings(tag_id), book_files(book_id), book_identifiers(book_id, type+value), shelf_books(book_id), user_books(book_id), reading_progress(book_id), sse_publications(scope_kind, user_id, event_id), authors(sort_name), series(sort_name), shelves(user_id, system_code) — UNIQUE partial index where system_code IS NOT NULL (single-system-shelf-per-user invariant).

### Read-model JSON shape

Read-side SQL returns nested objects directly — `authors`/`tags` as JSON arrays of `{id, name}` via `json_group_array(json_object('id', id, 'name', name) ORDER BY name)`, `series` as `json_object` or NULL via `CASE WHEN s.id IS NULL THEN NULL ELSE json_object(...) END`. `ORDER BY` inside the aggregate is the formal SQLite 3.44+ guarantee. The `_parsers.py` module wraps Pydantic `TypeAdapter` to deserialize these into typed `AuthorRef`/`TagRef`/`SeriesRef` objects.

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
| GET | /api/books | reader | List — query: `sort`, `cursor`, `pageSize`, `authorIds`, `tagIds`, `seriesIds`, `language` (camelCase aliases via `Query(alias=...)`) |
| GET | /api/books/{id} | reader | Detail (metadata, files, identifiers) |
| PUT | /api/books/{id} | admin | Update metadata + manage formats (`addFormats`/`deleteFormats`/`commitCover` in body) |
| DELETE | /api/books/{id} | admin | Delete book + files |
| GET | /api/books/{id}/similar | reader | Litres-backed similar books |
| GET | /api/books/{id}/download | reader | Download file (`format` query) |

There are two entry points for adding a format, by flow:
- **Edit form (existing book)** — `PUT /api/books/{id}` with `addFormats` / `deleteFormats` / `commitCover` in body. Unified body covers metadata edit + format edit + cover commit (see `book-format-staging-design` epic).
- **Upload duplicate-action** — `POST /api/books/{id}/add-format` from the upload flow when the user picks "Add format" on a duplicate-detected upload (no metadata changes, only attaches new file from temp storage).

Cover replace goes through `POST /api/books/{id}/cover` (temp upload) + `PUT /api/books/{id}` with `commitCover: true`. There are no `/files` endpoints.

### Covers

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/covers/{id} | reader | Thumbnail (300px); `?full=1` original; `?t=` cache bust |
| POST | /api/books/{id}/cover | admin | Upload **temp** cover (commit via `PUT /api/books/{id}` with `commitCover: true`) |
| DELETE | /api/books/{id}/cover | admin | Discard pending temp cover |
| GET | /api/uploads/cover/{temp_id} | reader | Serve temp cover preview during edit |

### User–Book Interaction

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| PUT | /api/books/{id}/rating | yes | Set 1-5 or null |
| PUT | /api/books/{id}/read | yes | Mark read/unread. Marking read also clears server reading progress for that user/book. |
| PUT | /api/books/{id}/hidden | yes | Hide/unhide |

### Reader

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/reader/settings | reader | Get reader settings (font, theme, tap zones) per device. Issues `device_id` cookie if absent. |
| PUT | /api/reader/settings | reader | Save reader settings |
| GET | /api/reader/progress/{book_id} | reader | Get reading position — `{position, lastDevice, lastFormat, fraction, lastReadAt, version}` (no-row branch returns zeroed row with `version=0`) |
| PUT | /api/reader/progress/{book_id} | reader | Save position with CAS — body `{position, lastDevice="" , lastFormat="" , fraction=0 (0..1), expectedVersion=0}` (only `position` truly required; rest have safe defaults). Always HTTP 200, signal in body: **accepted** `{accepted: true, version, rebased}`; **conflict-rewind reject** `{accepted: false, current: <up-to-date row>, retryExhausted: false}` for client-side merge; **retry-exhausted** `{accepted: false, current: null, retryExhausted: true}` after 3 in-DAL race retries fail |

### Authors / Series / Tags

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/authors | yes | List with book counts, filters; includes authors without books (`bookCount=0`, `tags=[]`) |
| GET | /api/authors/{id} | yes | Detail + books |
| PUT | /api/authors/{id} | admin | Update author name/sort_name |
| POST | /api/authors/{id}/merge | admin | Merge author into another |
| DELETE | /api/authors/{id} | admin | Delete author (if no books) |
| GET | /api/series | yes | List with book counts, filters; includes series without books (`bookCount=0`, `authors=[]`) |
| GET | /api/series/{id} | yes | Detail + ordered books |
| PUT | /api/series/{id} | admin | Update series name/sort_name |
| POST | /api/series/{id}/merge | admin | Merge series into another |
| DELETE | /api/series/{id} | admin | Delete series (if no books) |
| GET | /api/tags/cloud | yes | Tag cloud with book counts; includes tags without books (`bookCount=0`) |
| GET | /api/tags/{id} | yes | Detail + books with filters |
| PUT | /api/tags/{id} | admin | Rename tag |
| POST | /api/tags/{id}/merge | admin | Merge tag into another; updates `tag_mappings` for future imports |
| DELETE | /api/tags/{id} | admin | Delete tag (if no books) |

Authors, series, and tags are library-scoped metadata directories, not only projections of currently attached books. Manually-created empty entities remain visible in the top-level directory views and tag cloud with `bookCount=0`. Book-backed filters still narrow through `books b`; empty entities only survive the user hidden-book scope via the explicit `b.id IS NULL OR ...` guard in `build_book_where`.

### Shelves

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/shelves | yes | User shelves + two system shelves: «Лучшее» (`system_code=best`, 4-5★) and «Читаю сейчас» (`system_code=reading_now`, books with progress; sort overridden to `lastReadDesc`) |
| POST | /api/shelves | yes | Create shelf |
| GET | /api/shelves/{id} | yes | Shelf + books |
| PUT | /api/shelves/{id} | yes | Rename |
| DELETE | /api/shelves/{id} | yes | Delete (not system) |
| POST | /api/shelves/{id}/books | yes | Add book |
| DELETE | /api/shelves/{id}/books/{bid} | yes | Remove book |

### Search, Upload, Metadata

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/search?q= | yes | Fuzzy search (rapidfuzz, see «Catalog search» under Backend Structure). Returns `{books, authors, series}`; `limit` (1-100, default 50) caps books, authors/series capped at 10 hardcoded. Empty/whitespace `q` → empty result |
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

### Filter options

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/filter-options/authors | reader | Author options scoped by `tagIds`, `seriesIds`, `language` |
| GET | /api/filter-options/tags | reader | Tag options scoped by `authorIds`, `seriesIds`, `language` |
| GET | /api/filter-options/series | reader | Series options scoped by `authorIds`, `tagIds`, `language` |
| GET | /api/filter-options/languages | reader | Language options scoped by `authorIds`, `tagIds`, `seriesIds` |

Each endpoint excludes its own dimension from the WHERE clause (so the multi-select dropdown shows the *full* set of values for that dim, narrowed by the *other* dimensions). `user_id` is threaded as a separate scope parameter (not a filter dimension) — see [bv0e](#wire-format--dto-conventions).

### Other

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/events/stream?since={eventId} | yes | Server-Sent Events stream. Reads durable `sse_publications` rows visible to the authenticated user after the application-success cursor, emits `event: domain` envelopes `{eventId, scope, event, publishedAt}`, then keeps tailing the same log with `:ping` keepalives every 15s. Missing or invalid `since` starts at the current tail. If the requested cursor is older than retained history, emits `event: reset` with `publication_cursor_expired`. |
| GET | /api/publishers | reader | Distinct publisher list (for Edit form autocomplete) |
| GET | /api/health | — | Health check `{"ok": true}` |

## Backend Structure

```
backend/
├── run.py              # Uvicorn entry (--dev for reload)
├── requirements.txt    # FastAPI, Uvicorn, lxml, Pillow, pymupdf, pikepdf, anthropic, rapidfuzz, aiosql, ...
├── schema.sql
├── scripts/            # One-off scripts (run manually)
│   ├── create_admin.py             # Initial admin bootstrap
│   ├── seed_tag_mappings.py        # FB2 genre codes → tags
│   ├── normalize_tag_names.py      # Capitalization sweep
│   └── linearize_existing_pdfs.py  # Backfill linearized PDFs
├── migrations/         # Manual schema migrations applied on top of schema.sql
│   ├── 001_user_cascade.sql        # ON DELETE CASCADE for shelves.user_id / user_books.user_id
│   └── 002_drop_fts5.sql           # Drop FTS5 tables (search now in-process via rapidfuzz)
└── app/
    ├── main.py         # FastAPI app, SPA fallback, CSRF middleware (X-Requested-With)
    ├── config/         # Paths, JWT (168h TTL, 84h refresh), limits, env (.env via python-dotenv)
    │   ├── __init__.py
    │   ├── sort.py     # Sort config + JSON manifest
    │   └── sort.json
    ├── database.py     # SQLite pool (thread-local), WAL, FK on
    ├── auth.py         # JWT create/verify, bcrypt, get_current_user, require_admin, CurrentUser
    ├── error_handlers.py / exceptions.py / fs_utils.py / logging_utils.py / ssrf.py
    ├── search.py       # Fuzzy search toolkit — see «Catalog search» below
    ├── cover_embedder.py        # Embed cover into FB2/EPUB on export
    ├── pdf_linearize.py         # pikepdf linearize in place (Fast Web View)
    ├── routers/        # Route modules + `_entity_crud.py` + `_validators.py`; includes `/api/events/stream`
    ├── services/       # Business logic between routers and DAL
    ├── dal/            # Domain modules + `_parsers.py` (TypeAdapter for JSON aggregates, pbz2) + queries/ via aiosql
    ├── dtos/           # Domain DTO modules + helpers (`_aliases.py`, `_refs.py`, `_types.py`, `__init__.py`); Pydantic v2, alias_generator (see Wire format below)
    ├── parsers/        # Book format parsers (FB2, EPUB)
    ├── enrichers/      # PDF enrichment pipeline
    │   ├── pdf.py             # Main PDF orchestrator (filename → LLM → cover fetch → fallback render)
    │   ├── pdf_llm.py         # Claude API metadata extraction
    │   ├── pdf_render.py      # PyMuPDF first-page → cover JPEG (color-checked)
    │   └── cover_fetcher.py   # External cover URL → bytes (10MB cap, SSRF-safe)
    ├── providers/      # Litres, Google Books → MetadataResult
    └── templates/      # Email templates (SMTP test)
```

Root-level `scripts/migrations/` contains one-off SQL migrations for existing SQLite databases that are not tied to backend package imports, including `2026-05-27-sse-publications.sql` for the durable SSE publication log. Fresh and test databases still use `backend/schema.sql`.

### Book Parsing

- **FB2**: XML parsing via lxml — title, authors, series, genres, description, language, cover (base64). Parser returns raw genre codes; mapping to human-readable names happens in upload flow via `tag_mappings` table (~270 codes seeded from FB2 spec)
- **EPUB**: ZIP → META-INF/container.xml → OPF → metadata + cover image
- **PDF (in `enrichers/`, not `parsers/`)**: Metadata via Anthropic Claude API (`claude-sonnet-4-6`) with web search grounding, using filename as primary hint + first pages as context. Cover preferred from publisher CDN (whitelisted domains, SSRF-validated, 10MB cap, max 5 redirects); fallback — PyMuPDF first-page render with color-content check (skips blank/single-color pages, tries up to 3 pages). File is linearized (pikepdf qpdf backend) on upload for Fast Web View streaming.

### Wire format / DTO conventions

After `pbz2` epic the read/write contract is unified through Pydantic v2 alias_generator:

- **`BODY_CONFIG`** (in `dtos/_aliases.py`): `populate_by_name=False, alias_generator=to_camel, extra="forbid"`. Used on input body models — Python fields snake_case, wire camelCase, unknown fields → 422.
- **`RESPONSE_CONFIG`**: `populate_by_name=True, alias_generator=to_camel`. Used on response models — Python snake, wire camel, accepts snake on construction (for service-layer dict passing from DAL TypedDicts).
- **`AuthorRef` / `TagRef` / `SeriesRef`** in `dtos/_refs.py` — `{id, name}` BaseModel; nested in every read shape replacing CSV strings.
- **DAL JSON aggregates** parsed via `dal/_parsers.py` (`TypeAdapter[list[AuthorRef]]` etc.) — typed structures available immediately after `cur.fetchall()`.

A handful of DTO modules (`auth.py`, parts of `admin.py`, `user_books.py`, `covers.py`) keep camelCase Python field names directly (no alias_generator) — those are pre-pbz2 holdouts; behavior identical, follow-up cleanup tracked separately. `publishers.py` also has no `model_config`, but its only field is single-word (`publishers: list[str]`) and there is nothing to alias. `catalog.py` is TypedDict-only (DAL contract, not Pydantic), so alias_generator does not apply there.

### Internal architectural invariants

- **`user_id` scope vs. dimension filters** (bv0e): `CatalogFilters` TypedDict carries only dimension filters (`authorIds`, `tagIds`, `seriesIds`, `language`). User identity is threaded as an explicit `user_id` parameter through `build_book_where`, `dal.get_books`, and all `list_*_options` functions — never embedded in the filter dict.
- **Aggregate ordering** (6cww): `json_group_array(... ORDER BY name)` is used inside the aggregate (formal SQLite 3.44+ guarantee) rather than relying on subquery ORDER BY propagation. `DISTINCT` deduplication still happens in a derived table where needed (json_group_array doesn't support DISTINCT).
- **CSRF**: middleware in `main.py` requires `X-Requested-With: XMLHttpRequest` on all non-GET/HEAD/OPTIONS `/api/*` requests; fetch wrapper sends it automatically.

### Catalog search

UI search at `GET /api/search?q=` is fuzzy and runs entirely in Python — no FTS5, no DB-side ranking. SQL just SELECTs all rows for each entity (`search_books_books.sql` / `_authors.sql` / `_series.sql`) and the scoring happens in-process via [rapidfuzz](https://github.com/maxbachmann/RapidFuzz). At the current scale (a few thousand books) full-table-per-query is fine; performance follow-up (pre-tokenise, early-exit) is tracked as a separate bead.

**Toolkit lives in `app/search.py`:**

- **`search_preprocess(s)`** — applied to both query and haystack values before scoring:
  - lowercase + non-alphanumeric → space (rapidfuzz `default_process`)
  - `ё → е`, `Ё → Е` (rapidfuzz doesn't cover this)
  - whitespace collapse
- **`_token_match_score(q_token, c_token)`** — score one query token against one choice token, on a 0-100 scale. Takes the **min** of two metrics:
  - **LCS coverage from query side** — how much of `q_token` appears in-order inside `c_token`. Catches prefixes / typos: «достоевск» → «Достоевский» = 100, «короли» → «Кори» = 67.
  - **Symmetric Levenshtein ratio** — overall edit-distance similarity. Forces overall closeness so LCS doesn't get too permissive. «короли» vs «космобиолухи» has LCS 83 but ratio 55, so the min (55) correctly rejects.
- **`token_min_ratio(query, choice)`** — for each token in `query`, find its best `_token_match_score` across choice tokens; return the **min across query tokens**. Every word in the query must find an in-order supersequence in some word of the choice; the weakest match drags the score down. Replaces an earlier `fuzz.WRatio` approach that was too loose on short queries against long concatenated haystacks.

**Parameters:**

- **`SEARCH_SCORE_CUTOFF = 75.0`** — empirical threshold sitting in the gap between noise (~66 and below) and real matches (80-100 for single-word, 85-90 for prefixes). Tune via manual tests on live data.
- **`AUTHORS_SERIES_LIMIT = 10`** — hardcoded cap for authors/series in search response (wire-compat with SearchPage). Books `limit` is the router parameter (1-100, default 50).

**Per-entity ranking targets** (in `dal.books.search_books`):

- **Books**: scored against concatenated `title + authors + series.name`.
- **Authors**: scored against `name` only.
- **Series**: scored against concatenated `name + authors`.

Each entity is scored independently against its own field-set — no cross-entity score dilution from long concatenated haystacks.

**Known limitation** — short prefix against a much longer word fails the ratio floor: «толк» (4 chars) vs «толкиен» (7 chars) has LCS-coverage 100 but ratio ~73, so the min is below the 75 cutoff and the match is dropped. Users need ≥5 chars of a prefix for it to survive against 7+ char words. Cutoff intentionally not lowered to 70 — that would let noise back through (e.g. «мария» → «Марк»).

**Out of scope** — fuzzy is **only** for UI catalog search. Two narrow callsites still use simple LIKE: `find_duplicates_by_title` (upload duplicate detection) and Litres / Google Books provider matching. Migration of those is tracked separately.

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
    ├── main.tsx            # React root, BrowserRouter, AuthProvider, SW registration
    ├── App.tsx             # Routes (all behind ProtectedRoute), offline shell routing
    ├── auth.tsx            # AuthContext, useAuth(), ProtectedRoute, offline auth cache
    ├── api/                # API client package (see "API client layer" below)
    ├── cache/              # SessionStorage metadata cache (namespaces, persistence, invalidation)
    │   └── projection/     # Local patch helpers for book/detail/list/entity read models
    ├── config/             # Client-side manifests, currently sort config
    ├── constants/          # Reader defaults and theme constants
    ├── domain/             # Typed domain events and read-model classifiers
    ├── offline/            # Offline bootstrap and book-deletion cache cleanup
    ├── sse/                # EventSource bridge: `/api/events/stream` → domain event bus
    ├── scroll/             # List scroll validity and non-bumping navigation support
    ├── types/              # Reader-specific TypeScript contracts
    ├── types.ts            # Shared API/domain interfaces
    ├── theme.ts            # Color palette + layout constants (mobileBreakpoint 820)
    ├── responsive.ts       # ResponsiveProvider, useIsMobile()
    ├── vendor/foliate-js/  # Forked copy of foliate-js — owned code, not upstream vendor
    ├── hooks/              # Reader/book/offline/PWA/cache-aware hooks
    ├── utils/              # Offline storage, reader sync/input/footnotes, book download, sanitize-html …
    ├── pages/              # Route-level pages + desktop/mobile reader page split
    ├── components/         # Shared components (logic + types, incl. OfflineShell, CloudBadge, EbookReader, PdfReader, MetadataSearch, …)
    ├── components/desktop/ # Desktop layout components
    ├── components/mobile/  # Mobile layout components
    └── test/               # Vitest/MSW setup and shared test references
```

Public `frontend/public/pdfjs/` — PDF.js distribution (cmaps, fonts, worker). Loaded via `<script type=module>` tag to bypass Vite dev server's .mjs transform that breaks PDF.js workers.

### API client layer

`frontend/src/api/` is a typed package, not a single fetch wrapper:

- `client.ts` — fetch wrapper (credentials, JSON, error normalization)
- `credentials.ts` — auto-attaches `X-Requested-With: XMLHttpRequest` (CSRF) and cookie credentials
- `errors.ts` — error class hierarchy + parsing
- `filter-params.ts` — `URLSearchParams` builder for catalog filters (camelCase aliases)
- `non-bumping-paths.ts` — endpoint patterns that should NOT bump the scroll counter (k96o block B)
- `types.ts` — shared types
- `index.ts` — barrel re-exports
- `endpoints/` — 14 typed endpoint modules: `admin`, `auth`, `authors`, `books`, `covers`, `filters`, `metadata`, `reader`, `search`, `series`, `shelves`, `similar`, `tags`, `upload`

### Metadata Cache and Live Invalidation

Metadata/read-model screens use `frontend/src/cache/`, not TanStack Query. The cache is deliberately small and explicit:

- `MetadataCacheStore` stores entries by namespace/key and persists namespaces to `sessionStorage` under `librarium_metadata_cache_*`.
- `useCachedResource()` returns cached data synchronously, fetches only on miss, aborts stale fetches, and ignores fetch results that started before a namespace invalidation.
- Book-list entries carry `BookListContext`; domain classifiers decide whether an event can patch rows in place or must invalidate the whole list.
- The cache is namespaced: `books`, `book/{id}`, `authors`, `author/{id}`, `series`, `series/{id}`, `tags`, `tag/{id}`, `shelves`, `shelf/{id}`, `book-shelves/{id}`, `publishers`, `filter-options/*`, etc.

Patch model:

- Library metadata events patch shared read models in place where the payload is sufficient: book title/sort fields, author/series/tag names, nested refs, and affected directory rows.
- User overlay events (`rating`, `isRead`, `isHidden`, shelf membership) remain user-scoped. They patch cached rows for the current user only and never fan out full per-user book objects over SSE.
- When a user-scoped mutation needs data not present in the event payload, the frontend refetches only the narrow user-scoped resource it needs and applies a local patch; shared book/entity objects are not reloaded just to update overlay state.
- Directory/list sort invalidation is explicit: local patches preserve scroll when the active sort key is unaffected, and invalidate/refetch when a changed field can reorder the visible list.

Invalidation sources:

- Local mutations publish typed domain events immediately after successful API calls.
- Backend mutations publish the same event types after DB commit via `/api/events/stream` (`EventSource`, `event: domain`). The publication point first persists the exact wire envelope in `sse_publications`, then wakes active stream readers; no live-only message is delivered without a durable row.
- On SSE reconnect after an error, offline gap, or closed-PWA gap, the frontend reconnects with its stored `since` cursor and the server replays all visible durable publications after that cursor in `event_id` order. Library publications are visible to every authenticated user; user-scoped publications replay only for the matching user. Existing reopen/resync handling still clears metadata cache/list-scroll validity around stream recovery as a conservative guard; durable replay is the correctness path for event-driven side effects such as offline read cleanup.
- Frontend cursor persistence is application-success-based: the cursor advances only after cursor-critical handlers and normal domain event application finish. This avoids skipping a publication when cleanup or cache handling fails.
- If the retained log no longer contains the requested cursor range, the server sends a reset event. The frontend clears metadata cache/list-scroll validity, refreshes offline snapshots so read books can be cleaned up best-effort, and then moves to the current tail.
- `readingProgressChanged` invalidates shelf namespaces; `bookReadChanged` patches cached book read state and invalidates `shelf/reading-now`; marking read also clears the persisted reading position server-side.

Important invariant: list scroll restoration is not owned by metadata cache. Scroll validity uses the separate scroll module/counter so cache invalidation cannot accidentally bump or preserve scroll positions beyond the explicit scroll policy.

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
- **Opening block** (EPUB/FB2) — cover and frontmatter are normal navigable opening sections before the main text, not an overlay. They are marked `counted=false`; cover also has `isCover=true`, and frontmatter/opening positions carry `isOpening=true`.
- **Opening progress semantics** — cover/frontmatter do not count toward virtual page totals, `fraction`, book size, or saved reading progress. Footer shows `Обложка` on cover, an opening label on non-cover frontmatter, and the first counted text page as `1 / N`. In paginated flow the cover is prepared to appear on the right-hand page, matching a physical book opening.
- **Position format**: JSON `{kind, value}` — `kind="cfi"` for flow (CFI string), `kind="page"` for PDF (page index).
- **Progress persistence**: local-first via IndexedDB, debounced save (3s) on relocate, flush on unmount + beforeunload. Background sync with server when online. Cover/opening locations are intentionally not persisted. Per-device settings + per-book progress.
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
- **PWA**: manifest, installable, safe-area respected in reader, offline reading via Service Worker + IndexedDB
- **Styling**: Inline CSS objects, theme.ts color palette, no CSS framework

## Features

### Reader (user)
- Browse catalog with filters and sort
- Search (title, author, series)
- Rate books (1-5★)
- Mark as read/unread; marking read resets persisted reading position
- Hide books from library view
- Create custom shelves
- System shelves «Лучшее» (auto: 4-5★ books) and «Читаю сейчас» (books with reading progress)
- Download books (FB2/EPUB/PDF)
- Similar books recommendations
- In-app reading (FB2/EPUB flow with cover/frontmatter opening block + PDF fixed-layout)
- Cross-device progress sync per book with CAS conflict handling
- Per-device reader settings (font, theme, tap zones)
- Offline reading (PWA): auto-cache on read, manual cache toggle, offline shell
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

The backend suite covers auth + JWT refresh + CSRF middleware, upload flow (create/rollback/duplicate, format add via PUT and via POST `/add-format`), book detail/list/update/delete, merge entities (authors/series), tag mapping, admin users + settings, parsers (FB2/EPUB), enrichers (PDF-LLM, PDF render, cover-fetcher, PDF linearize), cover embedder + cover proxy + cover commit/discard, catalog filters + filter-options scoping (bv0e), reader settings + progress CAS (accept/conflict/retry-exhausted), clearing progress when marking a book read, similar books, user-book interaction (rating/read/hidden), publishers, SSE event publication, SPA fallback, DTO alias roundtrips. Coverage exported via `coverage.xml` for SonarCloud.

### Frontend (Vitest)

The frontend suite covers smart-filter-bar query construction, book-detail/edit-form, metadata search, mobile filter bar, reader (settings, lifecycle, position, footer, cover/opening persistence, session flag, footnote handler, footnotes, input parsing), PWA detection, online status, update banner, sidebar, ErrorBoundary, FootnotePopup, entity/tag admin panels, sanitize-html, offline-storage IndexedDB (cache, progress, settings, eviction), metadata cache and SSE event validation, book-download, device-info, scroll-counter + non-bumping paths, useScrollRestore. Coverage exported via `lcov.info` for SonarCloud.

## Offline PWA

Available only in installed PWA mode (`display-mode: standalone`). In regular browser — no offline features.

### Architecture

- **Service Worker** (`public/sw.js`) — precaches all build assets at install. Network-first for navigation, cache-first for static assets. Cache name includes content hash for automatic invalidation on deploy. Post-build script (`scripts/inject-sw-precache.js`) injects asset list into SW.
- **IndexedDB** (`idb` library, database `librarium-offline`) — stores cached books (all formats + cover), reading progress, reader settings. Three object stores: `offline_books`, `reading_progress`, `reader_settings`. (Legacy `cached_books` store renamed to `offline_books` in v3→v4 native rename migration.)
- **Local-first reader** — progress is owned by `useReaderPosition` (debounced 3s save to IDB + flush on unmount/beforeunload, server sync on `online`); settings by `useReaderSettings`; lifecycle (load/init/cleanup) by `useReaderLifecycle`. Book blob loaded from IndexedDB cache if available, otherwise from network. CAS conflict resolution with `version` counter (see `PUT /api/reader/progress/{book_id}`).

### Book Caching

- **Auto-cache**: opening a book in the reader caches all its formats + cover in IndexedDB
- **Manual cache**: cloud badge toggle on book detail page (next to "Не прочитано")
- **Cloud badge in catalog**: yellow cloud icon on cached book covers (only in PWA mode)
- **TTL**: 14 days from last access. Expired books evicted on app startup and on offline transition
- **LRU eviction**: when storage is full (QuotaExceededError), least-recently-accessed non-manual books are evicted
- **Mark as read → evict + reset progress**: marking a book as "Прочитано" removes its offline copy and local `reading_progress`; the backend clears the server `reading_progress` row in the same read-state mutation. If another device marks the book read while this PWA is offline or closed, durable SSE replay delivers the missed `bookReadChanged(true)` after reconnect and runs the same local cleanup. A device that remains fully offline can still show stale local data until it reconnects.

### Offline Shell

When PWA is offline (except during active reading), `OfflineShell` replaces the entire app: logo + "Оффлайн" badge, grid of cached books with progress bars. Tap → reader opens from IndexedDB cache.

### Auth in Offline

User object cached in localStorage on successful login. When offline, `AuthProvider` uses cached user instead of failing on `/api/auth/me`. JWT expiry (168h) checked on reconnect.

### Sync on Reconnect

`online` and `visibilitychange` trigger sync of all unsynced progress and settings to server when the reader is not active. Progress sync uses `pushProgressToServerCAS`: accepted/rebased writes update local `serverVersion`; conflict rewinds adopt the server row; failed requests leave local entries unsynced so they retry later. Settings sync is simpler: save to server, then mark the local settings row synced only after success.

### Update Banner

When a new SW activates (deploy), a banner "Доступно обновление" appears in the shell header with an "Обновить" button → page reload.

## Configuration

| Variable | Source | Default |
|----------|--------|---------|
| SECRET_KEY | env or data/.secret_key | auto-generated (32 bytes hex) |
| SECURE_COOKIE | env | false (set true behind HTTPS) |
| ANTHROPIC_API_KEY | env (backend/.env) | — (required for PDF LLM metadata) |
| ANTHROPIC_MODEL | env | claude-sonnet-4-6 |
| ANTHROPIC_TIMEOUT_SEC | env | 60 |
| JWT_EXPIRE_HOURS | config/__init__.py | 168 (7 days) |
| JWT_REFRESH_AFTER_HOURS | config/__init__.py | 84 (rolling refresh after half-TTL) |
| MAX_BOOK_SIZE | config/__init__.py | 100 MB |
| MAX_COVER_SIZE | config/__init__.py | 10 MB |
| Sort manifest | config/sort.json | catalog sort options + order |
| DB_PATH_PREFIX | config/__init__.py | `data/library` (relative path stored in DB) |
