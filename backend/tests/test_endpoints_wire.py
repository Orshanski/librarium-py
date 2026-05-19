"""Integration tests for the post-pbz2 wire format on the listed endpoints.

Coverage: /api/books (list/detail/PUT), /api/authors (list/detail),
/api/series (list/detail), /api/tags/{id}, /api/shelves/{id},
/api/upload duplicate hit, /api/search.

Each endpoint above is asserted to emit camelCase keys and structured
author/tag/series objects (not CSV strings, not legacy snake fields).
/api/search emits camelCase keys (coverPath, bookCount) via RESPONSE_CONFIG.

Baseline seed (conftest + seed.py):
  - Authors: 1 "Test Author", 2 "Cover Writer", 3 "Test Autor"
  - Series: 1 "Test Series", 2 "Tset Series"
  - Tags: 1 "Фэнтези", 2 "Классический детектив"
  - Book 1: author=1, tag=1, series=1, has file
  - Book 2: author=2, tag=2, has cover.jpg, has file
  - Book 3: author=1, tag=1, series=1
  - Book 4: author=3, tag=2, series=2
  - Book 5: author=2, tags=1+2
"""


def assert_no_legacy_csv_fields(book: dict) -> None:
    """Assert that a book payload does not carry any pre-pbz2 CSV/flat keys."""
    for key in ("author_ids", "tag_ids", "series_id", "series_name"):
        assert key not in book, f"Legacy field '{key}' present in {book!r}"


# ---------------------------------------------------------------------------
# GET /api/books?tagIds=1
# ---------------------------------------------------------------------------


def test_list_books_wire_format(admin_client):
    resp = admin_client.get("/api/books", params={"tagIds": "1"})
    assert resp.status_code == 200
    payload = resp.json()
    assert "books" in payload
    assert len(payload["books"]) > 0
    book = payload["books"][0]
    # camelCase keys present (card shape — BookCardItem)
    assert "coverPath" in book
    assert "isRead" in book
    assert "seriesNumber" in book
    # snake_case keys absent
    assert "cover_path" not in book
    assert "is_read" not in book
    assert "series_number" not in book
    # authors as structured objects
    assert isinstance(book["authors"], list)
    assert len(book["authors"]) > 0
    assert all("id" in a and "name" in a for a in book["authors"])
    # no legacy CSV/ID fields
    assert "authorIds" not in book
    assert "author_ids" not in book
    assert "tagIds" not in book
    assert "tag_ids" not in book


def test_list_books_no_snake_keys_on_all_books(admin_client):
    resp = admin_client.get("/api/books")
    assert resp.status_code == 200
    books = resp.json()["books"]
    assert len(books) > 0
    for book in books:
        assert "coverPath" in book
        assert "cover_path" not in book


# ---------------------------------------------------------------------------
# GET /api/books/{id}
# ---------------------------------------------------------------------------


def test_get_book_wire_format(admin_client):
    resp = admin_client.get("/api/books/1")
    assert resp.status_code == 200
    payload = resp.json()
    assert "book" in payload
    assert "files" in payload
    book = payload["book"]
    assert "coverPath" in book
    assert "cover_path" not in book
    assert "addedAt" in book
    assert "updatedAt" in book
    assert isinstance(book["authors"], list)
    assert len(book["authors"]) > 0
    assert all("id" in a and "name" in a for a in book["authors"])
    # files[0] has fileSize camelCase
    files = payload["files"]
    assert len(files) > 0
    assert "fileSize" in files[0]
    assert "file_size" not in files[0]


def test_get_book_with_cover_wire(admin_client):
    resp = admin_client.get("/api/books/2")
    assert resp.status_code == 200
    book = resp.json()["book"]
    assert book["coverPath"] is not None
    assert "cover_path" not in book


def test_book_detail_includes_card_fields_plus_details(reader_client):
    """GET /api/books/{id}.book has BookCardItem fields PLUS detail fields."""
    response = reader_client.get("/api/books/1")
    assert response.status_code == 200
    book = response.json()["book"]
    # Card fields
    card_expected = {"id", "title", "authors", "series", "seriesNumber", "coverPath", "rating", "isRead"}
    assert card_expected.issubset(book.keys()), f"missing card keys: {card_expected - book.keys()}"
    # Detail fields
    detail_expected = {"description", "publisher", "language", "pubDate", "tags", "sortTitle", "addedAt", "updatedAt"}
    assert detail_expected.issubset(book.keys()), f"missing detail keys: {detail_expected - book.keys()}"


# ---------------------------------------------------------------------------
# PUT /api/books/{id} — camel body accepted, snake body rejected
# ---------------------------------------------------------------------------


def test_put_book_accepts_camel_body(admin_client):
    resp = admin_client.put("/api/books/1", json={"title": "Wire Test", "pubDate": "2020-01-01"})
    assert resp.status_code == 200


def test_put_book_rejects_snake_body(admin_client):
    resp = admin_client.put("/api/books/1", json={"title": "Wire Test", "pub_date": "2020-01-01"})
    assert resp.status_code == 422


def test_put_book_rejects_snake_series_id(admin_client):
    resp = admin_client.put("/api/books/1", json={"series_id": 1})
    assert resp.status_code == 422


def test_put_book_accepts_camel_series_id(admin_client):
    resp = admin_client.put("/api/books/1", json={"seriesId": 1})
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# GET /api/authors
# ---------------------------------------------------------------------------


def test_get_authors_wire(admin_client):
    resp = admin_client.get("/api/authors")
    assert resp.status_code == 200
    payload = resp.json()
    assert "authors" in payload
    assert len(payload["authors"]) > 0
    author = payload["authors"][0]
    assert "bookCount" in author
    assert "book_count" not in author
    assert "sortName" in author
    assert "sort_name" not in author
    assert isinstance(author["tags"], list)
    assert len(author["tags"]) > 0
    assert all("id" in t and "name" in t for t in author["tags"])


# ---------------------------------------------------------------------------
# GET /api/authors/{id}
# ---------------------------------------------------------------------------


def test_get_author_detail_wire(admin_client):
    resp = admin_client.get("/api/authors/1")
    assert resp.status_code == 200
    payload = resp.json()
    assert "author" in payload
    assert "books" in payload
    assert len(payload["books"]) > 0
    book = payload["books"][0]
    # camelCase card-level fields present (BookCardItem shape)
    assert "coverPath" in book
    assert "cover_path" not in book
    # authors as structured objects
    assert isinstance(book["authors"], list)
    assert len(book["authors"]) > 0
    assert all("id" in a and "name" in a for a in book["authors"])
    assert_no_legacy_csv_fields(book)


def test_author_detail_books_have_unified_card_shape(reader_client):
    """GET /api/authors/{id} books[] follows BookCardItem shape (no detail keys)."""
    response = reader_client.get("/api/authors/1")
    assert response.status_code == 200
    books = response.json().get("books", [])
    assert len(books) > 0
    book = books[0]
    expected = {
        "id", "title", "authors", "series", "seriesNumber",
        "coverPath", "rating", "isRead",
    }
    assert expected.issubset(book.keys()), f"missing: {expected - book.keys()}"
    forbidden = {
        "description", "publisher", "language", "pubDate", "isbn",
        "tags", "formats", "addedAt", "updatedAt", "sortTitle",
    }
    assert forbidden.isdisjoint(book.keys()), f"leaked: {forbidden & book.keys()}"


# ---------------------------------------------------------------------------
# GET /api/series
# ---------------------------------------------------------------------------


def test_get_series_wire(admin_client):
    resp = admin_client.get("/api/series")
    assert resp.status_code == 200
    payload = resp.json()
    assert "series" in payload
    assert len(payload["series"]) > 0
    s = payload["series"][0]
    assert "bookCount" in s
    assert "book_count" not in s
    assert isinstance(s["authors"], list)
    assert len(s["authors"]) > 0
    assert all("id" in a and "name" in a for a in s["authors"])


# ---------------------------------------------------------------------------
# GET /api/series/{id}
# ---------------------------------------------------------------------------


def test_get_series_detail_wire(admin_client):
    resp = admin_client.get("/api/series/1")
    assert resp.status_code == 200
    payload = resp.json()
    assert "series" in payload
    assert "books" in payload
    assert len(payload["books"]) > 0
    book = payload["books"][0]
    # camelCase card-level fields present (BookCardItem shape)
    assert "coverPath" in book
    assert "cover_path" not in book
    # authors as structured objects
    assert isinstance(book["authors"], list)
    assert len(book["authors"]) > 0
    assert all("id" in a and "name" in a for a in book["authors"])
    assert_no_legacy_csv_fields(book)


def test_series_detail_books_have_unified_card_shape(reader_client):
    """GET /api/series/{id} books[] follows BookCardItem shape (no detail keys)."""
    response = reader_client.get("/api/series/1")
    assert response.status_code == 200
    books = response.json().get("books", [])
    assert len(books) > 0
    book = books[0]
    expected = {
        "id", "title", "authors", "series", "seriesNumber",
        "coverPath", "rating", "isRead",
    }
    assert expected.issubset(book.keys()), f"missing: {expected - book.keys()}"
    forbidden = {
        "description", "publisher", "language", "pubDate", "isbn",
        "tags", "formats", "addedAt", "updatedAt", "sortTitle",
    }
    assert forbidden.isdisjoint(book.keys()), f"leaked: {forbidden & book.keys()}"


# ---------------------------------------------------------------------------
# GET /api/tags/{id}
# ---------------------------------------------------------------------------


def test_get_tag_wire(admin_client):
    resp = admin_client.get("/api/tags/1")
    assert resp.status_code == 200
    payload = resp.json()
    assert "tag" in payload
    assert "books" in payload
    tag = payload["tag"]
    assert "id" in tag
    assert "name" in tag
    assert len(payload["books"]) > 0
    book = payload["books"][0]
    # coverPath may be absent (exclude_none=True) when book has no cover —
    # but if present it must be camelCase, never snake_case
    assert "cover_path" not in book
    # authors as structured objects
    assert isinstance(book["authors"], list)
    assert len(book["authors"]) > 0
    assert all("id" in a and "name" in a for a in book["authors"])


def test_get_tag_books_no_legacy_fields(admin_client):
    payload = admin_client.get("/api/tags/1").json()
    assert len(payload["books"]) > 0
    for book in payload["books"]:
        assert_no_legacy_csv_fields(book)
        assert "tag_ids" not in book


def test_tag_detail_books_have_unified_card_shape(reader_client, tag_id):
    """GET /api/tags/{id} books[] follows BookCardItem shape (no detail keys)."""
    response = reader_client.get(f"/api/tags/{tag_id}")
    assert response.status_code == 200
    books = response.json().get("books", [])
    assert len(books) > 0
    book = books[0]
    expected = {
        "id", "title", "authors", "series", "seriesNumber",
        "coverPath", "rating", "isRead",
    }
    assert expected.issubset(book.keys()), f"missing: {expected - book.keys()}"
    forbidden = {
        "description", "publisher", "language", "pubDate", "isbn",
        "tags", "formats", "addedAt", "updatedAt", "sortTitle",
    }
    assert forbidden.isdisjoint(book.keys()), f"leaked: {forbidden & book.keys()}"


# ---------------------------------------------------------------------------
# GET /api/shelves/{id}
# ---------------------------------------------------------------------------


def test_get_shelf_wire(reader_client, db):
    from app.dal import shelves as shelves_dal
    shelf_id = shelves_dal.create_shelf(db, user_id=2, name="wire-test-shelf")
    shelves_dal.add_book_to_shelf(db, shelf_id, 1)
    db.commit()

    resp = reader_client.get(f"/api/shelves/{shelf_id}")
    assert resp.status_code == 200
    payload = resp.json()
    assert "books" in payload
    assert len(payload["books"]) > 0
    book = payload["books"][0]
    assert "coverPath" in book
    assert "cover_path" not in book
    assert isinstance(book["authors"], list)
    assert len(book["authors"]) > 0
    assert all("id" in a and "name" in a for a in book["authors"])


def test_get_shelf_books_no_legacy_fields(reader_client, db):
    from app.dal import shelves as shelves_dal
    shelf_id = shelves_dal.create_shelf(db, user_id=2, name="wire-test-shelf-2")
    shelves_dal.add_book_to_shelf(db, shelf_id, 2)
    db.commit()

    payload = reader_client.get(f"/api/shelves/{shelf_id}").json()
    assert len(payload["books"]) > 0
    for book in payload["books"]:
        assert_no_legacy_csv_fields(book)


# ---------------------------------------------------------------------------
# GET /api/upload — duplicate wire (via upload + seed match)
# ---------------------------------------------------------------------------


def test_upload_duplicate_authors_wire(admin_client):
    """Upload a file whose title matches a seeded book — duplicate.authors is list[{id,name}].

    minimal.fb2 has title "Minimal Test Book" and author "Test Author", which
    is an exact match against seeded Book 1; the duplicate path is deterministic.
    """
    from pathlib import Path
    fixtures = Path(__file__).resolve().parent / "fixtures" / "books"
    with open(fixtures / "minimal.fb2", "rb") as f:
        resp = admin_client.post(
            "/api/upload",
            files={"file": ("test.fb2", f, "application/octet-stream")},
        )
    assert resp.status_code == 200
    payload = resp.json()
    dup = payload.get("duplicate")
    assert dup is not None, "Seeded title match must surface a duplicate hit"
    assert isinstance(dup["authors"], list)
    assert len(dup["authors"]) > 0
    assert all("id" in a and "name" in a for a in dup["authors"])


# ---------------------------------------------------------------------------
# GET /api/search — books[].authors and series[].authors are structured
# ---------------------------------------------------------------------------


def test_search_books_authors_wire(admin_client):
    resp = admin_client.get("/api/search", params={"q": "Minimal"})
    assert resp.status_code == 200
    payload = resp.json()
    assert "books" in payload
    assert len(payload["books"]) > 0
    book = payload["books"][0]
    assert isinstance(book["authors"], list)
    assert len(book["authors"]) > 0
    assert all("id" in a and "name" in a for a in book["authors"])
    # camelCase keys in book hit
    assert "coverPath" in book
    assert "cover_path" not in book


def test_search_series_authors_wire(admin_client):
    resp = admin_client.get("/api/search", params={"q": "Test Series"})
    assert resp.status_code == 200
    payload = resp.json()
    assert "series" in payload
    assert len(payload["series"]) > 0
    series = payload["series"][0]
    assert isinstance(series["authors"], list)
    assert len(series["authors"]) > 0
    assert all("id" in a and "name" in a for a in series["authors"])
    # camelCase keys in series hit
    assert "bookCount" in series
    assert "book_count" not in series


def test_search_authors_book_count_wire(admin_client):
    resp = admin_client.get("/api/search", params={"q": "Test Author"})
    assert resp.status_code == 200
    payload = resp.json()
    assert "authors" in payload
    assert len(payload["authors"]) > 0
    author = payload["authors"][0]
    assert "bookCount" in author
    assert "book_count" not in author


def test_search_books_no_csv_author_fields(admin_client):
    resp = admin_client.get("/api/search", params={"q": "Minimal"})
    assert resp.status_code == 200
    for book in resp.json()["books"]:
        assert "author_ids" not in book
        assert "series_name" not in book
        assert "series_id" not in book


def test_catalog_books_have_unified_card_shape(reader_client):
    """GET /api/books returns BookCardItem (unified card-level shape).

    Catalog list response uses the same card contract as shelves/authors/series/tags
    list endpoints: minimal card-render fields, no detail-page fields.
    """
    response = reader_client.get("/api/books?pageSize=1")
    assert response.status_code == 200
    books = response.json()["books"]
    assert len(books) > 0, "seed must contain at least one book"
    book = books[0]
    # Card shape — all expected card keys present, AND no detail-page keys.
    expected_keys = {
        "id", "title", "authors", "series", "seriesNumber",
        "coverPath", "rating", "isRead",
    }
    assert expected_keys.issubset(book.keys()), f"missing keys: {expected_keys - book.keys()}"
    forbidden = {
        "description", "publisher", "language", "pubDate", "isbn",
        "tags", "formats", "addedAt", "updatedAt", "sortTitle",
    }
    assert forbidden.isdisjoint(book.keys()), f"unexpected detail keys leaked into card: {forbidden & book.keys()}"


def test_search_books_have_unified_card_shape(reader_client):
    """GET /api/search books[] follows BookCardItem shape (no detail keys)."""
    response = reader_client.get("/api/search", params={"q": "Minimal"})
    assert response.status_code == 200
    books = response.json().get("books", [])
    assert len(books) > 0
    book = books[0]
    expected = {
        "id", "title", "authors", "series", "seriesNumber",
        "coverPath", "rating", "isRead",
    }
    assert expected.issubset(book.keys()), f"missing: {expected - book.keys()}"
    forbidden = {
        "description", "publisher", "language", "pubDate", "isbn",
        "tags", "formats", "addedAt", "updatedAt", "sortTitle",
    }
    assert forbidden.isdisjoint(book.keys()), f"leaked: {forbidden & book.keys()}"
